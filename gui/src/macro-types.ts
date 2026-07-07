/**
 * Wire types shared with the Rust core (`core::macros::SavedMacro`,
 * `core::profile::MacroStep`). Used by the macro studio, the bind popover,
 * and profile mappings that embed macro snapshots.
 */

export type MacroStepDto =
  | { type: "key_down"; code: number }
  | { type: "key_up"; code: number }
  | { type: "key_tap"; code: number }
  | { type: "mouse_button"; code: number; pressed: boolean }
  | { type: "delay"; ms: number }
  | { type: "rumble"; ms: number };

export type MacroTriggerMode = "hold_until_release" | "execute_at_once";

export interface SavedMacro {
  id: string;
  name: string;
  trigger_mode: MacroTriggerMode;
  lead_in_ms: number;
  iterations: number;
  pause_between_iterations_ms: number;
  /** Delay inserted between consecutive input steps during playback. */
  key_delay_ms: number;
  steps: MacroStepDto[];
}
