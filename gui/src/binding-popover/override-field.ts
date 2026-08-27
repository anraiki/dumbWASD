import type { PopoverContext, PopoverState } from "./types";
import { renderSwitchRow } from "./utils";

/// The Override toggle: while this binding is held it claims the output and
/// every other binding is released, so a chord cannot be polluted by keys
/// something else is already holding down. The user-facing explanation lives
/// in the info panel rather than inline, to keep the popover compact.
export function renderOverrideField(state: PopoverState): string {
  // Macro playback is driven by its own runner rather than the output
  // arbiter, so the toggle would not mean anything there.
  if (!state.currentSelection || state.currentSelection.type === "macro") {
    return "";
  }

  return renderSwitchRow({
    id: "binding-popover-override-switch",
    label: "Override",
    checked: state.currentExclusive,
    disabled: state.pending,
    inputClass: "binding-popover-override-enabled",
  });
}

export function wireOverrideField(ctx: PopoverContext) {
  const { popover, state } = ctx;

  const toggle = popover.querySelector<HTMLInputElement>(".binding-popover-override-enabled");
  toggle?.addEventListener("change", () => {
    state.currentExclusive = toggle.checked;
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  });
}
