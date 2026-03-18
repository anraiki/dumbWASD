use anyhow::{Context, Result};
use async_trait::async_trait;
use evdev::{Device, EventStream, EventType, KeyCode, RelativeAxisCode};
use std::collections::HashMap;

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
}

impl LinuxInput {
    pub fn new() -> Self {
        Self {
            stream: None,
            grab: true,
            device_name: None,
            axis_info: HashMap::new(),
        }
    }

    /// Create an input backend that does NOT grab the device (for monitoring).
    pub fn new_passive() -> Self {
        Self {
            stream: None,
            grab: false,
            device_name: None,
            axis_info: HashMap::new(),
        }
    }

    pub fn device_name(&self) -> Option<&str> {
        self.device_name.as_deref()
    }

    pub fn axis_info(&self, axis: u16) -> Option<AxisInfo> {
        self.axis_info.get(&axis).copied()
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
        let stream = self
            .stream
            .as_mut()
            .context("no device opened — call open_device first")?;

        loop {
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
                    return Ok(InputEvent::Axis {
                        axis: ev.code(),
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
