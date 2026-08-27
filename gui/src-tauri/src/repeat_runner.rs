use dumbwasd_core::core::event::OutputAction;
use dumbwasd_core::core::profile::OutputTarget;
use dumbwasd_core::platform::{create_output_backend, OutputBackend};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};

/// Drives auto-repeating bindings for as long as their button is held.
///
/// Keyed by the *source* button code rather than the output, so releasing
/// the button that started a repeat is what stops it. Shared between the
/// frontend-driven command path and the suppressed-remap event reader, the
/// same way [`MacroRunner`](crate::macro_runner::MacroRunner) is.
#[derive(Clone, Default)]
pub struct RepeatRunner {
    cancels: Arc<Mutex<HashMap<u16, Arc<AtomicBool>>>>,
}

impl RepeatRunner {
    /// Begin repeating `target` while the button `code` is held.
    ///
    /// The press itself is emitted by the caller; this only schedules the
    /// repeats that follow. A no-op for targets that do not auto-repeat, and
    /// for a button already repeating.
    pub fn start(&self, code: u16, target: &OutputTarget) -> Result<bool, String> {
        let Some(interval) = target.repeat_interval() else {
            return Ok(false);
        };
        let actions = target.repeat_actions();
        if actions.is_empty() {
            return Ok(false);
        }

        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut cancels = self
                .cancels
                .lock()
                .map_err(|_| "Repeat runner state poisoned".to_string())?;
            if cancels.contains_key(&code) {
                return Ok(false);
            }
            cancels.insert(code, cancel.clone());
        }

        let cancels = self.cancels.clone();
        tokio::spawn(async move {
            if let Err(e) = run_repeat(&actions, interval, &cancel).await {
                tracing::warn!("auto-repeat for code {code} stopped: {e}");
            }

            // Only clear our own entry — a fast release/press may already
            // have installed a fresh flag for the same button.
            if let Ok(mut cancels) = cancels.lock() {
                if cancels
                    .get(&code)
                    .is_some_and(|current| Arc::ptr_eq(current, &cancel))
                {
                    cancels.remove(&code);
                }
            }
        });

        Ok(true)
    }

    /// Stop repeating for a button. Returns true when a repeat was running.
    pub fn stop(&self, code: u16) -> Result<bool, String> {
        let mut cancels = self
            .cancels
            .lock()
            .map_err(|_| "Repeat runner state poisoned".to_string())?;
        if let Some(cancel) = cancels.remove(&code) {
            cancel.store(true, Ordering::SeqCst);
            return Ok(true);
        }
        Ok(false)
    }

    /// Stop every running repeat, for when monitoring shuts down.
    pub fn stop_all(&self) {
        if let Ok(mut cancels) = self.cancels.lock() {
            for (_, cancel) in cancels.drain() {
                cancel.store(true, Ordering::SeqCst);
            }
        }
    }
}

async fn run_repeat(
    actions: &[OutputAction],
    interval: Duration,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let mut output: Box<dyn OutputBackend> =
        Box::new(create_output_backend().map_err(|e| format!("{e:#}"))?);

    loop {
        if !sleep_unless_canceled(cancel, interval).await {
            return Ok(());
        }

        for action in actions {
            output.emit(action).map_err(|e| format!("{e:#}"))?;
        }
        output.emit_sync().map_err(|e| format!("{e:#}"))?;
    }
}

/// Sleep in slices so a release stops the repeat promptly even when the
/// configured interval is long.
async fn sleep_unless_canceled(cancel: &AtomicBool, duration: Duration) -> bool {
    let mut remaining = duration;
    let slice = Duration::from_millis(10);

    while !remaining.is_zero() {
        if cancel.load(Ordering::SeqCst) {
            return false;
        }
        let step = remaining.min(slice);
        sleep(step).await;
        remaining -= step;
    }

    !cancel.load(Ordering::SeqCst)
}
