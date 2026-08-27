import type { PopoverContext, PopoverState } from "./types";
import { renderSwitchRow } from "./utils";

/// Turbo interval bounds. Each tick fires the whole chord, so anything
/// faster than the floor floods the receiving application. Core enforces the
/// same floor, so a hand-edited profile cannot undercut it.
export const DEFAULT_REPEAT_MS = 100;
const MIN_REPEAT_MS = 100;
const MAX_REPEAT_MS = 10000;

/// Turbo only applies to chords. A plain key already repeats at the host's
/// own rate for as long as it is held down, so offering the control there
/// would just be a second, conflicting answer.
function shortcutSelection(state: PopoverState) {
  return state.currentSelection?.type === "shortcut" ? state.currentSelection : null;
}

export function renderRepeatField(state: PopoverState): string {
  const selection = shortcutSelection(state);
  if (!selection) {
    return "";
  }

  const enabled = typeof selection.repeat_ms === "number";
  // The interval stays in place when Turbo is off so the row does not
  // reflow as it is switched — just muted, to show it is inert.
  const muted = !enabled || state.pending;
  const interval = `<span class="binding-popover-repeat-interval${muted ? " is-muted" : ""}">
      <input
        type="number"
        class="binding-popover-repeat-ms"
        min="${MIN_REPEAT_MS}"
        max="${MAX_REPEAT_MS}"
        step="10"
        value="${selection.repeat_ms ?? DEFAULT_REPEAT_MS}"
        aria-label="Turbo interval in milliseconds"
        ${muted ? "disabled" : ""}
      /><span class="binding-popover-switch-unit">ms</span>
    </span>`;

  return renderSwitchRow({
    id: "binding-popover-repeat-switch",
    label: "Turbo",
    checked: enabled,
    disabled: state.pending,
    inputClass: "binding-popover-repeat-enabled",
    aside: interval,
  });
}

export function wireRepeatField(ctx: PopoverContext) {
  const { popover, state } = ctx;

  const rerender = () => {
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  };

  const enabledEl = popover.querySelector<HTMLInputElement>(".binding-popover-repeat-enabled");
  enabledEl?.addEventListener("change", () => {
    const selection = shortcutSelection(state);
    if (!selection) {
      return;
    }

    // Turning it off drops the key entirely rather than storing a disabled
    // value, so a held binding round-trips through TOML unchanged.
    const { repeat_ms: _off, ...held } = selection;
    state.currentSelection = enabledEl.checked
      ? { ...held, repeat_ms: DEFAULT_REPEAT_MS }
      : held;
    rerender();
  });

  const msEl = popover.querySelector<HTMLInputElement>(".binding-popover-repeat-ms");
  msEl?.addEventListener("change", () => {
    const selection = shortcutSelection(state);
    if (!selection) {
      return;
    }

    const parsed = Number.parseInt(msEl.value, 10);
    const clamped = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, MIN_REPEAT_MS), MAX_REPEAT_MS)
      : DEFAULT_REPEAT_MS;

    state.currentSelection = { ...selection, repeat_ms: clamped };
    rerender();
  });
}
