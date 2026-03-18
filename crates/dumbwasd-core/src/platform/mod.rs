use anyhow::Result;
use async_trait::async_trait;

use crate::core::event::{InputEvent, OutputAction};
use crate::devices::DeviceInfo;

#[cfg(target_os = "linux")]
pub mod linux;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformTarget {
    Linux,
    MacOs,
    Windows,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlatformCapabilities {
    pub supports_evdev: bool,
    pub supports_hidraw: bool,
    pub supports_solaar: bool,
}

impl PlatformTarget {
    pub fn capabilities(self) -> PlatformCapabilities {
        match self {
            Self::Linux => PlatformCapabilities {
                supports_evdev: true,
                supports_hidraw: true,
                supports_solaar: true,
            },
            Self::MacOs => PlatformCapabilities {
                supports_evdev: false,
                supports_hidraw: false,
                supports_solaar: false,
            },
            Self::Windows => PlatformCapabilities {
                supports_evdev: false,
                supports_hidraw: false,
                supports_solaar: false,
            },
            Self::Unknown => PlatformCapabilities {
                supports_evdev: false,
                supports_hidraw: false,
                supports_solaar: false,
            },
        }
    }
}

#[cfg(target_os = "linux")]
pub const CURRENT_PLATFORM: PlatformTarget = PlatformTarget::Linux;

#[cfg(target_os = "macos")]
pub const CURRENT_PLATFORM: PlatformTarget = PlatformTarget::MacOs;

#[cfg(target_os = "windows")]
pub const CURRENT_PLATFORM: PlatformTarget = PlatformTarget::Windows;

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
pub const CURRENT_PLATFORM: PlatformTarget = PlatformTarget::Unknown;

pub fn current_platform() -> PlatformTarget {
    CURRENT_PLATFORM
}

#[cfg(test)]
mod tests {
    use super::{current_platform, PlatformCapabilities, PlatformTarget};

    #[test]
    fn current_platform_capabilities_match_declared_target() {
        let caps = current_platform().capabilities();

        match current_platform() {
            PlatformTarget::Linux => assert_eq!(
                caps,
                PlatformCapabilities {
                    supports_evdev: true,
                    supports_hidraw: true,
                    supports_solaar: true,
                }
            ),
            PlatformTarget::MacOs | PlatformTarget::Windows | PlatformTarget::Unknown => {
                assert_eq!(
                    caps,
                    PlatformCapabilities {
                        supports_evdev: false,
                        supports_hidraw: false,
                        supports_solaar: false,
                    }
                );
            }
        }
    }
}

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
