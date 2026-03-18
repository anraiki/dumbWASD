import {
  MAPPING_TARGET_OPTIONS,
  getMappingTargetLabel,
  type MappingTarget,
} from "./input-codes";

interface BindingPopoverButton {
  code: number;
  label: string;
}

interface BindingPopoverOptions {
  anchorEl: HTMLElement;
  button: BindingPopoverButton;
  currentBinding: MappingTarget | null;
  onSave(nextBinding: MappingTarget): Promise<void> | void;
  onReset(): Promise<void> | void;
  onClose?(): void;
}

export interface BindingPopoverController {
  open(options: BindingPopoverOptions): void;
  close(): void;
  isOpenFor(code: number): boolean;
  destroy(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toSelectValue(binding: MappingTarget | null): string {
  if (!binding) {
    return "";
  }

  return `${binding.type}:${binding.code}`;
}

function fromSelectValue(value: string): MappingTarget | null {
  if (!value) {
    return null;
  }

  const [type, codeText] = value.split(":");
  const code = Number(codeText);
  if (!Number.isFinite(code) || (type !== "key" && type !== "mouse_button")) {
    return null;
  }

  return { type, code };
}

export function createBindingPopover(): BindingPopoverController {
  const layer = document.createElement("div");
  layer.className = "binding-popover-layer";
  layer.hidden = true;

  const popover = document.createElement("section");
  popover.className = "binding-popover";
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.setAttribute("aria-label", "Button binding");

  layer.appendChild(popover);
  document.body.appendChild(layer);

  let currentOptions: BindingPopoverOptions | null = null;
  let currentButtonCode: number | null = null;
  let currentAnchorEl: HTMLElement | null = null;
  let currentSelection = "";
  let currentError = "";
  let pending = false;

  const handlePointerDown = (event: PointerEvent) => {
    if (!currentOptions) {
      return;
    }

    const target = event.target as Node | null;
    if (target && (popover.contains(target) || currentAnchorEl?.contains(target))) {
      return;
    }

    close();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!currentOptions) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  const handleWindowChange = () => {
    if (!currentOptions) {
      return;
    }

    if (!currentAnchorEl || !currentAnchorEl.isConnected) {
      close();
      return;
    }

    positionPopover();
  };

  function render() {
    const options = currentOptions;
    if (!options) {
      return;
    }

    const activeLabel = getMappingTargetLabel(fromSelectValue(currentSelection));
    popover.innerHTML = `
      <div class="binding-popover-header">
        <div class="binding-popover-kicker">View binding</div>
        <button type="button" class="binding-popover-close" aria-label="Close binding editor">&times;</button>
      </div>
      <div class="binding-popover-title-row">
        <div>
          <h2 class="binding-popover-title"></h2>
          <p class="binding-popover-subtitle">Single-press remap for button #${options.button.code}</p>
        </div>
        <span class="binding-popover-badge">Legacy mapping</span>
      </div>
      <div class="binding-popover-preview">
        <span class="binding-popover-preview-label">Output</span>
        <strong class="binding-popover-preview-value">${activeLabel}</strong>
      </div>
      <label class="binding-popover-field">
        <span class="binding-popover-field-label">Bind to</span>
        <select class="binding-popover-select"></select>
      </label>
      <p class="binding-popover-help">
        This writes a direct profile remap for the selected button.
      </p>
      <p class="binding-popover-error" ${currentError ? "" : "hidden"}>${currentError}</p>
      <div class="binding-popover-actions">
        <button type="button" class="btn binding-popover-reset"${options.currentBinding ? "" : " disabled"}>Reset</button>
        <div class="binding-popover-action-group">
          <button type="button" class="btn binding-popover-cancel">Cancel</button>
          <button type="button" class="btn binding-popover-save"${fromSelectValue(currentSelection) ? "" : " disabled"}>Save</button>
        </div>
      </div>
    `;

    const titleEl = popover.querySelector<HTMLElement>(".binding-popover-title");
    const closeBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-close");
    const previewValueEl = popover.querySelector<HTMLElement>(".binding-popover-preview-value");
    const selectEl = popover.querySelector<HTMLSelectElement>(".binding-popover-select");
    const errorEl = popover.querySelector<HTMLElement>(".binding-popover-error");
    const resetBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-reset");
    const cancelBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-cancel");
    const saveBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-save");

    if (!titleEl || !closeBtn || !previewValueEl || !selectEl || !errorEl || !resetBtn || !cancelBtn || !saveBtn) {
      return;
    }

    titleEl.textContent = options.button.label;

    selectEl.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an output…";
    selectEl.appendChild(placeholder);

    const groupedOptions = new Map<string, HTMLOptGroupElement>();
    for (const option of MAPPING_TARGET_OPTIONS) {
      let group = groupedOptions.get(option.group);
      if (!group) {
        group = document.createElement("optgroup");
        group.label = option.group;
        groupedOptions.set(option.group, group);
        selectEl.appendChild(group);
      }

      const optionEl = document.createElement("option");
      optionEl.value = `${option.type}:${option.code}`;
      optionEl.textContent = option.label;
      group.appendChild(optionEl);
    }

    selectEl.value = currentSelection;
    selectEl.disabled = pending;
    closeBtn.disabled = pending;
    cancelBtn.disabled = pending;
    resetBtn.disabled = pending || !options.currentBinding;
    saveBtn.disabled = pending || !fromSelectValue(currentSelection);
    previewValueEl.textContent = activeLabel;
    errorEl.hidden = !currentError;
    errorEl.textContent = currentError;

    closeBtn.addEventListener("click", () => close());
    cancelBtn.addEventListener("click", () => close());
    selectEl.addEventListener("change", () => {
      currentSelection = selectEl.value;
      currentError = "";
      render();
      positionPopover();
    });
    resetBtn.addEventListener("click", () => {
      void runAction(async () => {
        await options.onReset();
        close();
      });
    });
    saveBtn.addEventListener("click", () => {
      const nextBinding = fromSelectValue(currentSelection);
      if (!nextBinding) {
        return;
      }

      void runAction(async () => {
        await options.onSave(nextBinding);
        close();
      });
    });
  }

  async function runAction(action: () => Promise<void>) {
    pending = true;
    currentError = "";
    render();
    positionPopover();

    try {
      await action();
    } catch (error) {
      currentError = error instanceof Error ? error.message : String(error);
      pending = false;
      render();
      positionPopover();
      return;
    }

    pending = false;
  }

  function positionPopover() {
    if (!currentOptions || !currentAnchorEl) {
      return;
    }

    const anchorRect = currentAnchorEl.getBoundingClientRect();
    if (!anchorRect.width || !anchorRect.height) {
      return;
    }

    popover.hidden = false;
    const { width: panelWidth, height: panelHeight } = popover.getBoundingClientRect();
    const margin = 16;
    const gap = 20;

    const canFitRight = anchorRect.right + gap + panelWidth + margin <= window.innerWidth;
    const canFitLeft = anchorRect.left - gap - panelWidth - margin >= 0;
    const side = canFitRight || !canFitLeft ? "right" : "left";

    const top = clamp(
      anchorRect.top + anchorRect.height / 2 - panelHeight / 2,
      margin,
      window.innerHeight - panelHeight - margin,
    );
    const left = side === "right"
      ? Math.min(anchorRect.right + gap, window.innerWidth - panelWidth - margin)
      : Math.max(anchorRect.left - panelWidth - gap, margin);
    const anchorOffset = clamp(
      anchorRect.top + anchorRect.height / 2 - top,
      28,
      Math.max(panelHeight - 28, 28),
    );

    popover.dataset.side = side;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.setProperty("--binding-popover-anchor-offset", `${anchorOffset}px`);
  }

  function close() {
    if (!currentOptions) {
      return;
    }

    const onClose = currentOptions.onClose;
    currentOptions = null;
    currentButtonCode = null;
    currentAnchorEl = null;
    currentSelection = "";
    currentError = "";
    pending = false;
    popover.hidden = true;
    layer.hidden = true;
    popover.innerHTML = "";
    onClose?.();
  }

  function open(options: BindingPopoverOptions) {
    currentOptions = options;
    currentButtonCode = options.button.code;
    currentAnchorEl = options.anchorEl;
    currentSelection = toSelectValue(options.currentBinding);
    currentError = "";
    pending = false;
    layer.hidden = false;
    render();
    positionPopover();
  }

  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("resize", handleWindowChange);
  window.addEventListener("scroll", handleWindowChange, true);

  return {
    open,
    close,
    isOpenFor(code: number) {
      return currentButtonCode === code;
    },
    destroy() {
      close();
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      layer.remove();
    },
  };
}
