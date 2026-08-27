//! Analog stick directions as bindable buttons.
//!
//! Physical sticks report continuous `ABS_*` axis values, but bindings are
//! keyed by button code. This module reserves a synthetic code per stick
//! direction and converts axis motion into press/release events for those
//! codes, so a stick direction binds exactly like any other button.
//!
//! The synthetic codes live above `KEY_MAX` (0x2FF), so they can never
//! collide with a real evdev code arriving from a device.

mod tracker;

#[cfg(test)]
mod tests;

pub use tracker::{StickThresholds, StickTracker};

/// Which physical stick a direction belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stick {
    Left,
    Right,
}

/// One of the four cardinal directions of a stick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StickDirection {
    Up,
    Down,
    Left,
    Right,
}

/// First synthetic stick code. Chosen above `KEY_MAX` (0x2FF) so it can
/// never collide with an evdev button code read from a device.
pub const STICK_CODE_BASE: u16 = 0xF000;

/// Number of synthetic codes reserved (2 sticks x 4 directions).
pub const STICK_CODE_COUNT: u16 = 8;

// evdev axis codes for the two thumbsticks.
pub(crate) const ABS_X: u16 = 0x00;
pub(crate) const ABS_Y: u16 = 0x01;
pub(crate) const ABS_RX: u16 = 0x03;
pub(crate) const ABS_RY: u16 = 0x04;

impl Stick {
    /// The stick a given evdev axis belongs to, if it is a thumbstick axis.
    pub fn from_axis(axis: u16) -> Option<Self> {
        match axis {
            ABS_X | ABS_Y => Some(Self::Left),
            ABS_RX | ABS_RY => Some(Self::Right),
            _ => None,
        }
    }

    fn index(self) -> u16 {
        match self {
            Self::Left => 0,
            Self::Right => 1,
        }
    }
}

impl StickDirection {
    fn index(self) -> u16 {
        match self {
            Self::Up => 0,
            Self::Down => 1,
            Self::Left => 2,
            Self::Right => 3,
        }
    }

    fn from_index(index: u16) -> Option<Self> {
        match index {
            0 => Some(Self::Up),
            1 => Some(Self::Down),
            2 => Some(Self::Left),
            3 => Some(Self::Right),
            _ => None,
        }
    }
}

/// The synthetic button code for a stick direction.
pub fn stick_code(stick: Stick, direction: StickDirection) -> u16 {
    STICK_CODE_BASE + stick.index() * 4 + direction.index()
}

/// True when a code is one of the reserved synthetic stick codes.
pub fn is_stick_code(code: u16) -> bool {
    (STICK_CODE_BASE..STICK_CODE_BASE + STICK_CODE_COUNT).contains(&code)
}

/// Decompose a synthetic stick code back into its stick and direction.
pub fn stick_from_code(code: u16) -> Option<(Stick, StickDirection)> {
    if !is_stick_code(code) {
        return None;
    }

    let offset = code - STICK_CODE_BASE;
    let stick = if offset < 4 {
        Stick::Left
    } else {
        Stick::Right
    };
    StickDirection::from_index(offset % 4).map(|direction| (stick, direction))
}

/// Human-readable label for a synthetic stick code, for UI and logs.
pub fn stick_label(code: u16) -> Option<&'static str> {
    let (stick, direction) = stick_from_code(code)?;

    Some(match (stick, direction) {
        (Stick::Left, StickDirection::Up) => "Left Stick Up",
        (Stick::Left, StickDirection::Down) => "Left Stick Down",
        (Stick::Left, StickDirection::Left) => "Left Stick Left",
        (Stick::Left, StickDirection::Right) => "Left Stick Right",
        (Stick::Right, StickDirection::Up) => "Right Stick Up",
        (Stick::Right, StickDirection::Down) => "Right Stick Down",
        (Stick::Right, StickDirection::Left) => "Right Stick Left",
        (Stick::Right, StickDirection::Right) => "Right Stick Right",
    })
}
