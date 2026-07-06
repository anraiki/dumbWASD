use tauri::Manager;

#[tauri::command]
pub async fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
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
