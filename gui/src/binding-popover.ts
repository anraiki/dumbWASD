import {
  getMappingTargetLabel,
  getInputCodeFromKeyboardEvent,
  getMappingTargetFromPointerButton,
  isModifierInputCode,
  normalizeShortcutModifiers,
  type MappingTarget,
} from "./input-codes";

interface BindingPopoverButton {
  code: number;
  label: string;
}

interface BindingPopoverOptions {
  anchorEl: Element;
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
  let currentAnchorEl: Element | null = null;
  let currentSelection: MappingTarget | null = null;
  let currentError = "";
  let pending = false;
  let listening = false;
  let captureModifiers = new Set<number>();
  let modifierOnlyCandidate: number | null = null;

  const handlePointerDown = (event: PointerEvent) => {
    if (!currentOptions) {
      return;
    }

    const target = event.target as Node | null;
    const captureEl = popover.querySelector<HTMLElement>(".binding-popover-capture");
    if (
      listening
      && target
      && captureEl?.contains(target)
    ) {
      const nextBinding = getMappingTargetFromPointerButton(event.button);
      if (nextBinding) {
        event.preventDefault();
        event.stopPropagation();
        currentSelection = nextBinding;
        currentError = "";
        stopListening();
        render();
        positionPopover();
      }
      return;
    }

    if (target && (popover.contains(target) || currentAnchorEl?.contains(target))) {
      return;
    }

    stopListening();
    close();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!currentOptions) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (listening) {
        stopListening();
        render();
        positionPopover();
        return;
      }
      close();
      return;
    }

    if (!listening || pending) {
      return;
    }

    const code = getInputCodeFromKeyboardEvent(event);
    if (!code) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (isModifierInputCode(code)) {
      if (!event.repeat) {
        captureModifiers.add(code);
        modifierOnlyCandidate = code;
        currentError = "";
        render();
        positionPopover();
      }
      return;
    }

    const modifiers = normalizeShortcutModifiers([...captureModifiers]);
    currentSelection = modifiers.length > 0
      ? { type: "shortcut", modifiers, key: code }
      : { type: "key", code };
    currentError = "";
    stopListening();
    render();
    positionPopover();
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (!currentOptions || !listening || pending) {
      return;
    }

    const code = getInputCodeFromKeyboardEvent(event);
    if (!code || !isModifierInputCode(code)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (modifierOnlyCandidate === code && captureModifiers.size === 1) {
      currentSelection = { type: "key", code };
      currentError = "";
      stopListening();
      render();
      positionPopover();
      return;
    }

    captureModifiers.delete(code);
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

    const activeLabel = getMappingTargetLabel(currentSelection);
    const captureTitle = listening
      ? captureModifiers.size
        ? `${normalizeShortcutModifiers([...captureModifiers])
          .map((code) => getMappingTargetLabel({ type: "key", code }))
          .join(" + ")} + ...`
        : "Press a key, shortcut, or mouse button"
      : activeLabel;
    const captureHint = listening
      ? "Press another key to finish a shortcut, or press Esc to cancel."
      : "Click here, then press a key, shortcut, or mouse button.";
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
        <button
          type="button"
          class="binding-popover-capture"
          ${pending ? "disabled" : ""}
          ${listening ? 'data-listening="true"' : ""}
        >
          <span class="binding-popover-capture-value">${captureTitle}</span>
          <span class="binding-popover-capture-hint">${captureHint}</span>
        </button>
      </label>
      <p class="binding-popover-help">
        This writes a direct profile remap for the selected button.
      </p>
      <p class="binding-popover-error" ${currentError ? "" : "hidden"}>${currentError}</p>
      <div class="binding-popover-actions">
        <button type="button" class="btn binding-popover-reset"${options.currentBinding ? "" : " disabled"}>Reset</button>
        <div class="binding-popover-action-group">
          <button type="button" class="btn binding-popover-cancel">Cancel</button>
          <button type="button" class="btn binding-popover-save"${currentSelection ? "" : " disabled"}>Save</button>
        </div>
      </div>
    `;

    const titleEl = popover.querySelector<HTMLElement>(".binding-popover-title");
    const closeBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-close");
    const previewValueEl = popover.querySelector<HTMLElement>(".binding-popover-preview-value");
    const captureButtonEl = popover.querySelector<HTMLButtonElement>(".binding-popover-capture");
    const errorEl = popover.querySelector<HTMLElement>(".binding-popover-error");
    const resetBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-reset");
    const cancelBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-cancel");
    const saveBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-save");

    if (
      !titleEl
      || !closeBtn
      || !previewValueEl
      || !captureButtonEl
      || !errorEl
      || !resetBtn
      || !cancelBtn
      || !saveBtn
    ) {
      return;
    }

    titleEl.textContent = options.button.label;
    closeBtn.disabled = pending;
    cancelBtn.disabled = pending;
    resetBtn.disabled = pending || !options.currentBinding;
    saveBtn.disabled = pending || !currentSelection;
    previewValueEl.textContent = activeLabel;
    errorEl.hidden = !currentError;
    errorEl.textContent = currentError;

    closeBtn.addEventListener("click", () => close());
    cancelBtn.addEventListener("click", () => close());
    captureButtonEl.addEventListener("click", () => {
      if (pending) {
        return;
      }

      if (listening) {
        stopListening();
      } else {
        startListening();
      }
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
      if (!currentSelection) {
        return;
      }

      const nextBinding = currentSelection;
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
    stopListening();
    currentOptions = null;
    currentButtonCode = null;
    currentAnchorEl = null;
    currentSelection = null;
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
    currentSelection = options.currentBinding ? { ...options.currentBinding } : null;
    currentError = "";
    pending = false;
    stopListening();
    layer.hidden = false;
    render();
    positionPopover();
  }

  function startListening() {
    listening = true;
    captureModifiers = new Set<number>();
    modifierOnlyCandidate = null;
  }

  function stopListening() {
    listening = false;
    captureModifiers.clear();
    modifierOnlyCandidate = null;
  }

  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
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
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
      layer.remove();
    },
  };
}
