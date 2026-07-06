// ── Azeron device key codes ────────────────────────────────────────
// These are the Azeron's internal key codes (not evdev codes).
// Format: base + USB HID usage ID. Keyboard keys start at 61440 + 4 = 61444.

pub fn azeron_key_code(name: &str) -> Option<u32> {
    match name.to_uppercase().as_str() {
        "A" => Some(61444),
        "B" => Some(61445),
        "C" => Some(61446),
        "D" => Some(61447),
        "E" => Some(61448),
        "F" => Some(61449),
        "G" => Some(61450),
        "H" => Some(61451),
        "I" => Some(61452),
        "J" => Some(61453),
        "K" => Some(61454),
        "L" => Some(61455),
        "M" => Some(61456),
        "N" => Some(61457),
        "O" => Some(61458),
        "P" => Some(61459),
        "Q" => Some(61460),
        "R" => Some(61461),
        "S" => Some(61462),
        "T" => Some(61463),
        "U" => Some(61464),
        "V" => Some(61465),
        "W" => Some(61466),
        "X" => Some(61467),
        "Y" => Some(61468),
        "Z" => Some(61469),
        "1" => Some(61470),
        "2" => Some(61471),
        "3" => Some(61472),
        "4" => Some(61473),
        "5" => Some(61474),
        "6" => Some(61475),
        "7" => Some(61476),
        "8" => Some(61477),
        "9" => Some(61478),
        "0" => Some(61479),
        "ENTER" => Some(61480),
        "ESC" => Some(61481),
        "BACKSPACE" => Some(61482),
        "TAB" => Some(61483),
        "SPACE" => Some(61484),
        "MINUS" => Some(61485),
        "EQUAL" => Some(61486),
        "LEFT_BRACE" | "[" => Some(61487),
        "RIGHT_BRACE" | "]" => Some(61488),
        "BACKSLASH" | "\\" => Some(61489),
        "SEMICOLON" | ";" => Some(61491),
        "QUOTE" | "'" => Some(61492),
        "TILDE" | "`" => Some(61493),
        "COMMA" | "," => Some(61494),
        "PERIOD" | "." => Some(61495),
        "SLASH" | "/" => Some(61496),
        "CAPS_LOCK" => Some(61497),
        "F1" => Some(61498),
        "F2" => Some(61499),
        "F3" => Some(61500),
        "F4" => Some(61501),
        "F5" => Some(61502),
        "F6" => Some(61503),
        "F7" => Some(61504),
        "F8" => Some(61505),
        "F9" => Some(61506),
        "F10" => Some(61507),
        "F11" => Some(61508),
        "F12" => Some(61509),
        "F13" => Some(61544),
        "F14" => Some(61545),
        "F15" => Some(61546),
        "F16" => Some(61547),
        "F17" => Some(61548),
        "F18" => Some(61549),
        "F19" => Some(61550),
        "F20" => Some(61551),
        "F21" => Some(61552),
        "F22" => Some(61553),
        "F23" => Some(61554),
        "F24" => Some(61555),
        "PRINTSCREEN" => Some(61510),
        "SCROLL_LOCK" => Some(61511),
        "PAUSE" => Some(61512),
        "INSERT" => Some(61513),
        "HOME" => Some(61514),
        "PAGE_UP" => Some(61515),
        "DELETE" => Some(61516),
        "END" => Some(61517),
        "PAGE_DOWN" => Some(61518),
        "RIGHT" => Some(61519),
        "LEFT" => Some(61520),
        "DOWN" => Some(61521),
        "UP" => Some(61522),
        "NUM_LOCK" => Some(61523),
        _ => None,
    }
}

pub fn azeron_key_name(code: u32) -> &'static str {
    match code {
        61444 => "A",
        61445 => "B",
        61446 => "C",
        61447 => "D",
        61448 => "E",
        61449 => "F",
        61450 => "G",
        61451 => "H",
        61452 => "I",
        61453 => "J",
        61454 => "K",
        61455 => "L",
        61456 => "M",
        61457 => "N",
        61458 => "O",
        61459 => "P",
        61460 => "Q",
        61461 => "R",
        61462 => "S",
        61463 => "T",
        61464 => "U",
        61465 => "V",
        61466 => "W",
        61467 => "X",
        61468 => "Y",
        61469 => "Z",
        61470 => "1",
        61471 => "2",
        61472 => "3",
        61473 => "4",
        61474 => "5",
        61475 => "6",
        61476 => "7",
        61477 => "8",
        61478 => "9",
        61479 => "0",
        61480 => "ENTER",
        61481 => "ESC",
        61482 => "BACKSPACE",
        61483 => "TAB",
        61484 => "SPACE",
        61497 => "CAPS_LOCK",
        61498..=61509 => match code - 61498 {
            0 => "F1",
            1 => "F2",
            2 => "F3",
            3 => "F4",
            4 => "F5",
            5 => "F6",
            6 => "F7",
            7 => "F8",
            8 => "F9",
            9 => "F10",
            10 => "F11",
            11 => "F12",
            _ => "?",
        },
        57345 => "LCTRL",
        57346 => "LSHIFT",
        57348 => "LALT",
        57352 => "LGUI",
        57360 => "RCTRL",
        57376 => "RSHIFT",
        57408 => "RALT",
        57472 => "RGUI",
        0 => "NONE",
        _ => "?",
    }
}

// ── USB HID usage → Linux evdev conversion ──────────────────────

/// Convert a USB HID keyboard usage ID to the corresponding Linux evdev key code.
///
/// Based on the Linux kernel's `hid_keyboard` table in `drivers/hid/hid-input.c`.
/// Returns `None` for unmapped or reserved HID usages.
pub fn hid_usage_to_evdev(usage: u16) -> Option<u16> {
    // Table sourced from Linux kernel hid-input.c hid_keyboard[] array.
    // Index = USB HID usage ID, value = Linux evdev KEY_* code.
    const TABLE: &[u16] = &[
        0, 0, 0, 0,   // 0x00-0x03: reserved
        30,  // 0x04: a → KEY_A
        48,  // 0x05: b → KEY_B
        46,  // 0x06: c → KEY_C
        32,  // 0x07: d → KEY_D
        18,  // 0x08: e → KEY_E
        33,  // 0x09: f → KEY_F
        34,  // 0x0A: g → KEY_G
        35,  // 0x0B: h → KEY_H
        23,  // 0x0C: i → KEY_I
        36,  // 0x0D: j → KEY_J
        37,  // 0x0E: k → KEY_K
        38,  // 0x0F: l → KEY_L
        50,  // 0x10: m → KEY_M
        49,  // 0x11: n → KEY_N
        24,  // 0x12: o → KEY_O
        25,  // 0x13: p → KEY_P
        16,  // 0x14: q → KEY_Q
        19,  // 0x15: r → KEY_R
        31,  // 0x16: s → KEY_S
        20,  // 0x17: t → KEY_T
        22,  // 0x18: u → KEY_U
        47,  // 0x19: v → KEY_V
        17,  // 0x1A: w → KEY_W
        45,  // 0x1B: x → KEY_X
        21,  // 0x1C: y → KEY_Y
        44,  // 0x1D: z → KEY_Z
        2,   // 0x1E: 1 → KEY_1
        3,   // 0x1F: 2 → KEY_2
        4,   // 0x20: 3 → KEY_3
        5,   // 0x21: 4 → KEY_4
        6,   // 0x22: 5 → KEY_5
        7,   // 0x23: 6 → KEY_6
        8,   // 0x24: 7 → KEY_7
        9,   // 0x25: 8 → KEY_8
        10,  // 0x26: 9 → KEY_9
        11,  // 0x27: 0 → KEY_0
        28,  // 0x28: Enter → KEY_ENTER
        1,   // 0x29: Escape → KEY_ESC
        14,  // 0x2A: Backspace → KEY_BACKSPACE
        15,  // 0x2B: Tab → KEY_TAB
        57,  // 0x2C: Space → KEY_SPACE
        12,  // 0x2D: - → KEY_MINUS
        13,  // 0x2E: = → KEY_EQUAL
        26,  // 0x2F: [ → KEY_LEFTBRACE
        27,  // 0x30: ] → KEY_RIGHTBRACE
        43,  // 0x31: \ → KEY_BACKSLASH
        0,   // 0x32: non-US # (reserved)
        39,  // 0x33: ; → KEY_SEMICOLON
        40,  // 0x34: ' → KEY_APOSTROPHE
        41,  // 0x35: ` → KEY_GRAVE
        51,  // 0x36: , → KEY_COMMA
        52,  // 0x37: . → KEY_DOT
        53,  // 0x38: / → KEY_SLASH
        58,  // 0x39: Caps Lock → KEY_CAPSLOCK
        59,  // 0x3A: F1 → KEY_F1
        60,  // 0x3B: F2 → KEY_F2
        61,  // 0x3C: F3 → KEY_F3
        62,  // 0x3D: F4 → KEY_F4
        63,  // 0x3E: F5 → KEY_F5
        64,  // 0x3F: F6 → KEY_F6
        65,  // 0x40: F7 → KEY_F7
        66,  // 0x41: F8 → KEY_F8
        67,  // 0x42: F9 → KEY_F9
        68,  // 0x43: F10 → KEY_F10
        87,  // 0x44: F11 → KEY_F11
        88,  // 0x45: F12 → KEY_F12
        99,  // 0x46: PrintScreen → KEY_SYSRQ
        70,  // 0x47: Scroll Lock → KEY_SCROLLLOCK
        119, // 0x48: Pause → KEY_PAUSE
        110, // 0x49: Insert → KEY_INSERT
        102, // 0x4A: Home → KEY_HOME
        104, // 0x4B: Page Up → KEY_PAGEUP
        111, // 0x4C: Delete → KEY_DELETE
        107, // 0x4D: End → KEY_END
        109, // 0x4E: Page Down → KEY_PAGEDOWN
        106, // 0x4F: Right → KEY_RIGHT
        105, // 0x50: Left → KEY_LEFT
        108, // 0x51: Down → KEY_DOWN
        103, // 0x52: Up → KEY_UP
        69,  // 0x53: Num Lock → KEY_NUMLOCK
    ];

    if (usage as usize) < TABLE.len() {
        let code = TABLE[usage as usize];
        if code != 0 {
            return Some(code);
        }
    }
    None
}

/// Convert an Azeron internal key code to a Linux evdev key code.
///
/// Azeron key codes are formatted as: base (61440 for keyboard, 57344 for modifiers) + USB HID usage.
/// This function extracts the USB HID usage and converts it via `hid_usage_to_evdev()`.
pub fn azeron_code_to_evdev(azeron_code: u32) -> Option<u16> {
    const KEYBOARD_BASE: u32 = 61440;
    const MODIFIER_BASE: u32 = 57344;

    if azeron_code >= KEYBOARD_BASE {
        let usage = (azeron_code - KEYBOARD_BASE) as u16;
        hid_usage_to_evdev(usage)
    } else if azeron_code >= MODIFIER_BASE {
        // Modifier keys use a bitmask: LCTRL=1, LSHIFT=2, LALT=4, LGUI=8, etc.
        let modifier_bit = azeron_code - MODIFIER_BASE;
        match modifier_bit {
            1 => Some(29),    // LCTRL → KEY_LEFTCTRL
            2 => Some(42),    // LSHIFT → KEY_LEFTSHIFT
            4 => Some(56),    // LALT → KEY_LEFTALT
            8 => Some(125),   // LGUI → KEY_LEFTMETA
            16 => Some(97),   // RCTRL → KEY_RIGHTCTRL
            32 => Some(54),   // RSHIFT → KEY_RIGHTSHIFT
            64 => Some(100),  // RALT → KEY_RIGHTALT
            128 => Some(126), // RGUI → KEY_RIGHTMETA
            _ => None,
        }
    } else {
        None
    }
}
