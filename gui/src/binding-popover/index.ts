import { invoke } from "@tauri-apps/api/core";
import type { SavedMacro } from "../macro-types";
import { createCaptureHandlers } from "./capture";
import { positionPopover as positionPopoverImpl } from "./position";
import { renderPopover } from "./render";
import type {
  BindingPopoverController,
  BindingPopoverOptions,
  PopoverContext,
  PopoverState,
} from "./types";

export type { BindingPopoverController } from "./types";

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

  const state: PopoverState = {
    currentOptions: null,
    currentButtonCode: null,
    currentAnchorEl: null,
    currentSelection: null,
    currentError: "",
    pending: false,
    listening: false,
    captureModifiers: new Set<number>(),
    modifierOnlyCandidate: null,
    savedMacros: [],
    macroLibraryLoaded: false,
  };

  const ctx: PopoverContext = {
    popover,
    state,
    render: () => renderPopover(ctx),
    positionPopover: () => positionPopoverImpl(ctx),
    close,
    startListening,
    stopListening,
    runAction,
  };

  const { handlePointerDown, handleKeyDown, handleKeyUp } = createCaptureHandlers(ctx);

  const handleWindowChange = () => {
    if (!state.currentOptions) {
      return;
    }

    if (!state.currentAnchorEl || !state.currentAnchorEl.isConnected) {
      close();
      return;
    }

    ctx.positionPopover();
  };

  async function runAction(action: () => Promise<void>) {
    state.pending = true;
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();

    try {
      await action();
    } catch (error) {
      state.currentError = error instanceof Error ? error.message : String(error);
      state.pending = false;
      ctx.render();
      ctx.positionPopover();
      return;
    }

    state.pending = false;
  }

  function close() {
    if (!state.currentOptions) {
      return;
    }

    const onClose = state.currentOptions.onClose;
    stopListening();
    state.currentOptions = null;
    state.currentButtonCode = null;
    state.currentAnchorEl = null;
    state.currentSelection = null;
    state.currentError = "";
    state.pending = false;
    popover.hidden = true;
    layer.hidden = true;
    popover.innerHTML = "";
    onClose?.();
  }

  function open(options: BindingPopoverOptions) {
    state.currentOptions = options;
    state.currentButtonCode = options.button.code;
    state.currentAnchorEl = options.anchorEl;
    state.currentSelection = options.currentBinding ? { ...options.currentBinding } : null;
    state.currentError = "";
    state.pending = false;
    stopListening();
    layer.hidden = false;
    ctx.render();
    ctx.positionPopover();

    void invoke<SavedMacro[]>("list_macros")
      .then((entries) => {
        state.savedMacros = entries.map((entry) => ({ ...entry, name: entry.name || entry.id }));
        state.macroLibraryLoaded = true;
        if (state.currentOptions === options) {
          ctx.render();
          ctx.positionPopover();
        }
      })
      .catch(() => {
        // Library unavailable - the macro select just stays empty.
      });
  }

  function startListening() {
    state.listening = true;
    state.captureModifiers = new Set<number>();
    state.modifierOnlyCandidate = null;
  }

  function stopListening() {
    state.listening = false;
    state.captureModifiers.clear();
    state.modifierOnlyCandidate = null;
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
      return state.currentButtonCode === code;
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
