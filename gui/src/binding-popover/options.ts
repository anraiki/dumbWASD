import { renderOverrideField, wireOverrideField } from "./override-field";
import { renderRepeatField, wireRepeatField } from "./repeat-field";
import { renderToggleField, wireToggleField } from "./toggle-field";
import type { PopoverContext, PopoverState } from "./types";

/// The switch rows under the binding controls, in the order they read:
/// Turbo (how fast it fires), Toggle (whether it latches), Override
/// (whether it takes the output for itself).
///
/// Each row is label-only — the explanations live in the info overlay.
export function renderOptionFields(state: PopoverState): string {
  return [renderRepeatField(state), renderToggleField(state), renderOverrideField(state)].join("");
}

export function wireOptionFields(ctx: PopoverContext) {
  wireRepeatField(ctx);
  wireToggleField(ctx);
  wireOverrideField(ctx);
}
