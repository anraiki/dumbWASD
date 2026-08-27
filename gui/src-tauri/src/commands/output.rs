use crate::arbiter_state::SharedArbiter;
use crate::repeat_runner::RepeatRunner;
use dumbwasd_core::core::event::OutputAction;
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
    code: Option<u16>,
    exclusive: Option<bool>,
    toggle: Option<bool>,
    state: tauri::State<'_, OutputState>,
    repeat: tauri::State<'_, RepeatRunner>,
    arbiter: tauri::State<'_, SharedArbiter>,
) -> Result<(), String> {
    // With a source button known, the arbiter decides what may reach the
    // output — an exclusive binding silences everything else while held.
    // Without one there is nothing to arbitrate against, so emit directly.
    let actions = match code {
        Some(code) => {
            let arbitration = arbiter.resolve(
                code,
                pressed,
                target,
                exclusive.unwrap_or(false),
                toggle.unwrap_or(false),
            )?;
            arbiter.sync_repeats(&arbitration, &repeat);
            arbitration.actions
        }
        None => target.actions(pressed),
    };

    emit(&state, &actions)
}

fn emit(state: &tauri::State<'_, OutputState>, actions: &[OutputAction]) -> Result<(), String> {
    if actions.is_empty() {
        return Ok(());
    }

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

    for action in actions {
        backend.emit(action).map_err(|e| format!("{e:#}"))?;
    }
    backend.emit_sync().map_err(|e| format!("{e:#}"))?;
    Ok(())
}
