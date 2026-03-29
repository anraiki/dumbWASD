use anyhow::Result;
use dumbwasd_core::core::event::{InputEvent, OutputAction};
use dumbwasd_core::core::profile::Mapping;
use dumbwasd_core::devices::azeron;
use dumbwasd_core::devices::azeron::JoystickState as AzeronJoystickState;
use dumbwasd_core::platform::linux::LinuxInput;
use dumbwasd_core::platform::{InputBackend, OutputBackend};
use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
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
    pub minimum: Option<i32>,
    pub maximum: Option<i32>,
    pub flat: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AzeronHidReport {
    pub length: usize,
    pub hex: String,
    pub ascii: Option<String>,
    pub parsed_source: Option<String>,
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
        Some(Arc::new(Mutex::new(Box::new(
            dumbwasd_core::platform::create_output_backend()?,
        ) as Box<dyn OutputBackend>)))
    } else {
        None
    };

    // Spawn a reader task for each device path
    for path in &device_paths {
        let tx = tx.clone();
        let path = path.clone();
        let output = output.clone();
        let legacy_mappings = legacy_mappings.clone();
        tokio::spawn(async move {
            if let Err(e) = read_device_events(&path, tx, legacy_mappings, output).await {
                tracing::warn!("device {path} stopped: {e:#}");
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

/// Read events from a single device and send them to the channel.
async fn read_device_events(
    device_path: &str,
    tx: tokio::sync::mpsc::Sender<MonitoredEvent>,
    legacy_mappings: Vec<Mapping>,
    output: Option<SharedOutput>,
) -> Result<()> {
    let mut input = if output.is_some() {
        LinuxInput::new()
    } else {
        LinuxInput::new_passive()
    };
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

                if let Some(output) = &output {
                    let actions = resolve_legacy_mapping(code, pressed, &legacy_mappings)
                        .unwrap_or_else(|| vec![passthrough_button_action(code, pressed)]);

                    emit_output_actions(output, &actions).await?;
                }
            }
            InputEvent::Axis { axis, value } => {
                let axis_info = input.axis_info(axis);
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
                        minimum: axis_info.map(|info| info.minimum),
                        maximum: axis_info.map(|info| info.maximum),
                        flat: axis_info.map(|info| info.flat),
                    }))
                    .await
                    .is_err()
                {
                    break;
                }

                if let Some(output) = &output {
                    emit_output_actions(output, &[OutputAction::RelativeAxis { axis, value }]).await?;
                }
            }
            InputEvent::Sync => {}
        }
    }

    Ok(())
}

type SharedOutput = Arc<Mutex<Box<dyn OutputBackend>>>;

fn resolve_legacy_mapping(code: u16, pressed: bool, mappings: &[Mapping]) -> Option<Vec<OutputAction>> {
    let mapping = mappings.iter().find(|mapping| mapping.from == code)?;

    Some(mapping.to.actions(pressed))
}

fn passthrough_button_action(code: u16, pressed: bool) -> OutputAction {
    if is_mouse_button_code(code) {
        OutputAction::MouseButton { code, pressed }
    } else {
        OutputAction::Key { code, pressed }
    }
}

fn is_mouse_button_code(code: u16) -> bool {
    (0x110..=0x117).contains(&code)
}

async fn emit_output_actions(output: &SharedOutput, actions: &[OutputAction]) -> Result<()> {
    if actions.is_empty() {
        return Ok(());
    }

    let mut output = output.lock().await;
    for action in actions {
        output.emit(action)?;
    }
    output.emit_sync()?;
    Ok(())
}

fn read_azeron_hid_events(tx: tokio::sync::mpsc::Sender<MonitoredEvent>) -> Result<()> {
    let device = azeron::open_config_device()?;
    let mut buf = [0u8; 64];
    let mut last_ping_at = Instant::now() - Duration::from_secs(10);

    tracing::info!("listening on Azeron config HID interface");
    azeron::prime_joystick_stream(&device)?;

    loop {
        if last_ping_at.elapsed() >= Duration::from_secs(3) {
            if let Err(error) = azeron::ping_device_binary(&device) {
                tracing::debug!("azeron hid ping failed: {error:#}");
            } else {
                last_ping_at = Instant::now();
            }
        }

        let n = device.read_timeout(&mut buf, 100)?;
        if n == 0 {
            continue;
        }

        let report = &buf[..n];
        let joystick = azeron::parse_joystick_state(report);
        let hid_report = AzeronHidReport {
            length: n,
            hex: format_hex(report),
            ascii: format_ascii(report),
            parsed_source: joystick.as_ref().map(|state| state.source.clone()),
        };

        if tx
            .blocking_send(MonitoredEvent::AzeronHidReport(hid_report))
            .is_err()
        {
            break;
        }

        if let Some(joystick) = joystick {
            if tx
                .blocking_send(MonitoredEvent::AzeronJoystick(joystick))
                .is_err()
            {
                break;
            }
        }
    }

    Ok(())
}

fn format_hex(report: &[u8]) -> String {
    report
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_ascii(report: &[u8]) -> Option<String> {
    let ascii = report
        .iter()
        .map(|byte| match byte {
            0x20..=0x7e => char::from(*byte),
            _ => '.',
        })
        .collect::<String>()
        .trim_matches('.')
        .to_string();

    if ascii.is_empty() {
        None
    } else {
        Some(ascii)
    }
}

enum MonitoredEvent {
    Button(ButtonState),
    Axis(AxisState),
    AzeronHidReport(AzeronHidReport),
    AzeronJoystick(AzeronJoystickState),
}
