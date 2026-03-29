use anyhow::{bail, Context, Result};
use hidapi::{HidApi, HidDevice};
use serde::Serialize;

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
pub const JOYSTICK_CENTER: i32 = 512;
pub const JOYSTICK_SPAN: i32 = 512;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct JoystickState {
    pub x: i32,
    pub y: i32,
    pub raw_x: i32,
    pub raw_y: i32,
    pub source: String,
}

impl JoystickState {
    pub fn normalized_x(&self) -> f32 {
        normalize_joystick_value(self.x)
    }

    pub fn normalized_y(&self) -> f32 {
        normalize_joystick_value(self.y)
    }
}

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

// ── HID protocol ───────────────────────────────────────────────────

/// Wrap an ASCII command in the Azeron framing format.
///
/// On Linux hidraw, writes MUST be padded to 65 bytes (1 byte report ID + 64 bytes data).
/// The Azeron firmware ignores short reports.
fn frame_message(message: &str) -> Vec<u8> {
    let len_str = message.len().to_string();
    let mut buf = vec![0u8; 65]; // pre-fill with zeros (padded)
    let mut pos = 0;
    buf[pos] = 0; // HID report ID
    pos += 1;
    buf[pos] = b'^';
    pos += 1;
    for &b in len_str.as_bytes() {
        buf[pos] = b;
        pos += 1;
    }
    buf[pos] = b'~';
    pos += 1;
    for &b in message.as_bytes() {
        buf[pos] = b;
        pos += 1;
    }
    buf[pos] = b'\n';
    buf
}

fn frame_binary_message(command_type: u8, payload: &[u8], echo: u8) -> Vec<Vec<u8>> {
    const REPORT_DATA_LEN: usize = 64;
    const PAGE_PAYLOAD_LEN: usize = 57;

    let total_len = payload.len();
    let page_count = total_len.max(1).div_ceil(PAGE_PAYLOAD_LEN);
    let mut reports = Vec::with_capacity(page_count);

    for page_index in 0..page_count {
        let start = page_index * PAGE_PAYLOAD_LEN;
        let end = usize::min(start + PAGE_PAYLOAD_LEN, total_len);
        let page_payload = &payload[start..end];

        let mut report = vec![0u8; REPORT_DATA_LEN + 1];
        report[0] = 0;
        report[1] = ((total_len >> 8) & 0xFF) as u8;
        report[2] = (total_len & 0xFF) as u8;
        report[3] = command_type;
        report[4] = echo;
        report[5] = page_count as u8;
        report[6] = (page_index + 1) as u8;
        report[7] = page_payload.len() as u8;
        report[8..8 + page_payload.len()].copy_from_slice(page_payload);
        reports.push(report);
    }

    reports
}

/// Read a text response from the Azeron, skipping binary status packets.
///
/// Packet structure (from azeron-cli reverse engineering):
/// - byte[4]: message type (1 = binary status report, 0 = text command response)
/// - byte[8]: payload length
/// - byte[9..9+len]: payload data
///
/// The Azeron continuously sends binary status reports with joystick position
/// and button state. We skip those and only return command responses.
fn read_text_response(device: &HidDevice) -> Result<String> {
    let mut buf = [0u8; 64];

    // Try up to 50 reads to skip past status packets
    for attempt in 0..50 {
        let n = device
            .read_timeout(&mut buf, 2000)
            .context("failed to read HID response")?;

        if n == 0 {
            bail!("timeout reading HID response (attempt {attempt})");
        }

        // Need at least 9 bytes for the header
        if n < 9 {
            tracing::trace!("short packet ({n} bytes), skipping");
            continue;
        }

        // Packets are raw ASCII text starting at byte 0, terminated with \r\n,
        // zero-padded to 64 bytes. Binary status packets (from keepalive) start
        // with non-printable bytes.
        if buf[0] < 0x20 || buf[0] >= 0x7F {
            tracing::trace!("skipping binary packet (first byte={:#04x})", buf[0]);
            continue;
        }

        // Extract ASCII text up to \r\n or first null byte
        let text_end = buf[..n]
            .iter()
            .position(|&b| b == b'\r' || b == b'\n' || b == 0)
            .unwrap_or(n);

        let text = String::from_utf8_lossy(&buf[..text_end]).to_string();

        tracing::debug!("HID response: {text:?}");
        return Ok(text);
    }

    bail!("no text response after 50 reads (only binary status packets)")
}

/// Send a command and read the text response.
fn send_command(device: &HidDevice, command: &str) -> Result<String> {
    let msg = frame_message(command);
    device.write(&msg).context("failed to write HID command")?;
    read_text_response(device)
}

/// Send a text command without waiting for a response.
fn send_command_no_response(device: &HidDevice, command: &str) -> Result<()> {
    let msg = frame_message(command);
    device
        .write(&msg)
        .with_context(|| format!("failed to write HID command: {command}"))?;
    Ok(())
}

fn send_binary_command_no_response(
    device: &HidDevice,
    command_type: u8,
    payload: &[u8],
    echo: u8,
) -> Result<()> {
    for report in frame_binary_message(command_type, payload, echo) {
        device
            .write(&report)
            .with_context(|| format!("failed to write binary HID command type={command_type}"))?;
    }
    Ok(())
}

/// Send a command and read ALL text response packets (for multi-packet responses like GET_PROFILES).
fn send_command_multi(device: &HidDevice, command: &str) -> Result<Vec<String>> {
    let msg = frame_message(command);
    device.write(&msg).context("failed to write HID command")?;

    let mut responses = Vec::new();
    let mut buf = [0u8; 64];

    loop {
        let n = device
            .read_timeout(&mut buf, 500)
            .context("failed to read HID response")?;

        if n == 0 {
            // Timeout — no more packets
            break;
        }

        // Skip binary packets
        if buf[0] < 0x20 || buf[0] >= 0x7F {
            continue;
        }

        let text_end = buf[..n]
            .iter()
            .position(|&b| b == b'\r' || b == b'\n' || b == 0)
            .unwrap_or(n);

        let text = String::from_utf8_lossy(&buf[..text_end]).to_string();
        if !text.is_empty() {
            responses.push(text);
        }
    }

    Ok(responses)
}

// ── Public API ─────────────────────────────────────────────────────

/// Open the Azeron's configuration HID interface.
pub fn open_config_device() -> Result<HidDevice> {
    let api = HidApi::new().context("failed to initialize HID API")?;

    let device_info = api
        .device_list()
        .find(|d| {
            d.vendor_id() == VENDOR_ID
                && d.product_id() == PRODUCT_ID
                && d.usage_page() == CONFIG_USAGE_PAGE
                && d.usage() == CONFIG_USAGE
        })
        .or_else(|| {
            api.device_list().find(|d| {
                d.vendor_id() == VENDOR_ID
                    && d.product_id() == PRODUCT_ID
                    && d.interface_number() == CONFIG_INTERFACE
            })
        })
        .context("Azeron device not found (is it plugged in?)")?;

    let device = device_info.open_device(&api).context(
        "failed to open Azeron config interface (try running with sudo or check permissions)",
    )?;

    Ok(device)
}

/// Read one joystick status update from the Azeron config HID interface.
///
/// Returns `Ok(None)` on timeout or when the packet is not a joystick report.
pub fn read_joystick_state(device: &HidDevice, timeout_ms: i32) -> Result<Option<JoystickState>> {
    let mut buf = [0u8; 64];
    let n = device
        .read_timeout(&mut buf, timeout_ms)
        .context("failed to read Azeron HID report")?;
    if n == 0 {
        return Ok(None);
    }

    Ok(parse_joystick_state(&buf[..n]))
}

/// Parse a joystick status packet from the Azeron config HID interface.
pub fn parse_joystick_state(report: &[u8]) -> Option<JoystickState> {
    if report.first().is_some_and(|byte| byte.is_ascii_graphic()) {
        return parse_text_joystick_state(report);
    }

    parse_binary_joystick_state(report)
}

/// Get the firmware version string.
pub fn get_firmware_version(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_FW_VERSION")
}

/// Prime the configurator HID stream so the device starts emitting live joystick packets.
///
/// This mirrors the startup sequence used by the official Azeron Linux app:
/// text firmware/type probes plus binary firmware/details/right-analog requests.
pub fn prime_joystick_stream(device: &HidDevice) -> Result<()> {
    const FIRMWARE_VERSION: u8 = 5;
    const KEYPAD_DETAILS: u8 = 2;
    const RIGHT_ANALOG: u8 = 33;

    send_command_no_response(device, "GET_FW_VERSION")?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_binary_command_no_response(device, FIRMWARE_VERSION, &[], 1)?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_command_no_response(device, "GET_FW_TYPE")?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_binary_command_no_response(device, KEYPAD_DETAILS, &[], 2)?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_binary_command_no_response(device, RIGHT_ANALOG, &[], 3)?;

    Ok(())
}

/// Keepalive used by the official app to keep the configurator HID stream active.
pub fn ping_device(device: &HidDevice) -> Result<()> {
    send_command_no_response(device, "Hi")
}

/// Binary keepalive used once the device is in the modern binary protocol path.
pub fn ping_device_binary(device: &HidDevice) -> Result<()> {
    const PING_DEVICE: u8 = 18;
    send_binary_command_no_response(device, PING_DEVICE, &[], 4)
}

fn normalize_joystick_value(value: i32) -> f32 {
    ((value - JOYSTICK_CENTER) as f32 / JOYSTICK_SPAN as f32).clamp(-1.0, 1.0)
}

fn parse_binary_joystick_state(report: &[u8]) -> Option<JoystickState> {
    const KEYPAD_STATUS: u8 = 1;
    const HEADER_LEN: usize = 7;

    if report.len() < HEADER_LEN || report[2] != KEYPAD_STATUS {
        return None;
    }

    let payload_len = report[6] as usize;
    if report.len() < HEADER_LEN + payload_len || payload_len < 14 {
        return None;
    }

    let payload = &report[HEADER_LEN..HEADER_LEN + payload_len];

    Some(JoystickState {
        raw_x: i16::from_le_bytes([payload[6], payload[7]]) as i32,
        raw_y: i16::from_le_bytes([payload[8], payload[9]]) as i32,
        x: i16::from_le_bytes([payload[10], payload[11]]) as i32,
        y: i16::from_le_bytes([payload[12], payload[13]]) as i32,
        source: "binary-keypad-status".to_string(),
    })
}

fn parse_text_joystick_state(report: &[u8]) -> Option<JoystickState> {
    let text_end = report
        .iter()
        .position(|&byte| byte == b'\r' || byte == b'\n' || byte == 0)
        .unwrap_or(report.len());
    let text = std::str::from_utf8(&report[..text_end]).ok()?.trim();
    let payload = text
        .strip_prefix("JOY_")
        .or_else(|| text.strip_prefix("PJOY_"))?;
    let mut parts = payload.split('_');
    let _code = parts.next()?;
    let x = parts.next()?.parse::<i32>().ok()?;
    let y = parts.next()?.parse::<i32>().ok()?;

    Some(JoystickState {
        x,
        y,
        raw_x: x,
        raw_y: y,
        source: if text.starts_with("PJOY_") {
            "text-pure-joy".to_string()
        } else {
            "text-joy".to_string()
        },
    })
}

/// Get the current profiles configuration (multi-packet response).
pub fn get_profiles(device: &HidDevice) -> Result<Vec<String>> {
    send_command_multi(device, "GET_PROFILES")
}

/// Get LED state.
pub fn get_led_state(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_LEDS")
}

/// Get analog stick type (ANALOG_SQUARE or ANALOG_CIRCLE).
pub fn get_analog_type(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_ANALOG_TYPE")
}

/// Get keypad type info.
pub fn get_keypad_info(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_FW_TYPE")
}

/// Set a single button to a keyboard key.
///
/// - `profile_id`: 0 or 1
/// - `button_id`: 1-38
/// - `key_code`: Azeron internal key code (use `azeron_key_code()`)
/// - `meta_keys`: modifier key codes (LCTRL=57345, LSHIFT=57346, LALT=57348)
pub fn set_button_key(
    device: &HidDevice,
    profile_id: u8,
    button_id: u8,
    key_code: u32,
    meta_keys: &[u32],
) -> Result<bool> {
    let pins = button_pins(button_id);
    let button_type = ButtonType::KeyboardKey as u8;

    // Key values: up to 4 slots, pad with 0
    let keys = format!("{}|0|0|0", key_code);

    // Meta keys: up to 3 slots, pad with 0
    let mut metas = meta_keys.iter().map(|k| k.to_string()).collect::<Vec<_>>();
    metas.resize(3, "0".to_string());
    let meta_str = metas.join("|");

    let cmd = format!(
        "B{profile_id}|{button_id}|{button_type}|{pin0}|{pin1}|{keys}|{meta_str}|0",
        pin0 = pins[0],
        pin1 = pins[1],
    );

    let response = send_command(device, &cmd)?;
    Ok(response.starts_with(&format!("BOK_{button_id}")))
}

/// Disable a single button.
pub fn disable_button(device: &HidDevice, profile_id: u8, button_id: u8) -> Result<bool> {
    let pins = button_pins(button_id);
    let button_type = ButtonType::Disabled as u8;
    let cmd = format!(
        "B{profile_id}|{button_id}|{button_type}|{pin0}|{pin1}|0|0|0|0|0|0|0|0",
        pin0 = pins[0],
        pin1 = pins[1],
    );
    let response = send_command(device, &cmd)?;
    Ok(response.starts_with(&format!("BOK_{button_id}")))
}

// ── Profile parsing ──────────────────────────────────────────────

/// A parsed button entry from a profile response.
#[derive(Debug, Clone)]
pub struct ProfileButton {
    pub button_id: u8,
    pub button_type: u8,
    pub key_code: u32,
}

/// Parse the raw `GET_PROFILES` response lines into per-button entries.
///
/// Each line from the Azeron follows the format:
/// `B{profile}|{button_id}|{type}|{pin0}|{pin1}|{key0}|{key1}|{key2}|{key3}|{meta0}|{meta1}|{meta2}|{flags}`
///
/// Lines that don't start with `B` or can't be parsed are skipped.
pub fn parse_profiles(lines: &[String]) -> Vec<ProfileButton> {
    let mut buttons = Vec::new();
    for line in lines {
        // Lines look like: B0|1|1|26|255|61470|0|0|0|0|0|0|0
        if !line.starts_with('B') {
            continue;
        }

        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 6 {
            continue;
        }

        // parts[0] = "B0" (profile), parts[1] = button_id, parts[2] = type,
        // parts[3] = pin0, parts[4] = pin1, parts[5] = key_code
        let button_id: u8 = match parts[1].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let button_type: u8 = match parts[2].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let key_code: u32 = match parts[5].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        buttons.push(ProfileButton {
            button_id,
            button_type,
            key_code,
        });
    }
    buttons
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

/// Set a button to a joystick button (appears on js0 interface).
pub fn set_button_joystick(
    device: &HidDevice,
    profile_id: u8,
    button_id: u8,
    joy_button: u32,
) -> Result<bool> {
    let pins = button_pins(button_id);
    let button_type = ButtonType::JoystickButton as u8;
    let keys = format!("{}|0|0|0", joy_button);
    let cmd = format!(
        "B{profile_id}|{button_id}|{button_type}|{pin0}|{pin1}|{keys}|0|0|0|0",
        pin0 = pins[0],
        pin1 = pins[1],
    );
    let response = send_command(device, &cmd)?;
    Ok(response.starts_with(&format!("BOK_{button_id}")))
}
