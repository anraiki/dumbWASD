use dumbwasd_core::core::event::OutputAction;
use dumbwasd_core::platform::OutputBackend;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use tokio::time::{sleep, Duration};

pub struct ScriptControl {
    cancel_version: AtomicU64,
    running_scripts: AtomicUsize,
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

    pub fn request_cancel(&self) {
        self.cancel_version.fetch_add(1, Ordering::SeqCst);
    }

    fn is_canceled(&self, token: u64) -> bool {
        self.cancel_version.load(Ordering::SeqCst) != token
    }

    pub fn has_running_scripts(&self) -> bool {
        self.running_scripts.load(Ordering::SeqCst) > 0
    }
}

#[tauri::command]
pub async fn run_test_macro(state: tauri::State<'_, ScriptControl>) -> Result<(), String> {
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
