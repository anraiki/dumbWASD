//! One canonical d-pad, whatever the hardware reports.
//!
//! Gamepads disagree about how a d-pad reaches userspace. The three shapes
//! seen in practice are:
//!
//! - `BTN_DPAD_UP/DOWN/LEFT/RIGHT` (544-547) — what an Xbox pad on a modern
//!   `xpad` sends, and what this module treats as canonical.
//! - `ABS_HAT0X/ABS_HAT0Y` — a two-axis hat, usually `-1..1` but sometimes
//!   reported with a wider analog range.
//! - `BTN_TRIGGER_HAPPY1..4` (704-707) — used by some third-party pads that
//!   expose no hat and no `BTN_DPAD_*`.
//!
//! Everything is normalized onto the canonical codes at the input boundary,
//! so a binding made against "D-pad Up" fires no matter which shape the
//! device used.

mod normalizer;

#[cfg(test)]
mod tests;

pub use normalizer::{DpadCapabilities, DpadNormalizer};

/// A d-pad direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DpadDirection {
    Up,
    Down,
    Left,
    Right,
}

// Canonical codes — these are evdev's `BTN_DPAD_*`. Spelled out rather than
// pulled from the `evdev` crate so core stays platform-independent; the
// Linux backend has a test asserting they still agree.
pub const DPAD_UP: u16 = 0x220;
pub const DPAD_DOWN: u16 = 0x221;
pub const DPAD_LEFT: u16 = 0x222;
pub const DPAD_RIGHT: u16 = 0x223;

/// evdev hat axes that carry a d-pad.
pub const ABS_HAT0X: u16 = 0x10;
pub const ABS_HAT0Y: u16 = 0x11;

/// First and last of the `BTN_TRIGGER_HAPPY1..4` block some pads use.
pub const TRIGGER_HAPPY_FIRST: u16 = 0x2c0;
pub const TRIGGER_HAPPY_LAST: u16 = 0x2c3;

impl DpadDirection {
    /// The canonical evdev code for this direction.
    pub fn code(self) -> u16 {
        match self {
            Self::Up => DPAD_UP,
            Self::Down => DPAD_DOWN,
            Self::Left => DPAD_LEFT,
            Self::Right => DPAD_RIGHT,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Up => "D-pad Up",
            Self::Down => "D-pad Down",
            Self::Left => "D-pad Left",
            Self::Right => "D-pad Right",
        }
    }

    /// The direction a canonical code refers to.
    pub fn from_code(code: u16) -> Option<Self> {
        match code {
            DPAD_UP => Some(Self::Up),
            DPAD_DOWN => Some(Self::Down),
            DPAD_LEFT => Some(Self::Left),
            DPAD_RIGHT => Some(Self::Right),
            _ => None,
        }
    }

    /// The direction a hat axis points in for a given sign.
    ///
    /// Negative Y is up, matching evdev's screen-style orientation.
    pub fn from_hat(axis: u16, sign: i32) -> Option<Self> {
        match (axis, sign) {
            (ABS_HAT0X, -1) => Some(Self::Left),
            (ABS_HAT0X, 1) => Some(Self::Right),
            (ABS_HAT0Y, -1) => Some(Self::Up),
            (ABS_HAT0Y, 1) => Some(Self::Down),
            _ => None,
        }
    }
}

/// True when a code is already a canonical d-pad code.
pub fn is_dpad_code(code: u16) -> bool {
    DpadDirection::from_code(code).is_some()
}

/// True when an axis is one of the d-pad hat axes.
pub fn is_hat_axis(axis: u16) -> bool {
    axis == ABS_HAT0X || axis == ABS_HAT0Y
}

/// Human-readable label for a canonical d-pad code.
pub fn dpad_label(code: u16) -> Option<&'static str> {
    DpadDirection::from_code(code).map(DpadDirection::label)
}
