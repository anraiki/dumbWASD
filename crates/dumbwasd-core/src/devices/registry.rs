//! Device registry — resolves curated device identity data from project-local files.
//!
//! Resolution order:
//! 1. `devices/*.toml` from `$DUMBWASD_DEVICE_REGISTRY_DIR` or `./devices`
//! 2. Platform-specific helpers (e.g. `solaar` for Logitech receivers on Linux)
//! 3. Returns `None` — caller should fall back to OS-reported name

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::Context;
use serde::Deserialize;
use tracing::warn;

use super::DeviceInfo;
use crate::platform::current_platform;

#[derive(Debug, Clone)]
struct LoadedRecord {
    entry: RegistryEntry,
    path: PathBuf,
    content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegistryEntry {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub key: String,
    pub vendor_id: u16,
    pub product_id: u16,
    #[serde(default)]
    pub vendor_name: String,
    #[serde(default)]
    pub model: String,
    pub friendly_name: String,
    #[serde(default)]
    pub raw_name_aliases: Vec<String>,
    #[serde(default)]
    pub interface_name_aliases: Vec<String>,
    #[serde(default)]
    pub layout_candidates: Vec<String>,
    #[serde(default, alias = "preferred_layout")]
    pub default_layout: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub button_count: Option<u32>,
    #[serde(default)]
    pub search_terms: Vec<String>,
    #[serde(default)]
    pub logical_device_key: String,
    #[serde(default)]
    pub logical_device_name: String,
    #[serde(default)]
    pub logical_role: String,
    #[serde(default)]
    pub group_strategy: String,
    pub source: Option<RegistrySource>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegistrySource {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub origin: String,
    #[serde(default)]
    pub notes: String,
}

/// Logitech vendor ID — used to trigger solaar fallback.
const LOGITECH_VID: u16 = 0x046D;

fn registry_dir() -> anyhow::Result<PathBuf> {
    if let Ok(dir) = std::env::var("DUMBWASD_DEVICE_REGISTRY_DIR") {
        return Ok(PathBuf::from(dir));
    }

    let cwd = std::env::current_dir().context("failed to get current directory")?;
    Ok(cwd.join("devices"))
}

fn load_records() -> Vec<LoadedRecord> {
    let dir = match registry_dir() {
        Ok(dir) => dir,
        Err(error) => {
            warn!("failed to resolve device registry directory: {error:#}");
            return Vec::new();
        }
    };

    if !dir.exists() {
        return Vec::new();
    }

    let read_dir = match std::fs::read_dir(&dir) {
        Ok(read_dir) => read_dir,
        Err(error) => {
            warn!("failed to read device registry directory {}: {error:#}", dir.display());
            return Vec::new();
        }
    };

    let mut paths: Vec<_> = read_dir
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "toml"))
        .collect();
    paths.sort();

    let mut entries = Vec::new();
    for path in paths {
        let content = match std::fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) => {
                warn!("failed to read device registry file {}: {error:#}", path.display());
                continue;
            }
        };

        match toml::from_str::<RegistryEntry>(&content) {
            Ok(entry) => entries.push(LoadedRecord {
                entry,
                path,
                content,
            }),
            Err(error) => warn!(
                "failed to parse device registry file {}: {error:#}",
                path.display()
            ),
        }
    }

    entries
}

fn load_entries() -> Vec<RegistryEntry> {
    load_records().into_iter().map(|record| record.entry).collect()
}

fn normalize_name(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn entry_matches_device_name(entry: &RegistryEntry, device_name: &str) -> bool {
    let candidate = normalize_name(device_name);
    if candidate.is_empty() {
        return false;
    }

    if normalize_name(&entry.friendly_name) == candidate {
        return true;
    }

    entry.raw_name_aliases
        .iter()
        .chain(entry.interface_name_aliases.iter())
        .any(|alias| normalize_name(alias) == candidate)
}

pub fn find_entry(
    vendor_id: u16,
    product_id: u16,
    device_name: Option<&str>,
) -> Option<RegistryEntry> {
    let matches: Vec<_> = load_entries()
        .into_iter()
        .filter(|entry| entry.vendor_id == vendor_id && entry.product_id == product_id)
        .collect();

    if matches.is_empty() {
        return None;
    }

    if let Some(device_name) = device_name {
        if let Some(entry) = matches
            .iter()
            .find(|entry| entry_matches_device_name(entry, device_name))
        {
            return Some(entry.clone());
        }
    }

    if matches.len() == 1 {
        return matches.into_iter().next();
    }

    None
}

pub fn find_entry_record(
    vendor_id: u16,
    product_id: u16,
    device_name: Option<&str>,
) -> Option<(RegistryEntry, PathBuf, String)> {
    let matches: Vec<_> = load_records()
        .into_iter()
        .filter(|record| {
            record.entry.vendor_id == vendor_id && record.entry.product_id == product_id
        })
        .collect();

    if matches.is_empty() {
        return None;
    }

    if let Some(device_name) = device_name {
        if let Some(record) = matches
            .iter()
            .find(|record| entry_matches_device_name(&record.entry, device_name))
        {
            return Some((
                record.entry.clone(),
                record.path.clone(),
                record.content.clone(),
            ));
        }
    }

    if matches.len() == 1 {
        let record = matches.into_iter().next()?;
        return Some((record.entry, record.path, record.content));
    }

    None
}

impl RegistryEntry {
    pub fn logical_identity(&self) -> Option<(&str, &str)> {
        if self.group_strategy == "group"
            && !self.logical_device_key.trim().is_empty()
            && !self.logical_device_name.trim().is_empty()
        {
            Some((&self.logical_device_key, &self.logical_device_name))
        } else {
            None
        }
    }

    pub fn default_layout_name(&self) -> Option<&str> {
        self.default_layout.as_deref()
    }
}

/// Batch-resolve friendly names for discovered input devices.
///
/// The returned map is keyed by device path so multiple interfaces with the same
/// VID:PID can still be resolved independently when needed.
pub fn resolve_names(devices: &[DeviceInfo]) -> HashMap<String, String> {
    let mut result = HashMap::new();
    let mut need_solaar = false;

    for device in devices {
        if let Some(entry) = find_entry(device.vendor_id, device.product_id, Some(&device.name)) {
            result.insert(device.path.clone(), entry.friendly_name);
            continue;
        }

        if device.vendor_id == LOGITECH_VID && current_platform().capabilities().supports_solaar {
            need_solaar = true;
        }
    }

    if need_solaar {
        let solaar_names = query_solaar();
        for device in devices {
            if device.vendor_id == LOGITECH_VID && !result.contains_key(&device.path) {
                if let Some(name) = solaar_names.get(&(device.vendor_id, device.product_id)) {
                    result.insert(device.path.clone(), name.clone());
                }
            }
        }
    }

    result
}

/// Run `solaar show` and parse paired device names.
/// Returns a map of (vendor_id, product_id) → friendly name.
///
/// For Logitech receivers, the receiver's own VID:PID maps to
/// "ReceiverName + PairedDeviceName" (e.g. "Bolt Receiver — G502 X LIGHTSPEED").
#[cfg(target_os = "linux")]
fn query_solaar() -> HashMap<(u16, u16), String> {
    let output = match std::process::Command::new("solaar").args(["show"]).output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return HashMap::new(),
    };

    parse_solaar_output(&output)
}

#[cfg(not(target_os = "linux"))]
fn query_solaar() -> HashMap<(u16, u16), String> {
    HashMap::new()
}

fn parse_solaar_output(output: &str) -> HashMap<(u16, u16), String> {
    let mut result = HashMap::new();

    let mut current_receiver_vid_pid: Option<(u16, u16)> = None;

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("USB id") {
            current_receiver_vid_pid = parse_usb_id_line(trimmed);
            continue;
        }

        if let (Some(vid_pid), Some(name)) =
            (current_receiver_vid_pid, parse_paired_device_line(line))
        {
            result.entry(vid_pid).or_insert(name.to_string());
        }
    }

    result
}

fn parse_usb_id_line(line: &str) -> Option<(u16, u16)> {
    let id_part = line.split(" : ").last()?;
    let (vid, pid) = id_part.split_once(':')?;
    let vid = u16::from_str_radix(vid.trim(), 16).ok()?;
    let pid = u16::from_str_radix(pid.trim(), 16).ok()?;
    Some((vid, pid))
}

fn parse_paired_device_line(line: &str) -> Option<&str> {
    let leading_spaces = line.chars().take_while(|c| *c == ' ').count();
    if leading_spaces != 2 {
        return None;
    }

    let trimmed = line.trim();
    let (prefix, name) = trimmed.split_once(':')?;
    if !prefix.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    let name = name.trim();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_name, parse_paired_device_line, parse_solaar_output, parse_usb_id_line};

    #[test]
    fn normalizes_device_names() {
        assert_eq!(
            normalize_name("Azeron LTD Azeron Keypad Keyboard"),
            "azeron-ltd-azeron-keypad-keyboard"
        );
    }

    #[test]
    fn parses_usb_id_line() {
        assert_eq!(
            parse_usb_id_line("USB id       : 046d:C547"),
            Some((0x046D, 0xC547))
        );
    }

    #[test]
    fn only_accepts_actual_paired_device_lines() {
        assert_eq!(
            parse_paired_device_line("  1: G502 X LIGHTSPEED"),
            Some("G502 X LIGHTSPEED")
        );
        assert_eq!(
            parse_paired_device_line("         0: ROOT                   {0000} V0"),
            None
        );
        assert_eq!(parse_paired_device_line("     Device path  : None"), None);
    }

    #[test]
    fn parses_receiver_name_without_grabbing_feature_lines() {
        let output = r#"Lightspeed Receiver
  Device path  : /dev/hidraw5
  USB id       : 046d:C547
  Serial       : 78B56C70
  Has 1 paired device(s) out of a maximum of 2.

  1: G502 X LIGHTSPEED
     Device path  : None
     WPID         : 409F
     Supports 3 HID++ 2.0 features:
         0: ROOT                   {0000} V0
         1: FEATURE SET            {0001} V0
        28: unknown:18C0           {C018} V0    internal, hidden, unknown:000010
"#;

        let parsed = parse_solaar_output(output);
        assert_eq!(
            parsed.get(&(0x046D, 0xC547)).map(String::as_str),
            Some("G502 X LIGHTSPEED")
        );
    }
}
