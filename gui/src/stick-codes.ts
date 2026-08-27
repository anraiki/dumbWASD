/**
 * TypeScript mirror of the synthetic analog-stick button codes defined in
 * `dumbwasd-core` (`core/sticks/mod.rs`).
 *
 * A thumbstick reports continuous axis values, but bindings are keyed by
 * button code. The core tracker converts stick motion into press/release
 * events on these reserved codes, which sit above evdev's `KEY_MAX` (0x2FF)
 * so they can never collide with a real code from a device.
 *
 * Keep the values in sync with `STICK_CODE_BASE` in core.
 */

export const STICK_CODE_BASE = 0xf000;
export const STICK_CODE_COUNT = 8;

export const STICK_CODES = {
  LSTICK_UP: 0xf000,
  LSTICK_DOWN: 0xf001,
  LSTICK_LEFT: 0xf002,
  LSTICK_RIGHT: 0xf003,
  RSTICK_UP: 0xf004,
  RSTICK_DOWN: 0xf005,
  RSTICK_LEFT: 0xf006,
  RSTICK_RIGHT: 0xf007,
} as const;

export type StickCodeKey = keyof typeof STICK_CODES;

export const STICK_LABELS: Record<StickCodeKey, string> = {
  LSTICK_UP: "Left Stick Up",
  LSTICK_DOWN: "Left Stick Down",
  LSTICK_LEFT: "Left Stick Left",
  LSTICK_RIGHT: "Left Stick Right",
  RSTICK_UP: "Right Stick Up",
  RSTICK_DOWN: "Right Stick Down",
  RSTICK_LEFT: "Right Stick Left",
  RSTICK_RIGHT: "Right Stick Right",
};

export function isStickCode(code: number): boolean {
  return code >= STICK_CODE_BASE && code < STICK_CODE_BASE + STICK_CODE_COUNT;
}

/** Label for a synthetic stick code, or null when the code is not one. */
export function getStickLabel(code: number): string | null {
  for (const key of Object.keys(STICK_CODES) as StickCodeKey[]) {
    if (STICK_CODES[key] === code) {
      return STICK_LABELS[key];
    }
  }
  return null;
}
