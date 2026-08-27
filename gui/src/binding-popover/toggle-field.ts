import type { PopoverContext, PopoverState } from "./types";
import { renderSwitchRow } from "./utils";

/// The Toggle switch: latch the binding so one press activates it and the
/// next press releases it, instead of following the button.
export function renderToggleField(state: PopoverState): string {
  // Macro bindings already carry their own toggle/hold behaviour, driven by
  // the macro runner rather than the output router.
  if (!state.currentSelection || state.currentSelection.type === "macro") {
    return "";
  }

  return renderSwitchRow({
    id: "binding-popover-toggle-switch",
    label: "Toggle",
    checked: state.currentToggle,
    disabled: state.pending,
    inputClass: "binding-popover-toggle-enabled",
  });
}

export function wireToggleField(ctx: PopoverContext) {
  const { popover, state } = ctx;

  const toggle = popover.querySelector<HTMLInputElement>(".binding-popover-toggle-enabled");
  toggle?.addEventListener("change", () => {
    state.currentToggle = toggle.checked;
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  });
}
