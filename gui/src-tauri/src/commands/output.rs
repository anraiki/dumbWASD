use dumbwasd_core::core::profile::OutputTarget;
use dumbwasd_core::platform::OutputBackend;
use std::sync::Mutex;

#[derive(Default)]
pub struct OutputState {
    backend: Mutex<Option<Box<dyn OutputBackend>>>,
}

#[tauri::command]
pub fn emit_output_target(
    target: OutputTarget,
    pressed: bool,
    state: tauri::State<'_, OutputState>,
) -> Result<(), String> {
    let mut backend_guard = state
        .backend
        .lock()
        .map_err(|_| "Failed to lock output backend".to_string())?;

    if backend_guard.is_none() {
        let backend =
            dumbwasd_core::platform::create_output_backend().map_err(|e| format!("{e:#}"))?;
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
