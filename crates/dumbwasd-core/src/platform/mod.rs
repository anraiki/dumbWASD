use anyhow::Result;
use async_trait::async_trait;

use crate::core::event::{InputEvent, OutputAction};
use crate::devices::DeviceInfo;

#[cfg(target_os = "linux")]
pub mod linux;

/// Async trait for reading input events from a physical device.
#[async_trait]
pub trait InputBackend: Send {
    /// Enumerate all available input devices.
    async fn list_devices(&self) -> Result<Vec<DeviceInfo>>;
    /// Open a specific device by path for reading.
    async fn open_device(&mut self, path: &str) -> Result<()>;
    /// Read the next input event (blocks until available).
    async fn next_event(&mut self) -> Result<InputEvent>;
}

/// Trait for emitting output events to a virtual device.
pub trait OutputBackend: Send {
    /// Emit an output action (key press, mouse move, etc.).
    fn emit(&mut self, action: &OutputAction) -> Result<()>;
    /// Emit a synchronization event to flush pending actions.
    fn emit_sync(&mut self) -> Result<()>;
}

/// Create the platform-appropriate input backend.
#[cfg(target_os = "linux")]
pub fn create_input_backend() -> linux::LinuxInput {
    linux::LinuxInput::new()
}

/// Create the platform-appropriate output backend.
#[cfg(target_os = "linux")]
pub fn create_output_backend() -> Result<linux::LinuxOutput> {
    linux::LinuxOutput::new()
}
