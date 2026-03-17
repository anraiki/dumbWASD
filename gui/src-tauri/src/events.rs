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
    pub device_path: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AxisState {
    pub axis: u16,
    pub value: i32,
    pub device_path: String,
    pub device_name: String,
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
    let (tx, mut rx) = tokio::sync::mpsc::channel::<MonitoredEvent>(256);

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
        }
    }

    tracing::info!("all device streams ended");
    Ok(())
}

/// Read events from a single device and send them to the channel.
async fn read_device_events(
    device_path: &str,
    tx: tokio::sync::mpsc::Sender<MonitoredEvent>,
) -> Result<()> {
    let mut input = LinuxInput::new_passive();
    input.open_device(device_path).await?;
    let device_name = input.device_name().unwrap_or("Unknown").to_string();

    tracing::info!("listening on {device_name} ({device_path})");

    loop {
        let event = input.next_event().await?;

        match event {
            InputEvent::Button { code, pressed } => {
                tracing::trace!(
                    device_name = %device_name,
                    device_path = %device_path,
                    code,
                    pressed,
                    "monitored button event"
                );

                if tx
                    .send(MonitoredEvent::Button(ButtonState {
                        code,
                        pressed,
                        device_path: device_path.to_string(),
                        device_name: device_name.clone(),
                    }))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            InputEvent::Axis { axis, value } => {
                tracing::trace!(
                    device_name = %device_name,
                    device_path = %device_path,
                    axis,
                    value,
                    "monitored axis event"
                );

                if tx
                    .send(MonitoredEvent::Axis(AxisState {
                        axis,
                        value,
                        device_path: device_path.to_string(),
                        device_name: device_name.clone(),
                    }))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            InputEvent::Sync => {}
        }
    }

    Ok(())
}

enum MonitoredEvent {
    Button(ButtonState),
    Axis(AxisState),
}
