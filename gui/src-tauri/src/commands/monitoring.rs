use crate::events::{self, MonitorState};
use dumbwasd_core::core::profile::Mapping;

#[tauri::command]
pub async fn start_monitoring(
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
pub async fn stop_monitoring(state: tauri::State<'_, MonitorState>) -> Result<(), String> {
    events::stop_monitoring(&state).await;
    Ok(())
}
