use dumbwasd_core::core::layout;
use dumbwasd_core::devices::{self, registry, DeviceInfo};
use dumbwasd_core::platform::InputBackend;
use indexmap::IndexMap;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DeviceEntry {
    id: String,
    /// All evdev paths for this physical device (keyboard + mouse + gamepad interfaces).
    paths: Vec<String>,
    name: String,
    raw_name: String,
    vendor_id: u16,
    product_id: u16,
    is_azeron: bool,
    has_keyboard: bool,
    has_gamepad: bool,
    has_mouse: bool,
    member_count: usize,
    #[serde(skip_serializing)]
    member_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceRegistryToml {
    path: String,
    content: String,
}

#[tauri::command]
pub async fn list_devices() -> Result<Vec<DeviceEntry>, String> {
    let input = dumbwasd_core::platform::create_input_backend();
    let mut devices = input.list_devices().await.map_err(|e| format!("{e:#}"))?;

    // Resolve friendly names in a single pass
    devices::resolve_device_names(&mut devices);

    // Filter out non-controller devices
    let devices: Vec<DeviceInfo> = devices
        .into_iter()
        .filter(|d| d.is_likely_controller())
        .collect();

    // Group interfaces into logical devices. By default this is one physical device
    // (same VID:PID + base name), but the registry can opt multiple physical devices
    // into one composite logical device.
    let mut groups: IndexMap<String, DeviceEntry> = IndexMap::new();

    for d in devices {
        // Derive a stable base name by stripping interface suffixes
        // e.g. "Azeron LTD Azeron Keypad Keyboard" → "Azeron LTD Azeron Keypad"
        let base_name = strip_interface_suffix(&d.name);
        let physical_member_key = format!("{}:{}:{}", d.vendor_id, d.product_id, base_name);
        let registry_entry = registry::find_entry(d.vendor_id, d.product_id, Some(&d.name));
        let (device_id, display_name, raw_name) = if let Some(entry) = &registry_entry {
            if let Some((logical_key, logical_name)) = entry.logical_identity() {
                (
                    logical_key.to_string(),
                    logical_name.to_string(),
                    logical_name.to_string(),
                )
            } else {
                (
                    format!("{}:{}", d.vendor_id, d.product_id),
                    entry.friendly_name.clone(),
                    base_name.clone(),
                )
            }
        } else {
            (
                format!("{}:{}:{}", d.vendor_id, d.product_id, base_name),
                d.friendly_name.clone().unwrap_or_else(|| base_name.clone()),
                base_name.clone(),
            )
        };

        let entry = groups
            .entry(device_id.clone())
            .or_insert_with(|| DeviceEntry {
                id: device_id,
                paths: Vec::new(),
                name: display_name,
                raw_name,
                vendor_id: d.vendor_id,
                product_id: d.product_id,
                is_azeron: d.is_azeron(),
                has_keyboard: false,
                has_gamepad: false,
                has_mouse: false,
                member_count: 0,
                member_keys: Vec::new(),
            });

        classify_interface(&d, entry);
        entry.paths.push(d.path);
        if !entry.member_keys.contains(&physical_member_key) {
            entry.member_keys.push(physical_member_key);
            entry.member_count += 1;
        }
    }

    Ok(groups.into_values().collect())
}

fn classify_interface(device: &DeviceInfo, entry: &mut DeviceEntry) {
    entry.has_keyboard |= device.has_keyboard;
    entry.has_gamepad |= device.has_gamepad;
    entry.has_mouse |= device.has_mouse;

    let lower = device.name.to_lowercase();

    if lower.contains("keyboard")
        || lower.contains("consumer control")
        || lower.contains("system control")
    {
        entry.has_keyboard = true;
    }

    if lower.contains("gamepad") || lower.contains("joystick") {
        entry.has_gamepad = true;
    }

    if lower.contains("mouse") {
        entry.has_mouse = true;
    }
}

/// Strip common interface suffixes to get a base device name for grouping.
fn strip_interface_suffix(name: &str) -> String {
    let suffixes = [
        " Keyboard",
        " Mouse",
        " Consumer Control",
        " System Control",
        " Gamepad",
    ];
    let mut base = name.to_string();
    for suffix in &suffixes {
        if let Some(stripped) = base.strip_suffix(suffix) {
            base = stripped.to_string();
            break;
        }
    }
    base
}

#[tauri::command]
pub fn resolve_layout_for_device(
    vendor_id: u16,
    product_id: u16,
    name: String,
    raw_name: Option<String>,
) -> Result<Option<String>, String> {
    let registry_entry = registry::find_entry(vendor_id, product_id, Some(&name)).or_else(|| {
        raw_name
            .as_deref()
            .and_then(|raw_name| registry::find_entry(vendor_id, product_id, Some(raw_name)))
    });

    if let Some(entry) = registry_entry {
        let known_layouts = layout::list_layouts().map_err(|e| format!("{e:#}"))?;

        if let Some(default_layout) = entry.default_layout_name() {
            if known_layouts
                .iter()
                .any(|candidate| candidate == default_layout)
            {
                return Ok(Some(default_layout.to_string()));
            }
        }

        for candidate in &entry.layout_candidates {
            if known_layouts
                .iter()
                .any(|layout_name| layout_name == candidate)
            {
                return Ok(Some(candidate.clone()));
            }
        }
    }

    layout::resolve_layout_name(vendor_id, product_id, &name, raw_name.as_deref())
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn get_device_registry_toml(
    vendor_id: u16,
    product_id: u16,
    name: String,
    raw_name: Option<String>,
) -> Result<Option<DeviceRegistryToml>, String> {
    let record = registry::find_entry_record(vendor_id, product_id, Some(&name)).or_else(|| {
        raw_name
            .as_deref()
            .and_then(|raw_name| registry::find_entry_record(vendor_id, product_id, Some(raw_name)))
    });

    Ok(record.map(|(_entry, path, content)| DeviceRegistryToml {
        path: path.to_string_lossy().to_string(),
        content,
    }))
}
