use anyhow::Result;
use dumbwasd_core::core::event::InputEvent;
use dumbwasd_core::platform::linux::LinuxInput;
use dumbwasd_core::platform::InputBackend;
use serde::Serialize;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Serialize)]
pub struct ButtonState {
    pub code: u16,
    pub pressed: bool,
}

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
    app: tauri::AppHandle,
    state: &MonitorState,
) -> Result<()> {
    // Stop any existing monitoring task
    stop_monitoring(state).await;

    let task_handle = state.task.clone();
    let handle = tokio::spawn(async move {
        if let Err(e) = monitor_devices(device_paths, app).await {
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
async fn monitor_devices(device_paths: Vec<String>, app: tauri::AppHandle) -> Result<()> {
    // Channel to merge events from all device streams
    let (tx, mut rx) = tokio::sync::mpsc::channel::<ButtonState>(256);

    // Spawn a reader task for each device path
    for path in &device_paths {
        let tx = tx.clone();
        let path = path.clone();
        tokio::spawn(async move {
            if let Err(e) = read_device_events(&path, tx).await {
                tracing::warn!("device {path} stopped: {e:#}");
            }
        });
    }

    // Drop our copy of tx so the channel closes when all readers are done
    drop(tx);

    tracing::info!("monitoring {} device(s): {:?}", device_paths.len(), device_paths);

    // Forward merged events to the frontend
    while let Some(payload) = rx.recv().await {
        let _ = app.emit("button-state", &payload);
    }

    tracing::info!("all device streams ended");
    Ok(())
}

/// Read events from a single device and send them to the channel.
async fn read_device_events(
    device_path: &str,
    tx: tokio::sync::mpsc::Sender<ButtonState>,
) -> Result<()> {
    let mut input = LinuxInput::new_passive();
    input.open_device(device_path).await?;

    tracing::info!("listening on {device_path}");

    loop {
        let event = input.next_event().await?;

        if let InputEvent::Button { code, pressed } = event {
            // If the receiver is closed, stop reading
            if tx.send(ButtonState { code, pressed }).await.is_err() {
                break;
            }
        }
    }

    Ok(())
}
