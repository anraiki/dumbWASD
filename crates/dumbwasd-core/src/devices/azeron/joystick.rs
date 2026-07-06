use anyhow::{Context, Result};
use hidapi::HidDevice;
use serde::Serialize;

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
