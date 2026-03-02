//! Device name registry — resolves friendly names from USB vendor/product IDs.
//!
//! Uses a curated static table first, then platform-specific helpers
//! (e.g. `solaar` for Logitech receivers on Linux).

use std::collections::HashMap;

/// A known device entry in our curated registry.
struct Entry {
    vendor_id: u16,
    product_id: u16,
    friendly_name: &'static str,
}

/// Static table of devices we recognise.
/// Add new entries here as we support more hardware.
static KNOWN: &[Entry] = &[
    // ── Azeron ──
    Entry { vendor_id: 0x16D0, product_id: 0x10BC, friendly_name: "Azeron Keypad" },
    // ── MoErgo ──
    Entry { vendor_id: 0x3434, product_id: 0x0100, friendly_name: "Glove80 Left" },
    Entry { vendor_id: 0x3434, product_id: 0x0200, friendly_name: "Glove80 Right" },
];

/// Logitech vendor ID — used to trigger solaar fallback.
const LOGITECH_VID: u16 = 0x046D;

/// Resolve a friendly device name from vendor/product IDs.
///
/// Priority:
/// 1. Curated static table
/// 2. `solaar show` for Logitech receivers (Linux only, if installed)
/// 3. Returns `None` — caller should fall back to OS-reported name
pub fn resolve_name(vendor_id: u16, product_id: u16) -> Option<String> {
    // 1. Static lookup
    for entry in KNOWN {
        if entry.vendor_id == vendor_id && entry.product_id == product_id {
            return Some(entry.friendly_name.to_string());
        }
    }

    // 2. Logitech receiver → try solaar
    if vendor_id == LOGITECH_VID {
        if let Some(name) = try_solaar(vendor_id, product_id) {
            return Some(name);
        }
    }

    None
}

/// Batch-resolve names for a list of (vendor_id, product_id) pairs.
/// More efficient than calling `resolve_name` individually since
/// it only invokes `solaar` once for all Logitech devices.
pub fn resolve_names(devices: &[(u16, u16)]) -> HashMap<(u16, u16), String> {
    let mut result = HashMap::new();
    let mut need_solaar = false;

    // Static lookup pass
    for &(vid, pid) in devices {
        for entry in KNOWN {
            if entry.vendor_id == vid && entry.product_id == pid {
                result.insert((vid, pid), entry.friendly_name.to_string());
                break;
            }
        }
        if vid == LOGITECH_VID && !result.contains_key(&(vid, pid)) {
            need_solaar = true;
        }
    }

    // Single solaar pass for all unresolved Logitech devices
    if need_solaar {
        let solaar_names = query_solaar();
        for &(vid, pid) in devices {
            if vid == LOGITECH_VID && !result.contains_key(&(vid, pid)) {
                if let Some(name) = solaar_names.get(&(vid, pid)) {
                    result.insert((vid, pid), name.clone());
                }
            }
        }
    }

    result
}

/// Try to get the paired device name from solaar for a single device.
fn try_solaar(_vendor_id: u16, _product_id: u16) -> Option<String> {
    let names = query_solaar();
    // Return the first paired device name (most Logitech receivers
    // have one device paired, and the receiver itself isn't interesting)
    names.into_values().next()
}

/// Run `solaar show` and parse paired device names.
/// Returns a map of (vendor_id, product_id) → friendly name.
///
/// For Logitech receivers, the receiver's own VID:PID maps to
/// "ReceiverName + PairedDeviceName" (e.g. "Bolt Receiver — G502 X LIGHTSPEED").
fn query_solaar() -> HashMap<(u16, u16), String> {
    let mut result = HashMap::new();

    let output = match std::process::Command::new("solaar")
        .args(["show"])
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return result,
    };

    // Parse solaar output. Format:
    //   Lightspeed Receiver
    //     USB id       : 046d:C547
    //     ...
    //     1: G502 X LIGHTSPEED
    //        WPID         : 409F

    let mut current_receiver_vid_pid: Option<(u16, u16)> = None;
    let mut paired_device_name: Option<String> = None;

    for line in output.lines() {
        let trimmed = line.trim();

        // Detect USB id line for the receiver
        if trimmed.starts_with("USB id") {
            if let Some(ids) = trimmed.split(':').last() {
                // Format: "046d:C547" — but split by ': ' first
                let id_part = trimmed.split(" : ").last().unwrap_or("");
                let parts: Vec<&str> = id_part.split(':').collect();
                if parts.len() == 2 {
                    if let (Ok(vid), Ok(pid)) = (
                        u16::from_str_radix(parts[0].trim(), 16),
                        u16::from_str_radix(parts[1].trim(), 16),
                    ) {
                        current_receiver_vid_pid = Some((vid, pid));
                    }
                }
                let _ = ids; // suppress unused warning
            }
        }

        // Detect paired device line (e.g. "  1: G502 X LIGHTSPEED")
        if let Some(colon_pos) = trimmed.find(':') {
            let prefix = &trimmed[..colon_pos];
            if prefix.chars().all(|c| c.is_ascii_digit()) && colon_pos < trimmed.len() - 1 {
                let name = trimmed[colon_pos + 1..].trim().to_string();
                if !name.is_empty() {
                    paired_device_name = Some(name);
                }
            }
        }
    }

    // Map the receiver VID:PID to the paired device name
    if let (Some(vid_pid), Some(name)) = (current_receiver_vid_pid, paired_device_name) {
        result.insert(vid_pid, name);
    }

    result
}
