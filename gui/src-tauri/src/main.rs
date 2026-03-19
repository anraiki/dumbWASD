#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod events;

use dumbwasd_core::core::config;
use dumbwasd_core::core::event::OutputAction;
use dumbwasd_core::core::layout::{self, DeviceLayout};
use dumbwasd_core::core::profile::{Mapping, OutputTarget, Profile, ProfileMeta};
use dumbwasd_core::devices::{self, registry, DeviceInfo};
use dumbwasd_core::platform::{InputBackend, OutputBackend};
use events::MonitorState;
use indexmap::IndexMap;
use serde::Serialize;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tokio::time::{sleep, Duration};

#[derive(Debug, Clone, Serialize)]
struct DeviceEntry {
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
struct DeviceRegistryToml {
    path: String,
    content: String,
}

struct ScriptControl {
    cancel_version: AtomicU64,
    running_scripts: AtomicUsize,
}

#[derive(Default)]
struct OutputState {
    backend: Mutex<Option<Box<dyn OutputBackend>>>,
}

impl Default for ScriptControl {
    fn default() -> Self {
        Self {
            cancel_version: AtomicU64::new(0),
            running_scripts: AtomicUsize::new(0),
        }
    }
}

impl ScriptControl {
    fn begin_run(&self) -> u64 {
        self.running_scripts.fetch_add(1, Ordering::SeqCst);
        self.cancel_version.load(Ordering::SeqCst)
    }

    fn finish_run(&self) {
        self.running_scripts.fetch_sub(1, Ordering::SeqCst);
    }

    fn request_cancel(&self) {
        self.cancel_version.fetch_add(1, Ordering::SeqCst);
    }

    fn is_canceled(&self, token: u64) -> bool {
        self.cancel_version.load(Ordering::SeqCst) != token
    }

    fn has_running_scripts(&self) -> bool {
        self.running_scripts.load(Ordering::SeqCst) > 0
    }
}

#[tauri::command]
async fn list_devices() -> Result<Vec<DeviceEntry>, String> {
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

        let entry = groups.entry(device_id.clone()).or_insert_with(|| DeviceEntry {
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
fn list_layouts() -> Result<Vec<String>, String> {
    layout::list_layouts().map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_layout(name: String) -> Result<DeviceLayout, String> {
    DeviceLayout::load(&name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn resolve_layout_for_device(
    vendor_id: u16,
    product_id: u16,
    name: String,
    raw_name: Option<String>,
) -> Result<Option<String>, String> {
    let registry_entry = registry::find_entry(vendor_id, product_id, Some(&name))
        .or_else(|| raw_name.as_deref().and_then(|raw_name| {
            registry::find_entry(vendor_id, product_id, Some(raw_name))
        }));

    if let Some(entry) = registry_entry {
        let known_layouts = layout::list_layouts().map_err(|e| format!("{e:#}"))?;

        if let Some(default_layout) = entry.default_layout_name() {
            if known_layouts.iter().any(|candidate| candidate == default_layout) {
                return Ok(Some(default_layout.to_string()));
            }
        }

        for candidate in &entry.layout_candidates {
            if known_layouts.iter().any(|layout_name| layout_name == candidate) {
                return Ok(Some(candidate.clone()));
            }
        }
    }

    layout::resolve_layout_name(vendor_id, product_id, &name, raw_name.as_deref())
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_device_registry_toml(
    vendor_id: u16,
    product_id: u16,
    name: String,
    raw_name: Option<String>,
) -> Result<Option<DeviceRegistryToml>, String> {
    let record = registry::find_entry_record(vendor_id, product_id, Some(&name))
        .or_else(|| {
            raw_name
                .as_deref()
                .and_then(|raw_name| registry::find_entry_record(vendor_id, product_id, Some(raw_name)))
        });

    Ok(record.map(|(_entry, path, content)| DeviceRegistryToml {
        path: path.to_string_lossy().to_string(),
        content,
    }))
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
    use_azeron_hid: bool,
    legacy_mappings: Vec<Mapping>,
    suppress_mapped_inputs: bool,
    app: tauri::AppHandle,
    state: tauri::State<'_, MonitorState>,
) -> Result<(), String> {
    events::start_monitoring(
        device_paths,
        use_azeron_hid,
        legacy_mappings,
        suppress_mapped_inputs,
        app,
        &state,
    )
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn stop_monitoring(state: tauri::State<'_, MonitorState>) -> Result<(), String> {
    events::stop_monitoring(&state).await;
    Ok(())
}

#[tauri::command]
fn list_profiles() -> Result<Vec<String>, String> {
    config::list_profiles().map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_profile(name: String) -> Result<Profile, String> {
    Profile::load(&name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn save_profile(name: String, profile: Profile) -> Result<String, String> {
    let path = profile.save(&name).map_err(|e| format!("{e:#}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn emit_output_target(
    target: OutputTarget,
    pressed: bool,
    state: tauri::State<'_, OutputState>,
) -> Result<(), String> {
    let mut backend_guard = state
        .backend
        .lock()
        .map_err(|_| "Failed to lock output backend".to_string())?;

    if backend_guard.is_none() {
        let backend = dumbwasd_core::platform::create_output_backend()
            .map_err(|e| format!("{e:#}"))?;
        *backend_guard = Some(Box::new(backend));
    }

    let backend = backend_guard
        .as_mut()
        .ok_or_else(|| "Output backend unavailable".to_string())?;

    let actions = target.actions(pressed);
    if actions.is_empty() {
        return Ok(());
    }

    for action in &actions {
        backend.emit(action).map_err(|e| format!("{e:#}"))?;
    }
    backend.emit_sync().map_err(|e| format!("{e:#}"))?;
    Ok(())
}

#[tauri::command]
fn create_profile(name: String) -> Result<String, String> {
    let slug = name.to_lowercase().replace(' ', "-");
    let profile = Profile {
        profile: ProfileMeta {
            name: name.clone(),
            device_name: None,
        },
        devices: Vec::new(),
        mappings: Vec::new(),
    };
    profile.save(&slug).map_err(|e| format!("{e:#}"))?;
    Ok(slug)
}

#[tauri::command]
async fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let label = "overlay";
    if let Some(win) = app.get_webview_window(label) {
        // Already open — close it
        win.close().map_err(|e| format!("{e:#}"))?;
        Ok(false)
    } else {
        // Create a new transparent, frameless, always-on-top window
        WebviewWindowBuilder::new(&app, label, WebviewUrl::App("/overlay.html".into()))
            .title("dumbWASD Overlay")
            .inner_size(320.0, 400.0)
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(true)
            .build()
            .map_err(|e| format!("{e:#}"))?;
        Ok(true)
    }
}

#[tauri::command]
async fn run_test_macro(state: tauri::State<'_, ScriptControl>) -> Result<(), String> {
    let mut output =
        dumbwasd_core::platform::create_output_backend().map_err(|e| format!("{e:#}"))?;
    let run_token = state.begin_run();
    let mut a_held = false;

    tracing::info!("running hardcoded macro test");

    let result = async {
        sleep_with_cancel(&state, run_token, 1000).await?;

        output
            .emit(&OutputAction::Key {
                code: 30,
                pressed: true,
            })
            .map_err(|e| format!("{e:#}"))?;
        output.emit_sync().map_err(|e| format!("{e:#}"))?;
        a_held = true;

        sleep_with_cancel(&state, run_token, 10_000).await?;

        output
            .emit(&OutputAction::Key {
                code: 30,
                pressed: false,
            })
            .map_err(|e| format!("{e:#}"))?;
        output.emit_sync().map_err(|e| format!("{e:#}"))?;
        a_held = false;

        tracing::info!("hardcoded macro test complete");
        Ok::<(), String>(())
    }
    .await;

    if a_held {
        let _ = output.emit(&OutputAction::Key {
            code: 30,
            pressed: false,
        });
        let _ = output.emit_sync();
    }

    state.finish_run();
    result
}

async fn sleep_with_cancel(
    state: &ScriptControl,
    token: u64,
    duration_ms: u64,
) -> Result<(), String> {
    let mut remaining_ms = duration_ms;
    while remaining_ms > 0 {
        if state.is_canceled(token) {
            return Err("Script canceled by Ctrl+C".to_string());
        }

        let slice_ms = remaining_ms.min(25);
        sleep(Duration::from_millis(slice_ms)).await;
        remaining_ms -= slice_ms;
    }

    if state.is_canceled(token) {
        return Err("Script canceled by Ctrl+C".to_string());
    }

    Ok(())
}

fn main() {
    // Work around WebKitGTK crash on Wayland with DMA-BUF renderer
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // Resolve project root so layouts/profiles/devices are found regardless of CWD.
    // In dev mode, the Tauri CWD is gui/, so we go up one level.
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    // CARGO_MANIFEST_DIR = gui/src-tauri, project root is two levels up
    let project_root = manifest.parent().and_then(|p| p.parent()).unwrap();
    if std::env::var_os("DUMBWASD_LAYOUTS_DIR").is_none() {
        std::env::set_var("DUMBWASD_LAYOUTS_DIR", project_root.join("layouts"));
    }
    if std::env::var_os("DUMBWASD_PROFILES_DIR").is_none() {
        std::env::set_var("DUMBWASD_PROFILES_DIR", project_root.join("profiles"));
    }
    if std::env::var_os("DUMBWASD_DEVICE_REGISTRY_DIR").is_none() {
        std::env::set_var("DUMBWASD_DEVICE_REGISTRY_DIR", project_root.join("devices"));
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .manage(MonitorState::default())
        .manage(ScriptControl::default())
        .manage(OutputState::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let cancel_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyC);
                    if *shortcut != cancel_shortcut {
                        return;
                    }

                    let control = app.state::<ScriptControl>();
                    if control.has_running_scripts() {
                        tracing::info!("Ctrl+C received, canceling running scripts");
                    }
                    control.request_cancel();
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            list_devices,
            list_layouts,
            get_layout,
            resolve_layout_for_device,
            get_device_registry_toml,
            save_layout,
            start_monitoring,
            stop_monitoring,
            list_profiles,
            get_profile,
            save_profile,
            emit_output_target,
            create_profile,
            toggle_overlay,
            run_test_macro,
        ])
        .setup(|app| {
            let cancel_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyC);
            app.global_shortcut()
                .register(cancel_shortcut)
                .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
