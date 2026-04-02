/**
 * Azeron Cyborg device identity and hardware constants.
 * Mirrors devices/azeron-cyborg.toml and crates/dumbwasd-core/src/devices/azeron.rs.
 */

export const VENDOR_ID = 0x16D0;
export const PRODUCT_ID = 0x10BC;
export const FRIENDLY_NAME = "Azeron Cyborg";
export const BUTTON_COUNT = 38;

export const RAW_NAME_ALIASES = [
  "Azeron LTD Azeron Keypad",
  "Azeron Keypad",
] as const;

export const CAPABILITIES = ["keyboard", "mouse", "joystick"] as const;

/** Joystick center value from the HID report (raw ADC midpoint). */
export const JOYSTICK_CENTER = 512;

/** Half-span of the joystick range used for normalization. */
export const JOYSTICK_SPAN = 512;
