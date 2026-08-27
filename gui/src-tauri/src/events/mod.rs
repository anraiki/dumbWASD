mod azeron_hid;
mod device_reader;
mod hotplug;
mod types;

use crate::arbiter_state::SharedArbiter;
use crate::macro_runner::MacroRunner;
use crate::repeat_runner::RepeatRunner;
use anyhow::Result;
use dumbwasd_core::core::profile::Mapping;
use dumbwasd_core::platform::OutputBackend;
use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use azeron_hid::read_azeron_hid_events;
use device_reader::read_device_events;
use types::MonitoredEvent;

pub use hotplug::spawn_watcher;

/// How long to wait before re-opening a device that dropped out.
const REOPEN_DELAY: std::time::Duration = std::time::Duration::from_millis(500);

/// Give up after this many back-to-back failures so a device that is
/// genuinely gone does not spin forever. The hotplug watcher restarts
/// monitoring outright if it ever comes back.
const MAX_REOPEN_ATTEMPTS: u32 = 10;

/// A reader that stayed up this long counts as healthy, so the next
/// dropout starts its retry budget over.
const HEALTHY_RUN: std::time::Duration = std::time::Duration::from_secs(3);

pub struct MonitorState {
    task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl Default for MonitorState {
    fn default() -> Self {
        Self {
            task: Arc::new(Mutex::new(None)),
        }
    }
}

pub async fn start_monitoring(
    device_paths: Vec<String>,
    use_azeron_hid: bool,
    legacy_mappings: Vec<Mapping>,
    suppress_mapped_inputs: bool,
    app: tauri::AppHandle,
    state: &MonitorState,
) -> Result<()> {
    // Stop any existing monitoring task
    stop_monitoring(state).await;

    let task_handle = state.task.clone();
    let handle = tokio::spawn(async move {
        if let Err(e) = monitor_devices(
            device_paths,
            use_azeron_hid,
            legacy_mappings,
            suppress_mapped_inputs,
            app,
        )
        .await
        {
            tracing::error!("monitoring error: {e:#}");
        }
    });

    *task_handle.lock().await = Some(handle);
    Ok(())
}

pub async fn stop_monitoring(state: &MonitorState) {
    let mut guard = state.task.lock().await;
    if let Some(handle) = guard.take() {
        handle.abort();
        let _ = handle.await;
    }
}

/// Monitor multiple evdev devices simultaneously, merging their events.
async fn monitor_devices(
    device_paths: Vec<String>,
    use_azeron_hid: bool,
    legacy_mappings: Vec<Mapping>,
    suppress_mapped_inputs: bool,
    app: tauri::AppHandle,
) -> Result<()> {
    // Channel to merge events from all device streams
    let (tx, mut rx) = tokio::sync::mpsc::channel::<MonitoredEvent>(256);
    let output = if suppress_mapped_inputs && !legacy_mappings.is_empty() {
        Some(Arc::new(Mutex::new(
            Box::new(dumbwasd_core::platform::create_output_backend()?) as Box<dyn OutputBackend>,
        )))
    } else {
        None
    };

    let macro_runner = app.state::<MacroRunner>().inner().clone();
    let repeat_runner = app.state::<RepeatRunner>().inner().clone();
    let arbiter = app.state::<SharedArbiter>().inner().clone();
    // Nothing should keep repeating or stay held once monitoring restarts.
    repeat_runner.stop_all();
    let _ = arbiter.release_all();

    // Spawn a reader task for each device path
    for path in &device_paths {
        let tx = tx.clone();
        let path = path.clone();
        let output = output.clone();
        let legacy_mappings = legacy_mappings.clone();
        let macro_runner = macro_runner.clone();
        let repeat_runner = repeat_runner.clone();
        let arbiter = arbiter.clone();
        tokio::spawn(async move {
            // A device that drops out mid-session (unplug, USB glitch, a
            // suspend/resume cycle) used to end this task for good: the node
            // came back on the same path, but nothing re-opened it, so the
            // device stayed silent until monitoring happened to restart.
            let mut failures = 0u32;

            loop {
                let started = std::time::Instant::now();
                let result = read_device_events(
                    &path,
                    tx.clone(),
                    legacy_mappings.clone(),
                    output.clone(),
                    macro_runner.clone(),
                    repeat_runner.clone(),
                    arbiter.clone(),
                )
                .await;

                let Err(e) = result else {
                    // The channel closed — monitoring is going away.
                    break;
                };

                if started.elapsed() >= HEALTHY_RUN {
                    failures = 0;
                }
                failures += 1;

                if failures > MAX_REOPEN_ATTEMPTS {
                    tracing::warn!("device {path} stopped after {failures} attempts: {e:#}");
                    break;
                }

                tracing::debug!("device {path} unavailable ({e:#}); re-opening");
                tokio::time::sleep(REOPEN_DELAY).await;
            }
        });
    }

    if use_azeron_hid {
        let tx = tx.clone();
        tokio::spawn(async move {
            let result = tokio::task::spawn_blocking(move || read_azeron_hid_events(tx)).await;
            match result {
                Ok(Ok(())) => {}
                Ok(Err(e)) => tracing::warn!("azeron hid monitoring stopped: {e:#}"),
                Err(e) => tracing::warn!("azeron hid task join error: {e}"),
            }
        });
    }

    // Drop our copy of tx so the channel closes when all readers are done
    drop(tx);

    tracing::info!(
        "monitoring {} device(s): {:?}",
        device_paths.len(),
        device_paths
    );

    // Forward merged events to the frontend
    while let Some(payload) = rx.recv().await {
        match payload {
            MonitoredEvent::Button(button) => {
                let _ = app.emit("button-state", &button);
            }
            MonitoredEvent::Axis(axis) => {
                let _ = app.emit("axis-state", &axis);
            }
            MonitoredEvent::AzeronHidReport(report) => {
                let _ = app.emit("azeron-hid-report", &report);
            }
            MonitoredEvent::AzeronJoystick(joystick) => {
                let _ = app.emit("azeron-joystick-state", &joystick);
            }
        }
    }

    tracing::info!("all device streams ended");
    Ok(())
}
