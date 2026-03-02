#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod events;

use dumbwasd_core::core::layout::{self, DeviceLayout};
use dumbwasd_core::devices::{self, DeviceInfo};
use dumbwasd_core::platform::InputBackend;
use events::MonitorState;
use indexmap::IndexMap;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
struct DeviceEntry {
    /// All evdev paths for this physical device (keyboard + mouse + gamepad interfaces).
    paths: Vec<String>,
    name: String,
    vendor_id: u16,
    product_id: u16,
    is_azeron: bool,
}

#[tauri::command]
async fn list_devices() -> Result<Vec<DeviceEntry>, String> {
    let input = dumbwasd_core::platform::create_input_backend();
    let mut devices = input
        .list_devices()
        .await
        .map_err(|e| format!("{e:#}"))?;

    // Resolve friendly names in a single pass
    devices::resolve_device_names(&mut devices);

    // Filter out non-controller devices
    let devices: Vec<DeviceInfo> = devices
        .into_iter()
        .filter(|d| d.is_likely_controller())
        .collect();

    // Group interfaces that belong to the same physical device (same VID:PID + base name).
    // IndexMap preserves insertion order (sorted by first-seen evdev path).
    let mut groups: IndexMap<(u16, u16, String), DeviceEntry> = IndexMap::new();

    for d in devices {
        // Derive a stable base name by stripping interface suffixes
        // e.g. "Azeron LTD Azeron Keypad Keyboard" → "Azeron LTD Azeron Keypad"
        let base_name = strip_interface_suffix(&d.name);
        let key = (d.vendor_id, d.product_id, base_name);

        let entry = groups.entry(key).or_insert_with(|| DeviceEntry {
            paths: Vec::new(),
            name: d.display_name().to_string(),
            vendor_id: d.vendor_id,
            product_id: d.product_id,
            is_azeron: d.is_azeron(),
        });

        entry.paths.push(d.path);
    }

    Ok(groups.into_values().collect())
}

/// Strip common interface suffixes to get a base device name for grouping.
fn strip_interface_suffix(name: &str) -> String {
    let suffixes = [" Keyboard", " Mouse", " Consumer Control", " System Control", " Gamepad"];
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
fn list_layouts() -> Result<Vec<String>, String> {
    layout::list_layouts().map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_layout(name: String) -> Result<DeviceLayout, String> {
    DeviceLayout::load(&name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn save_layout(name: String, layout: DeviceLayout) -> Result<String, String> {
    tracing::info!("========== save_layout COMMAND INVOKED ==========");
    tracing::info!("Layout name: {}", name);
    tracing::info!("Device name: {}", layout.device.name);
    tracing::info!("Layout type: {:?}", layout.device.layout_type);
    tracing::info!("Button count: {}", layout.buttons.len());

    let path = layout.save(&name).map_err(|e| {
        tracing::error!("Failed to save layout: {:#}", e);
        format!("{e:#}")
    })?;

    tracing::info!("Layout saved to: {}", path.display());
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn start_monitoring(
    device_paths: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, MonitorState>,
) -> Result<(), String> {
    events::start_monitoring(device_paths, app, &state)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn stop_monitoring(state: tauri::State<'_, MonitorState>) -> Result<(), String> {
    events::stop_monitoring(&state).await;
    Ok(())
}

fn main() {
    // Work around WebKitGTK crash on Wayland with DMA-BUF renderer
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // Resolve project root so layouts/profiles are found regardless of CWD.
    // In dev mode, the Tauri CWD is gui/, so we go up one level.
    if std::env::var_os("DUMBWASD_LAYOUTS_DIR").is_none() {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        // CARGO_MANIFEST_DIR = gui/src-tauri, project root is two levels up
        let project_root = manifest.parent().and_then(|p| p.parent()).unwrap();
        std::env::set_var("DUMBWASD_LAYOUTS_DIR", project_root.join("layouts"));
        if std::env::var_os("DUMBWASD_PROFILES_DIR").is_none() {
            std::env::set_var("DUMBWASD_PROFILES_DIR", project_root.join("profiles"));
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .manage(MonitorState::default())
        .invoke_handler(tauri::generate_handler![
            list_devices,
            list_layouts,
            get_layout,
            save_layout,
            start_monitoring,
            stop_monitoring,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
