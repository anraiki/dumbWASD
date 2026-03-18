use anyhow::{Context, Result};
use evdev::uinput::VirtualDevice;
use evdev::{AttributeSet, EventType, InputEvent as EvdevInputEvent, KeyCode, RelativeAxisCode};

use crate::core::event::OutputAction;
use crate::platform::OutputBackend;

pub struct LinuxOutput {
    device: VirtualDevice,
}

impl LinuxOutput {
    pub fn new() -> Result<Self> {
        // Register all standard keyboard keys
        let mut keys = AttributeSet::<KeyCode>::new();
        for code in 1..=248 {
            keys.insert(KeyCode::new(code));
        }
        // Also register mouse buttons (BTN_LEFT=0x110 through BTN_TASK=0x117)
        for code in 0x110..=0x117 {
            keys.insert(KeyCode::new(code));
        }

        let mut rel_axes = AttributeSet::<RelativeAxisCode>::new();
        rel_axes.insert(RelativeAxisCode::REL_X);
        rel_axes.insert(RelativeAxisCode::REL_Y);

        let device = VirtualDevice::builder()
            .context("failed to create virtual device builder")?
            .name("dumbwasd virtual device")
            .with_keys(&keys)
            .context("failed to set keys")?
            .with_relative_axes(&rel_axes)
            .context("failed to set relative axes")?
            .build()
            .context("failed to build virtual device")?;

        tracing::info!("Created virtual output device");

        Ok(Self { device })
    }
}

impl OutputBackend for LinuxOutput {
    fn emit(&mut self, action: &OutputAction) -> Result<()> {
        let events: Vec<EvdevInputEvent> = match action {
            OutputAction::Key { code, pressed } => {
                vec![EvdevInputEvent::new(
                    EventType::KEY.0,
                    *code,
                    if *pressed { 1 } else { 0 },
                )]
            }
            OutputAction::MouseMove { dx, dy } => {
                let mut evs = Vec::new();
                if *dx != 0 {
                    evs.push(EvdevInputEvent::new(
                        EventType::RELATIVE.0,
                        RelativeAxisCode::REL_X.0,
                        *dx,
                    ));
                }
                if *dy != 0 {
                    evs.push(EvdevInputEvent::new(
                        EventType::RELATIVE.0,
                        RelativeAxisCode::REL_Y.0,
                        *dy,
                    ));
                }
                evs
            }
            OutputAction::MouseButton { code, pressed } => {
                vec![EvdevInputEvent::new(
                    EventType::KEY.0,
                    *code,
                    if *pressed { 1 } else { 0 },
                )]
            }
        };

        self.device.emit(&events).context("failed to emit events")?;

        Ok(())
    }

    fn emit_sync(&mut self) -> Result<()> {
        let sync = [EvdevInputEvent::new(EventType::SYNCHRONIZATION.0, 0, 0)];
        self.device
            .emit(&sync)
            .context("failed to emit sync event")?;
        Ok(())
    }
}
