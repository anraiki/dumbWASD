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
      // The help overlay is the thing on top, so Escape backs out of that
      // first and leaves the binding alone.
      if (state.showInfo) {
        state.showInfo = false;
        ctx.render();
        ctx.positionPopover();
        return;
      }
      // Capture is armed for as long as the popover is open, so there is no
      // "disarm" step to cancel into — Escape dismisses outright, discarding
      // whatever was captured but not saved.
      ctx.close();
      return;
    }

    // Reading the help must not rebind the button under it.
    if (state.showInfo || !state.listening || state.pending) {
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
    // Stay armed rather than disarming, so a wrong capture can be replaced
    // by simply pressing again. Nothing reaches the profile until Save.
    ctx.startListening();
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
      // Tapping a modifier on its own binds that modifier — but capture
      // stays armed, so holding it and adding a key next replaces this with
      // the full shortcut. Disarming here was what made "Alt then A" stick
      // as a bare "Left Alt".
      state.currentSelection = { type: "key", code };
      state.currentError = "";
      ctx.startListening();
      ctx.render();
      ctx.positionPopover();
      return;
    }

    state.captureModifiers.delete(code);
  };

  return { handlePointerDown, handleKeyDown, handleKeyUp };
}
