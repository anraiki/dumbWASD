use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// A device layout definition — describes the physical button arrangement of a controller.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLayout {
    pub device: DeviceMeta,
    pub buttons: Vec<ButtonDef>,
}

/// Metadata about the device this layout describes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceMeta {
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    #[serde(default)]
    pub rows: u32,
    #[serde(default)]
    pub cols: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_type: Option<String>,
}

/// A single button's position and identity in the layout grid.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ButtonDef {
    /// evdev event code for this button.
    pub id: u16,
    /// Display label (e.g. "1", "Thumb", "Joy Up").
    pub label: String,
    /// Grid row (0-indexed). Optional for custom layouts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row: Option<u32>,
    /// Grid column (0-indexed). Optional for custom layouts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col: Option<u32>,
    /// X position in pixels for custom layouts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    /// Y position in pixels for custom layouts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    /// Whether this button represents a joystick component.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_joystick: Option<bool>,
    /// Number of columns this button spans.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colspan: Option<u32>,
    /// Number of rows this button spans.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rowspan: Option<u32>,
}

/// Return the directory where layout files are stored.
///
/// Resolution order:
/// 1. `$DUMBWASD_LAYOUTS_DIR` environment variable
/// 2. `./layouts` relative to the current working directory
pub fn layouts_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("DUMBWASD_LAYOUTS_DIR") {
        return Ok(PathBuf::from(dir));
    }

    let cwd = std::env::current_dir().context("failed to get current directory")?;
    Ok(cwd.join("layouts"))
}

/// List all layout names (filenames without .toml extension).
pub fn list_layouts() -> Result<Vec<String>> {
    let dir = layouts_dir()?;

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut layouts = Vec::new();
    for entry in std::fs::read_dir(&dir).context("failed to read layouts directory")? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "toml") {
            if let Some(stem) = path.file_stem() {
                layouts.push(stem.to_string_lossy().into_owned());
            }
        }
    }

    layouts.sort();
    Ok(layouts)
}

fn normalize_layout_key(value: &str) -> String {
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

fn preferred_layout_aliases(vendor_id: u16, product_id: u16) -> &'static [&'static str] {
    match (vendor_id, product_id) {
        // Azeron Cyborg
        (0x16D0, 0x10BC) => &["azeron-cyborg"],
        _ => &[],
    }
}

/// Resolve the best matching layout name for a device when no curated layout is set.
///
/// Resolution order:
/// 1. Explicit per-device aliases
/// 2. Normalized filename match against the reported names
/// 3. Metadata name match within layouts sharing the same VID:PID
/// 4. A sole VID:PID match, if unique
pub fn resolve_layout_name(
    vendor_id: u16,
    product_id: u16,
    name: &str,
    raw_name: Option<&str>,
) -> Result<Option<String>> {
    let layouts = list_layouts()?;
    if layouts.is_empty() {
        return Ok(None);
    }

    for alias in preferred_layout_aliases(vendor_id, product_id) {
        if layouts.iter().any(|layout| layout == alias) {
            return Ok(Some((*alias).to_string()));
        }
    }

    let mut candidate_keys = Vec::new();
    if !name.trim().is_empty() {
        candidate_keys.push(normalize_layout_key(name));
    }
    if let Some(raw_name) = raw_name {
        if !raw_name.trim().is_empty() {
            let normalized = normalize_layout_key(raw_name);
            if !candidate_keys.contains(&normalized) {
                candidate_keys.push(normalized);
            }
        }
    }

    for candidate in &candidate_keys {
        if let Some(layout_name) = layouts
            .iter()
            .find(|layout| normalize_layout_key(layout) == *candidate)
        {
            return Ok(Some(layout_name.clone()));
        }
    }

    let mut vid_pid_matches = Vec::new();

    for layout_name in &layouts {
        let layout = match DeviceLayout::load(layout_name) {
            Ok(layout) => layout,
            Err(_) => continue,
        };

        if layout.device.vendor_id != vendor_id || layout.device.product_id != product_id {
            continue;
        }

        let layout_device_key = normalize_layout_key(&layout.device.name);
        if candidate_keys.iter().any(|candidate| candidate == &layout_device_key) {
            return Ok(Some(layout_name.clone()));
        }

        vid_pid_matches.push(layout_name.clone());
    }

    if vid_pid_matches.len() == 1 {
        return Ok(vid_pid_matches.into_iter().next());
    }

    Ok(None)
}

impl DeviceLayout {
    /// Load a layout by name from the layouts directory.
    pub fn load(name: &str) -> Result<Self> {
        let dir = layouts_dir()?;
        let path = dir.join(format!("{name}.toml"));

        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read layout: {}", path.display()))?;

        let layout: DeviceLayout = toml::from_str(&content)
            .with_context(|| format!("failed to parse layout: {}", path.display()))?;

        Ok(layout)
    }

    /// Save this layout to the layouts directory with the given name.
    pub fn save(&self, name: &str) -> Result<PathBuf> {
        let dir = layouts_dir()?;
        std::fs::create_dir_all(&dir)
            .with_context(|| format!("failed to create layouts directory: {}", dir.display()))?;

        let path = dir.join(format!("{name}.toml"));
        let content = toml::to_string_pretty(self).context("failed to serialize layout to TOML")?;

        std::fs::write(&path, &content)
            .with_context(|| format!("failed to write layout: {}", path.display()))?;

        Ok(path)
    }
}

/// Get a human-readable name for an evdev key code (e.g. 2 → "KEY_1").
pub fn evdev_key_name(code: u16) -> String {
    format!("{:?}", evdev::KeyCode::new(code))
}
