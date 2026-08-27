use anyhow::{Context, Result};
use async_trait::async_trait;
use evdev::{Device, EventStream, EventType, KeyCode, RelativeAxisCode};
use std::collections::{HashMap, VecDeque};

use crate::core::dpad::{DpadCapabilities, DpadNormalizer, ABS_HAT0X, ABS_HAT0Y};
use crate::core::event::InputEvent;
use crate::devices::DeviceInfo;
use crate::platform::InputBackend;

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
    /// Folds every d-pad shape onto the canonical BTN_DPAD_* codes.
    dpad: DpadNormalizer,
}

impl LinuxInput {
    pub fn new() -> Self {
        Self::with_grab(true)
    }

    /// Create an input backend that does NOT grab the device (for monitoring).
    pub fn new_passive() -> Self {
        Self::with_grab(false)
    }

    fn with_grab(grab: bool) -> Self {
        Self {
            stream: None,
            grab,
            device_name: None,
            axis_info: HashMap::new(),
            pending: VecDeque::new(),
            dpad: DpadNormalizer::default(),
        }
    }

    pub fn device_name(&self) -> Option<&str> {
        self.device_name.as_deref()
    }

    pub fn axis_info(&self, axis: u16) -> Option<AxisInfo> {
        self.axis_info.get(&axis).copied()
    }

    /// Configure d-pad normalization from what the opened device advertises.
    fn configure_dpad(&mut self, device: &Device) {
        let supported_keys = device.supported_keys();
        let has_dpad_buttons = supported_keys.is_some_and(|keys| {
            keys.contains(KeyCode::BTN_DPAD_UP)
                || keys.contains(KeyCode::BTN_DPAD_DOWN)
                || keys.contains(KeyCode::BTN_DPAD_LEFT)
                || keys.contains(KeyCode::BTN_DPAD_RIGHT)
        });
        let is_gamepad = supported_keys.is_some_and(|keys| {
            keys.contains(KeyCode::BTN_SOUTH)
                || keys.contains(KeyCode::BTN_EAST)
                || keys.contains(KeyCode::BTN_NORTH)
                || keys.contains(KeyCode::BTN_WEST)
        });
        let has_hat_axes =
            self.axis_info.contains_key(&ABS_HAT0X) || self.axis_info.contains_key(&ABS_HAT0Y);

        self.dpad = DpadNormalizer::new(DpadCapabilities {
            has_dpad_buttons,
            has_hat_axes,
            is_gamepad,
        });
        for axis in [ABS_HAT0X, ABS_HAT0Y] {
            if let Some(info) = self.axis_info.get(&axis) {
                self.dpad.set_hat_range(axis, info.minimum, info.maximum);
            }
        }

        tracing::debug!(
            has_dpad_buttons,
            has_hat_axes,
            is_gamepad,
            "configured d-pad normalization"
        );
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
        self.dpad.reset();
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

        self.configure_dpad(&device);

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

    fn axis_ranges(&self) -> Vec<(u16, i32, i32, i32)> {
        self.axis_info
            .iter()
            .map(|(axis, info)| (*axis, info.minimum, info.maximum, info.flat))
            .collect()
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
                        code: self.dpad.normalize_button(ev.code()),
                        pressed: ev.value() == 1,
                    });
                }
                EventType::ABSOLUTE => {
                    let axis = ev.code();
                    if self.dpad.owns_axis(axis) {
                        let mut events = self.dpad.handle_hat(axis, ev.value()).into_iter();
                        let Some(first) = events.next() else {
                            continue;
                        };
                        self.pending.extend(events);
                        return Ok(first);
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
    use crate::core::dpad::{DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT, DPAD_UP};
    use evdev::AbsoluteAxisCode;

    /// Core spells the canonical d-pad codes out as plain integers so it
    /// stays platform-independent. This is the cross-check that those
    /// numbers still match what evdev calls them.
    #[test]
    fn canonical_dpad_codes_match_the_evdev_crate() {
        assert_eq!(DPAD_UP, KeyCode::BTN_DPAD_UP.0);
        assert_eq!(DPAD_DOWN, KeyCode::BTN_DPAD_DOWN.0);
        assert_eq!(DPAD_LEFT, KeyCode::BTN_DPAD_LEFT.0);
        assert_eq!(DPAD_RIGHT, KeyCode::BTN_DPAD_RIGHT.0);
    }

    #[test]
    fn hat_axis_codes_match_the_evdev_crate() {
        assert_eq!(ABS_HAT0X, AbsoluteAxisCode::ABS_HAT0X.0);
        assert_eq!(ABS_HAT0Y, AbsoluteAxisCode::ABS_HAT0Y.0);
    }
}
