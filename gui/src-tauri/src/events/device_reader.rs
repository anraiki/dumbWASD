use crate::arbiter_state::SharedArbiter;
use crate::macro_runner::MacroRunner;
use crate::repeat_runner::RepeatRunner;
use anyhow::Result;
use dumbwasd_core::core::event::{InputEvent, OutputAction};
use dumbwasd_core::core::profile::{MacroBindMode, Mapping, OutputTarget};
use dumbwasd_core::core::sticks::{StickThresholds, StickTracker};
use dumbwasd_core::platform::linux::LinuxInput;
use dumbwasd_core::platform::{InputBackend, OutputBackend};
use std::sync::Arc;
use tokio::sync::Mutex;

use super::types::{AxisState, ButtonState, MonitoredEvent};

pub(super) type SharedOutput = Arc<Mutex<Box<dyn OutputBackend>>>;

/// Read events from a single device and send them to the channel.
pub(super) async fn read_device_events(
    device_path: &str,
    tx: tokio::sync::mpsc::Sender<MonitoredEvent>,
    legacy_mappings: Vec<Mapping>,
    output: Option<SharedOutput>,
    macro_runner: MacroRunner,
    repeat_runner: RepeatRunner,
    arbiter: SharedArbiter,
) -> Result<()> {
    let mut input = if output.is_some() {
        LinuxInput::new()
    } else {
        LinuxInput::new_passive()
    };
    input.open_device(device_path).await?;
    let device_name = input.device_name().unwrap_or("Unknown").to_string();

    // Thumbstick motion carries no button code, so it is converted into
    // presses on the synthetic stick codes before anything downstream sees
    // it. The UI highlight and the remap path then treat a stick direction
    // exactly like a button.
    let mut sticks = StickTracker::new(StickThresholds::default());
    for (axis, minimum, maximum, flat) in input.axis_ranges() {
        sticks.set_axis_range(axis, minimum, maximum, flat);
    }

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

                if !forward_button(
                    &tx,
                    device_path,
                    &device_name,
                    code,
                    pressed,
                    &legacy_mappings,
                    &output,
                    &macro_runner,
                    &repeat_runner,
                    &arbiter,
                )
                .await?
                {
                    break;
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

                let mut closed = false;
                for stick_event in sticks.handle_axis(axis, value) {
                    let InputEvent::Button { code, pressed } = stick_event else {
                        continue;
                    };

                    if !forward_button(
                        &tx,
                        device_path,
                        &device_name,
                        code,
                        pressed,
                        &legacy_mappings,
                        &output,
                        &macro_runner,
                        &repeat_runner,
                        &arbiter,
                    )
                    .await?
                    {
                        closed = true;
                        break;
                    }
                }
                if closed {
                    break;
                }

                // A stick direction that is bound replaces the raw axis, so
                // only pass the axis through when nothing claimed it.
                if let Some(output) = &output {
                    if !sticks.has_engaged() {
                        emit_output_actions(output, &[OutputAction::RelativeAxis { axis, value }])
                            .await?;
                    }
                }
            }
            InputEvent::Sync => {}
        }
    }

    // Never leave a synthetic key held after the stream ends.
    for stick_event in sticks.release_all() {
        let InputEvent::Button { code, pressed } = stick_event else {
            continue;
        };
        let _ = forward_button(
            &tx,
            device_path,
            &device_name,
            code,
            pressed,
            &legacy_mappings,
            &output,
            &macro_runner,
            &repeat_runner,
            &arbiter,
        )
        .await;
    }

    Ok(())
}

/// Emit one button (real or synthetic) to the frontend and, when runtime
/// remap is active, to the virtual output device.
///
/// Returns `false` once the channel has closed, meaning the caller should
/// stop reading.
#[allow(clippy::too_many_arguments)]
async fn forward_button(
    tx: &tokio::sync::mpsc::Sender<MonitoredEvent>,
    device_path: &str,
    device_name: &str,
    code: u16,
    pressed: bool,
    legacy_mappings: &[Mapping],
    output: &Option<SharedOutput>,
    macro_runner: &MacroRunner,
    repeat_runner: &RepeatRunner,
    arbiter: &SharedArbiter,
) -> Result<bool> {
    if tx
        .send(MonitoredEvent::Button(ButtonState {
            code,
            pressed,
            device_path: device_path.to_string(),
            device_name: device_name.to_string(),
        }))
        .await
        .is_err()
    {
        return Ok(false);
    }

    let Some(output) = output else {
        return Ok(true);
    };

    match legacy_mappings.iter().find(|mapping| mapping.from == code) {
        // Macro mappings suppress the input and drive playback.
        // The frontend emit path is inactive while runtime remap
        // runs here, so this is the only trigger.
        Some(Mapping {
            to: OutputTarget::Macro { mode, definition },
            ..
        }) => {
            let result = match mode {
                MacroBindMode::Toggle if pressed => macro_runner.toggle(definition.clone()),
                MacroBindMode::Toggle => Ok(false),
                MacroBindMode::Hold if pressed => macro_runner.start(definition.clone()),
                MacroBindMode::Hold => macro_runner.stop(&definition.id),
            };
            if let Err(e) = result {
                tracing::warn!("macro '{}' trigger failed: {e}", definition.id);
            }
        }
        Some(mapping) => {
            // The arbiter decides what actually reaches the output: an
            // exclusive binding silences the others while it is held, and
            // hands back when released. It also tells us which auto-repeats
            // to start and stop as ownership moves.
            match arbiter.resolve(
                code,
                pressed,
                mapping.to.clone(),
                mapping.exclusive,
                mapping.toggle,
            ) {
                Ok(arbitration) => {
                    arbiter.sync_repeats(&arbitration, repeat_runner);
                    emit_output_actions(output, &arbitration.actions).await?;
                }
                Err(e) => tracing::warn!("arbitration for code {code} failed: {e}"),
            }
        }
        None => {
            // Synthetic stick codes are not real evdev keys — passing one
            // through to uinput would emit garbage, so an unbound stick
            // direction stays silent.
            if !dumbwasd_core::core::sticks::is_stick_code(code) {
                emit_output_actions(output, &[passthrough_button_action(code, pressed)]).await?;
            }
        }
    }

    Ok(true)
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

pub(super) async fn emit_output_actions(
    output: &SharedOutput,
    actions: &[OutputAction],
) -> Result<()> {
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
