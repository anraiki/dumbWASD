use anyhow::{bail, Context, Result};
use hidapi::{HidApi, HidDevice};

use super::device::{CONFIG_INTERFACE, CONFIG_USAGE, CONFIG_USAGE_PAGE, PRODUCT_ID, VENDOR_ID};

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
pub(super) fn send_command(device: &HidDevice, command: &str) -> Result<String> {
    let msg = frame_message(command);
    device.write(&msg).context("failed to write HID command")?;
    read_text_response(device)
}

/// Send a text command without waiting for a response.
pub(super) fn send_command_no_response(device: &HidDevice, command: &str) -> Result<()> {
    let msg = frame_message(command);
    device
        .write(&msg)
        .with_context(|| format!("failed to write HID command: {command}"))?;
    Ok(())
}

pub(super) fn send_binary_command_no_response(
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
pub(super) fn send_command_multi(device: &HidDevice, command: &str) -> Result<Vec<String>> {
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
