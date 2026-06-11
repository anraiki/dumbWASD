use anyhow::{Context, Result};
use async_trait::async_trait;
use evdev::{Device, EventStream, EventType, KeyCode, RelativeAxisCode};
use std::collections::{HashMap, VecDeque};

use crate::core::event::InputEvent;
use crate::devices::DeviceInfo;
use crate::platform::InputBackend;

const ABS_HAT0X: u16 = 0x10;
const ABS_HAT0Y: u16 = 0x11;

#[derive(Debug, Clone, Copy)]
pub struct AxisInfo {
    pub minimum: i32,
    pub maximum: i32,
    pub flat: i32,
}

pub struct LinuxInput {
    stream: Option<EventStream>,
    grab: bool,
    device_name: Option<String>,
    axis_info: HashMap<u16, AxisInfo>,
    /// Synthesized events waiting to be returned (a single hat transition can produce two).
    pending: VecDeque<InputEvent>,
    /// Last seen value per digital hat axis, for press/release synthesis.
    hat_values: HashMap<u16, i32>,
}

impl LinuxInput {
    pub fn new() -> Self {
        Self {
            stream: None,
            grab: true,
            device_name: None,
            axis_info: HashMap::new(),
            pending: VecDeque::new(),
            hat_values: HashMap::new(),
        }
    }

    /// Create an input backend that does NOT grab the device (for monitoring).
    pub fn new_passive() -> Self {
        Self {
            stream: None,
            grab: false,
            device_name: None,
            axis_info: HashMap::new(),
            pending: VecDeque::new(),
            hat_values: HashMap::new(),
        }
    }

    pub fn device_name(&self) -> Option<&str> {
        self.device_name.as_deref()
    }

    pub fn axis_info(&self, axis: u16) -> Option<AxisInfo> {
        self.axis_info.get(&axis).copied()
    }

    /// Digital hats (gamepad d-pads) report ABS_HAT0X/Y with a -1..1 range.
    /// They are surfaced as BTN_DPAD_* button events instead of axis events.
    fn is_digital_hat(&self, axis: u16) -> bool {
        (axis == ABS_HAT0X || axis == ABS_HAT0Y)
            && self
                .axis_info
                .get(&axis)
                .is_some_and(|info| info.minimum == -1 && info.maximum == 1)
    }

    fn dpad_button(axis: u16, direction: i32) -> u16 {
        match (axis, direction.signum()) {
            (ABS_HAT0X, -1) => KeyCode::BTN_DPAD_LEFT.0,
            (ABS_HAT0X, _) => KeyCode::BTN_DPAD_RIGHT.0,
            (ABS_HAT0Y, -1) => KeyCode::BTN_DPAD_UP.0,
            (_, _) => KeyCode::BTN_DPAD_DOWN.0,
        }
    }

    /// Translate a digital hat value change into d-pad button events.
    /// Returns the first event; any second event (release+press on a direct
    /// flip from -1 to 1) is queued in `pending`.
    fn queue_hat_transition(&mut self, axis: u16, value: i32) -> Option<InputEvent> {
        let previous = self.hat_values.insert(axis, value).unwrap_or(0);
        if previous == value {
            return None;
        }
        if previous != 0 {
            self.pending.push_back(InputEvent::Button {
                code: Self::dpad_button(axis, previous),
                pressed: false,
            });
        }
        if value != 0 {
            self.pending.push_back(InputEvent::Button {
                code: Self::dpad_button(axis, value),
                pressed: true,
            });
        }
        self.pending.pop_front()
    }
}

#[async_trait]
impl InputBackend for LinuxInput {
    async fn list_devices(&self) -> Result<Vec<DeviceInfo>> {
        let mut devices = Vec::new();

        for (path, device) in evdev::enumerate() {
            let name = device.name().unwrap_or("Unknown").to_string();
            let input_id = device.input_id();
            let supported_keys = device.supported_keys();
            let supported_relative_axes = device.supported_relative_axes();
            let has_keyboard = supported_keys.is_some_and(|keys| {
                keys.contains(KeyCode::KEY_A)
                    || keys.contains(KeyCode::KEY_Z)
                    || keys.contains(KeyCode::KEY_SPACE)
                    || keys.contains(KeyCode::KEY_ENTER)
            });
            let has_gamepad = supported_keys.is_some_and(|keys| {
                keys.contains(KeyCode::BTN_SOUTH)
                    || keys.contains(KeyCode::BTN_EAST)
                    || keys.contains(KeyCode::BTN_TRIGGER)
                    || keys.contains(KeyCode::BTN_THUMB)
            });
            let has_mouse = supported_keys.is_some_and(|keys| {
                keys.contains(KeyCode::BTN_LEFT) || keys.contains(KeyCode::BTN_RIGHT)
            }) || supported_relative_axes.is_some_and(|axes| {
                axes.contains(RelativeAxisCode::REL_X) || axes.contains(RelativeAxisCode::REL_Y)
            });

            devices.push(DeviceInfo {
                path: path.to_string_lossy().into_owned(),
                name,
                vendor_id: input_id.vendor(),
                product_id: input_id.product(),
                friendly_name: None,
                has_keyboard,
                has_gamepad,
                has_mouse,
            });
        }

        Ok(devices)
    }

    async fn open_device(&mut self, path: &str) -> Result<()> {
        let mut device =
            Device::open(path).with_context(|| format!("failed to open device: {path}"))?;
        let device_name = device.name().unwrap_or("Unknown").to_string();

        self.axis_info.clear();
        self.pending.clear();
        self.hat_values.clear();
        if let Ok(absinfo) = device.get_absinfo() {
            for (axis, info) in absinfo {
                self.axis_info.insert(
                    axis.0,
                    AxisInfo {
                        minimum: info.minimum(),
                        maximum: info.maximum(),
                        flat: info.flat(),
                    },
                );
            }
        }

        tracing::info!("Opened device: {} ({})", device_name, path);
        self.device_name = Some(device_name);

        if self.grab {
            // Grab the device so events don't pass through to the rest of the system
            device
                .grab()
                .with_context(|| format!("failed to grab device: {path}"))?;
        }

        let stream = device
            .into_event_stream()
            .context("failed to create event stream")?;

        self.stream = Some(stream);
        Ok(())
    }

    async fn next_event(&mut self) -> Result<InputEvent> {
        loop {
            if let Some(event) = self.pending.pop_front() {
                return Ok(event);
            }

            let stream = self
                .stream
                .as_mut()
                .context("no device opened — call open_device first")?;
            let ev = stream.next_event().await.context("failed to read event")?;

            let event_type = ev.event_type();

            match event_type {
                EventType::KEY => {
                    // value: 0 = release, 1 = press, 2 = repeat (autorepeat)
                    // Skip repeat events — they don't change button state
                    if ev.value() == 2 {
                        continue;
                    }
                    return Ok(InputEvent::Button {
                        code: ev.code(),
                        pressed: ev.value() == 1,
                    });
                }
                EventType::ABSOLUTE => {
                    let axis = ev.code();
                    if self.is_digital_hat(axis) {
                        match self.queue_hat_transition(axis, ev.value()) {
                            Some(event) => return Ok(event),
                            None => continue,
                        }
                    }
                    return Ok(InputEvent::Axis {
                        axis,
                        value: ev.value(),
                    });
                }
                EventType::RELATIVE => {
                    return Ok(InputEvent::Axis {
                        axis: ev.code(),
                        value: ev.value(),
                    });
                }
                EventType::SYNCHRONIZATION => {
                    return Ok(InputEvent::Sync);
                }
                _ => {
                    // Skip event types we don't care about
                    continue;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input_with_digital_hat() -> LinuxInput {
        let mut input = LinuxInput::new_passive();
        for axis in [ABS_HAT0X, ABS_HAT0Y] {
            input.axis_info.insert(
                axis,
                AxisInfo {
                    minimum: -1,
                    maximum: 1,
                    flat: 0,
                },
            );
        }
        input
    }

    #[test]
    fn hat_press_and_release_become_dpad_buttons() {
        let mut input = input_with_digital_hat();

        let press = input.queue_hat_transition(ABS_HAT0Y, -1);
        assert_eq!(
            press,
            Some(InputEvent::Button {
                code: KeyCode::BTN_DPAD_UP.0,
                pressed: true,
            })
        );
        assert!(input.pending.is_empty());

        let release = input.queue_hat_transition(ABS_HAT0Y, 0);
        assert_eq!(
            release,
            Some(InputEvent::Button {
                code: KeyCode::BTN_DPAD_UP.0,
                pressed: false,
            })
        );
        assert!(input.pending.is_empty());
    }

    #[test]
    fn hat_direction_flip_releases_then_presses() {
        let mut input = input_with_digital_hat();

        input.queue_hat_transition(ABS_HAT0X, -1);
        let first = input.queue_hat_transition(ABS_HAT0X, 1);
        assert_eq!(
            first,
            Some(InputEvent::Button {
                code: KeyCode::BTN_DPAD_LEFT.0,
                pressed: false,
            })
        );
        assert_eq!(
            input.pending.pop_front(),
            Some(InputEvent::Button {
                code: KeyCode::BTN_DPAD_RIGHT.0,
                pressed: true,
            })
        );
    }

    #[test]
    fn repeated_hat_value_is_ignored() {
        let mut input = input_with_digital_hat();

        input.queue_hat_transition(ABS_HAT0X, 1);
        assert_eq!(input.queue_hat_transition(ABS_HAT0X, 1), None);
        assert!(input.pending.is_empty());
    }

    #[test]
    fn analog_hat_range_is_not_treated_as_dpad() {
        let mut input = LinuxInput::new_passive();
        input.axis_info.insert(
            ABS_HAT0X,
            AxisInfo {
                minimum: -255,
                maximum: 255,
                flat: 0,
            },
        );

        assert!(!input.is_digital_hat(ABS_HAT0X));
        assert!(!input.is_digital_hat(ABS_HAT0Y));
    }
}
