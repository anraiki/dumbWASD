import {
  getInputCodeFromKeyboardEvent,
  getMappingTargetFromPointerButton,
  isModifierInputCode,
  normalizeShortcutModifiers,
} from "../input-codes";
import type { PopoverContext } from "./types";

export interface CaptureHandlers {
  handlePointerDown(event: PointerEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
  handleKeyUp(event: KeyboardEvent): void;
}

export function createCaptureHandlers(ctx: PopoverContext): CaptureHandlers {
  const { popover, state } = ctx;

  const handlePointerDown = (event: PointerEvent) => {
    if (!state.currentOptions) {
      return;
    }

    const target = event.target as Node | null;
    const captureEl = popover.querySelector<HTMLElement>(".binding-popover-capture");
    if (
      state.listening
      && target
      && captureEl?.contains(target)
    ) {
      const nextBinding = getMappingTargetFromPointerButton(event.button);
      if (nextBinding) {
        event.preventDefault();
        event.stopPropagation();
        state.currentSelection = nextBinding;
        state.currentError = "";
        ctx.stopListening();
        ctx.render();
        ctx.positionPopover();
      }
      return;
    }

    if (target && (popover.contains(target) || state.currentAnchorEl?.contains(target))) {
      return;
    }

    ctx.stopListening();
    ctx.close();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!state.currentOptions) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (state.listening) {
        ctx.stopListening();
        ctx.render();
        ctx.positionPopover();
        return;
      }
      ctx.close();
      return;
    }

    if (!state.listening || state.pending) {
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
        state.captureModifiers.add(code);
        state.modifierOnlyCandidate = code;
        state.currentError = "";
        ctx.render();
        ctx.positionPopover();
      }
      return;
    }

    const modifiers = normalizeShortcutModifiers([...state.captureModifiers]);
    state.currentSelection = modifiers.length > 0
      ? { type: "shortcut", modifiers, key: code }
      : { type: "key", code };
    state.currentError = "";
    ctx.stopListening();
    ctx.render();
    ctx.positionPopover();
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (!state.currentOptions || !state.listening || state.pending) {
      return;
    }

    const code = getInputCodeFromKeyboardEvent(event);
    if (!code || !isModifierInputCode(code)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (state.modifierOnlyCandidate === code && state.captureModifiers.size === 1) {
      state.currentSelection = { type: "key", code };
      state.currentError = "";
      ctx.stopListening();
      ctx.render();
      ctx.positionPopover();
      return;
    }

    state.captureModifiers.delete(code);
  };

  return { handlePointerDown, handleKeyDown, handleKeyUp };
}
