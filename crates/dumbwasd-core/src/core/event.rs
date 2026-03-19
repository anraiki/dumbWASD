/// A normalized input event from a physical device.
#[derive(Debug, Clone, PartialEq)]
pub enum InputEvent {
    /// A button/key press or release. `code` is the evdev code, `pressed` is true on press.
    Button { code: u16, pressed: bool },
    /// An axis movement (e.g. analog stick). `axis` is the evdev axis code.
    Axis { axis: u16, value: i32 },
    /// Synchronization event — marks end of a batch of events.
    Sync,
}

/// An action to perform on the virtual output device.
#[derive(Debug, Clone, PartialEq)]
pub enum OutputAction {
    /// Press or release a keyboard key.
    Key { code: u16, pressed: bool },
    /// Move the mouse by a relative delta.
    MouseMove { dx: i32, dy: i32 },
    /// Emit a generic relative-axis event.
    RelativeAxis { axis: u16, value: i32 },
    /// Press or release a mouse button.
    MouseButton { code: u16, pressed: bool },
}
