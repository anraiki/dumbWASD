use anyhow::{Context, Result};
use async_trait::async_trait;
use evdev::{Device, EventStream, EventType};

use crate::core::event::InputEvent;
use crate::devices::DeviceInfo;
use crate::platform::InputBackend;

pub struct LinuxInput {
    stream: Option<EventStream>,
    grab: bool,
}

impl LinuxInput {
    pub fn new() -> Self {
        Self {
            stream: None,
            grab: true,
        }
    }

    /// Create an input backend that does NOT grab the device (for monitoring).
    pub fn new_passive() -> Self {
        Self {
            stream: None,
            grab: false,
        }
    }
}

#[async_trait]
impl InputBackend for LinuxInput {
    async fn list_devices(&self) -> Result<Vec<DeviceInfo>> {
        let mut devices = Vec::new();

        for (path, device) in evdev::enumerate() {
            let name = device.name().unwrap_or("Unknown").to_string();
            let input_id = device.input_id();

            devices.push(DeviceInfo {
                path: path.to_string_lossy().into_owned(),
                name,
                vendor_id: input_id.vendor(),
                product_id: input_id.product(),
                friendly_name: None,
            });
        }

        Ok(devices)
    }

    async fn open_device(&mut self, path: &str) -> Result<()> {
        let mut device = Device::open(path)
            .with_context(|| format!("failed to open device: {path}"))?;

        tracing::info!(
            "Opened device: {} ({})",
            device.name().unwrap_or("Unknown"),
            path
        );

        if self.grab {
            // Grab the device so events don't pass through to the rest of the system
            device.grab().with_context(|| format!("failed to grab device: {path}"))?;
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
            let ev = stream
                .next_event()
                .await
                .context("failed to read event")?;

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
