use dumbwasd_core::core::layout::{self, DeviceLayout};

#[tauri::command]
pub fn list_layouts() -> Result<Vec<String>, String> {
    layout::list_layouts().map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn get_layout(name: String) -> Result<DeviceLayout, String> {
    DeviceLayout::load(&name).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn save_layout(name: String, layout: DeviceLayout) -> Result<String, String> {
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
