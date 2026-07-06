#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod events;
mod macro_runner;

use commands::output::OutputState;
use commands::scripts::ScriptControl;
use events::MonitorState;
use macro_runner::MacroRunner;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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
    if std::env::var_os("DUMBWASD_MACROS_FILE").is_none() {
        std::env::set_var("DUMBWASD_MACROS_FILE", project_root.join("macros.toml"));
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
        .manage(MacroRunner::default())
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
            commands::devices::list_devices,
            commands::layouts::list_layouts,
            commands::layouts::get_layout,
            commands::devices::resolve_layout_for_device,
            commands::devices::get_device_registry_toml,
            commands::layouts::save_layout,
            commands::monitoring::start_monitoring,
            commands::monitoring::stop_monitoring,
            commands::profiles::list_profiles,
            commands::profiles::get_profile,
            commands::profiles::save_profile,
            commands::macros::list_macros,
            commands::macros::save_macro,
            commands::macros::delete_macro,
            commands::macros::toggle_macro_playback,
            commands::macros::start_macro_playback,
            commands::macros::stop_macro_playback,
            commands::output::emit_output_target,
            commands::profiles::create_profile,
            commands::overlay::toggle_overlay,
            commands::scripts::run_test_macro,
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
