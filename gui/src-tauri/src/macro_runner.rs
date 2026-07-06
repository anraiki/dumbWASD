use dumbwasd_core::core::event::OutputAction;
use dumbwasd_core::core::macros::SavedMacro;
use dumbwasd_core::core::profile::MacroStep;
use dumbwasd_core::platform::OutputBackend;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};

/// Tracks running macro playbacks by macro id so a second trigger can stop them.
///
/// Shared between the `toggle_macro_playback` Tauri command (frontend-driven
/// triggers) and the monitoring event reader (suppressed-remap triggers).
#[derive(Clone, Default)]
pub struct MacroRunner {
    cancels: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl MacroRunner {
    /// Start playing a macro unless it is already playing.
    /// Returns true when playback started, false when it was already running.
    ///
    /// `saved` is the profile-embedded snapshot - the library is never
    /// consulted for playback. Playbacks are keyed by the snapshot's id.
    pub fn start(&self, saved: SavedMacro) -> Result<bool, String> {
        let key = saved.id.clone();
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut cancels = self
                .cancels
                .lock()
                .map_err(|_| "Macro runner state poisoned".to_string())?;
            if cancels.contains_key(&key) {
                return Ok(false);
            }
            cancels.insert(key.clone(), cancel.clone());
        }

        let cancels = self.cancels.clone();
        tokio::spawn(async move {
            tracing::info!("macro '{key}' playback started");
            if let Err(e) = run_saved_macro(&saved, &cancel).await {
                tracing::warn!("macro '{key}' playback failed: {e}");
            }

            // Only remove our own entry: a rapid stop+restart may have inserted
            // a fresh cancel flag for the same id.
            if let Ok(mut cancels) = cancels.lock() {
                if cancels
                    .get(&key)
                    .is_some_and(|current| Arc::ptr_eq(current, &cancel))
                {
                    cancels.remove(&key);
                }
            }
            tracing::info!("macro '{key}' playback ended");
        });

        Ok(true)
    }

    /// Stop a playing macro. Returns true when a playback was stopped,
    /// false when nothing with this id was running.
    pub fn stop(&self, id: &str) -> Result<bool, String> {
        let mut cancels = self
            .cancels
            .lock()
            .map_err(|_| "Macro runner state poisoned".to_string())?;
        if let Some(cancel) = cancels.remove(id) {
            cancel.store(true, Ordering::SeqCst);
            tracing::info!("macro '{id}' playback stop requested");
            return Ok(true);
        }
        Ok(false)
    }

    /// Start playing a macro, or stop it if it is already playing.
    /// Returns true when playback started, false when it was stopped.
    pub fn toggle(&self, saved: SavedMacro) -> Result<bool, String> {
        if self.stop(&saved.id)? {
            return Ok(false);
        }
        self.start(saved)
    }
}

/// Sleep in small slices so cancellation stays responsive.
/// Returns false when the sleep was interrupted by cancellation.
async fn sleep_unless_canceled(cancel: &AtomicBool, duration_ms: u64) -> bool {
    let mut remaining_ms = duration_ms;
    while remaining_ms > 0 {
        if cancel.load(Ordering::SeqCst) {
            return false;
        }
        let slice_ms = remaining_ms.min(25);
        sleep(Duration::from_millis(slice_ms)).await;
        remaining_ms -= slice_ms;
    }
    !cancel.load(Ordering::SeqCst)
}

fn emit(
    output: &mut Box<dyn OutputBackend>,
    held: &mut Vec<(u16, bool)>,
    code: u16,
    is_mouse: bool,
    pressed: bool,
) -> Result<(), String> {
    let action = if is_mouse {
        OutputAction::MouseButton { code, pressed }
    } else {
        OutputAction::Key { code, pressed }
    };
    output.emit(&action).map_err(|e| format!("{e:#}"))?;
    output.emit_sync().map_err(|e| format!("{e:#}"))?;

    if pressed {
        if !held.contains(&(code, is_mouse)) {
            held.push((code, is_mouse));
        }
    } else {
        held.retain(|entry| *entry != (code, is_mouse));
    }
    Ok(())
}

async fn run_saved_macro(saved: &SavedMacro, cancel: &AtomicBool) -> Result<(), String> {
    let mut output: Box<dyn OutputBackend> =
        Box::new(dumbwasd_core::platform::create_output_backend().map_err(|e| format!("{e:#}"))?);
    // Inputs currently held down by this playback: (code, is_mouse_button).
    let mut held: Vec<(u16, bool)> = Vec::new();
    let iterations = saved.iterations.max(1);

    let playback: Result<(), String> = async {
        if saved.lead_in_ms > 0 && !sleep_unless_canceled(cancel, saved.lead_in_ms as u64).await {
            return Ok(());
        }

        'iterations: for iteration in 0..iterations {
            for step in &saved.steps {
                if cancel.load(Ordering::SeqCst) {
                    break 'iterations;
                }

                match step {
                    MacroStep::KeyDown { code } => {
                        emit(&mut output, &mut held, *code, false, true)?
                    }
                    MacroStep::KeyUp { code } => emit(&mut output, &mut held, *code, false, false)?,
                    MacroStep::KeyTap { code } => {
                        emit(&mut output, &mut held, *code, false, true)?;
                        emit(&mut output, &mut held, *code, false, false)?;
                    }
                    MacroStep::MouseButton { code, pressed } => {
                        emit(&mut output, &mut held, *code, true, *pressed)?
                    }
                    MacroStep::Delay { ms } => {
                        if !sleep_unless_canceled(cancel, *ms as u64).await {
                            break 'iterations;
                        }
                    }
                }
            }

            if iteration < iterations - 1
                && saved.pause_between_iterations_ms > 0
                && !sleep_unless_canceled(cancel, saved.pause_between_iterations_ms as u64).await
            {
                break 'iterations;
            }
        }
        Ok(())
    }
    .await;

    // Always release anything this playback still holds, even on error/cancel.
    for (code, is_mouse) in held.iter().rev().copied().collect::<Vec<_>>() {
        let _ = emit(&mut output, &mut held, code, is_mouse, false);
    }

    playback
}
