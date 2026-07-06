// ── Device identification ──────────────────────────────────────────

pub const VENDOR_ID: u16 = 0x16D0;
pub const PRODUCT_ID: u16 = 0x10BC;
/// The HID interface used for configuration (not keyboard/mouse/joystick).
pub const CONFIG_INTERFACE: i32 = 4;
pub const CONFIG_USAGE_PAGE: u16 = 0xFF01;
pub const CONFIG_USAGE: u16 = 0x0101;

pub struct KnownDevice {
    pub name: &'static str,
    pub vendor_id: u16,
    pub product_id: u16,
}

pub static KNOWN_DEVICES: &[KnownDevice] = &[KnownDevice {
    name: "Azeron Keypad",
    vendor_id: VENDOR_ID,
    product_id: PRODUCT_ID,
}];

/// Number of programmable buttons on the Azeron Cyborg.
pub const BUTTON_COUNT: usize = 38;

// ── Pin mappings (button ID → hardware pins) ──────────────────────

pub fn button_pins(id: u8) -> [u8; 2] {
    match id {
        1 => [26, 255],
        2 => [25, 255],
        3 => [24, 255],
        4 => [23, 255],
        5 => [22, 255],
        6 => [21, 255],
        7 => [20, 255],
        8 => [19, 255],
        9 => [27, 255],
        10 => [0, 255],
        11 => [1, 255],
        12 => [2, 255],
        13 => [3, 255],
        14 => [4, 255],
        15 => [5, 255],
        16 => [8, 255],
        17 => [9, 255],
        18 => [10, 255],
        19 => [11, 255],
        20 => [12, 255],
        21 => [14, 13],
        22 => [38, 255],
        23 => [18, 255],
        24..=27 => [39, 40], // analog joystick directions
        28 => [42, 255],
        29 => [43, 255],
        30 => [44, 255],
        31 => [45, 255],
        32..=35 => [39, 40], // analog joystick directions
        36 => [7, 255],
        37 => [17, 255],
        38 => [41, 255],
        _ => [0, 0],
    }
}

// ── Button types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum ButtonType {
    KeyboardKey = 1,
    Switch = 2,
    AnalogJoystick = 3,
    AnalogJoystickWithKeys = 4,
    JoystickButton = 5,
    Disabled = 6,
    MouseButton = 15,
    Macro = 16,
    SwitchProfile = 24,
}
