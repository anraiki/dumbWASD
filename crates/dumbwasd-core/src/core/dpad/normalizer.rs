use std::collections::HashMap;

use crate::core::event::InputEvent;

use super::{
    is_hat_axis, DpadDirection, ABS_HAT0X, ABS_HAT0Y, TRIGGER_HAPPY_FIRST, TRIGGER_HAPPY_LAST,
};

/// What a device advertises about its d-pad, read once when it is opened.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DpadCapabilities {
    /// The device reports `BTN_DPAD_*` directly.
    pub has_dpad_buttons: bool,
    /// The device exposes `ABS_HAT0X`/`ABS_HAT0Y`.
    pub has_hat_axes: bool,
    /// The device looks like a gamepad (has face buttons).
    pub is_gamepad: bool,
}

impl DpadCapabilities {
    /// Whether `BTN_TRIGGER_HAPPY1..4` should be read as a d-pad.
    ///
    /// That block is generic "extra buttons" — plenty of mice and flight
    /// sticks use it for ordinary buttons. Claiming it is only safe on a
    /// gamepad that offers no other way to report a d-pad.
    fn trigger_happy_is_dpad(self) -> bool {
        self.is_gamepad && !self.has_dpad_buttons && !self.has_hat_axes
    }
}

#[derive(Debug, Clone, Copy)]
struct HatRange {
    minimum: i32,
    maximum: i32,
}

impl HatRange {
    /// Reduce a raw hat value to -1, 0 or 1.
    ///
    /// A `-1..1` hat is already digital. Wider analog hats are thresholded,
    /// with the release point lower than the engage point so a hat resting
    /// on the boundary cannot chatter.
    fn direction(&self, value: i32, currently_held: bool) -> i32 {
        if self.minimum >= -1 && self.maximum <= 1 {
            return value.signum();
        }

        let span = (self.maximum as f32 - self.minimum as f32) / 2.0;
        if span <= 0.0 {
            return 0;
        }

        let midpoint = (self.minimum as f32 + self.maximum as f32) / 2.0;
        let normalized = ((value as f32 - midpoint) / span).clamp(-1.0, 1.0);
        let threshold = if currently_held { 0.35 } else { 0.5 };

        if normalized.abs() < threshold {
            0
        } else {
            normalized.signum() as i32
        }
    }
}

/// Normalizes every shape of d-pad onto the canonical `BTN_DPAD_*` codes.
///
/// Button codes are translated in place by [`normalize_button`]; hat axes
/// are converted into press/release pairs by [`handle_hat`].
///
/// [`normalize_button`]: DpadNormalizer::normalize_button
/// [`handle_hat`]: DpadNormalizer::handle_hat
#[derive(Debug, Default)]
pub struct DpadNormalizer {
    capabilities: DpadCapabilities,
    hat_ranges: HashMap<u16, HatRange>,
    /// Last emitted direction per hat axis (-1, 0 or 1).
    hat_directions: HashMap<u16, i32>,
}

impl DpadNormalizer {
    pub fn new(capabilities: DpadCapabilities) -> Self {
        Self {
            capabilities,
            hat_ranges: HashMap::new(),
            hat_directions: HashMap::new(),
        }
    }

    /// Record a hat axis range. Without one the axis is assumed digital.
    pub fn set_hat_range(&mut self, axis: u16, minimum: i32, maximum: i32) {
        if !is_hat_axis(axis) {
            return;
        }

        self.hat_ranges.insert(axis, HatRange { minimum, maximum });
    }

    /// Forget all remembered hat state, for reuse across devices.
    pub fn reset(&mut self) {
        self.hat_ranges.clear();
        self.hat_directions.clear();
    }

    /// True when this axis should be consumed as a d-pad rather than
    /// surfaced as an analog axis.
    pub fn owns_axis(&self, axis: u16) -> bool {
        is_hat_axis(axis)
    }

    /// Translate a button code onto its canonical d-pad code.
    ///
    /// Returns the code unchanged when it is not a d-pad button, so callers
    /// can pass every button through this.
    pub fn normalize_button(&self, code: u16) -> u16 {
        if !(TRIGGER_HAPPY_FIRST..=TRIGGER_HAPPY_LAST).contains(&code) {
            return code;
        }

        if !self.capabilities.trigger_happy_is_dpad() {
            return code;
        }

        // BTN_TRIGGER_HAPPY1..4 run left, right, up, down.
        match code - TRIGGER_HAPPY_FIRST {
            0 => DpadDirection::Left.code(),
            1 => DpadDirection::Right.code(),
            2 => DpadDirection::Up.code(),
            _ => DpadDirection::Down.code(),
        }
    }

    /// Convert a hat axis value into d-pad press/release events.
    ///
    /// A flick straight from one side to the other releases the old
    /// direction before pressing the new one.
    pub fn handle_hat(&mut self, axis: u16, value: i32) -> Vec<InputEvent> {
        if !is_hat_axis(axis) {
            return Vec::new();
        }

        let range = self.hat_ranges.get(&axis).copied().unwrap_or(HatRange {
            minimum: -1,
            maximum: 1,
        });

        let previous = self.hat_directions.get(&axis).copied().unwrap_or(0);
        let next = range.direction(value, previous != 0);
        if previous == next {
            return Vec::new();
        }

        self.hat_directions.insert(axis, next);

        let mut events = Vec::new();
        if previous != 0 {
            if let Some(direction) = DpadDirection::from_hat(axis, previous) {
                events.push(InputEvent::Button {
                    code: direction.code(),
                    pressed: false,
                });
            }
        }
        if next != 0 {
            if let Some(direction) = DpadDirection::from_hat(axis, next) {
                events.push(InputEvent::Button {
                    code: direction.code(),
                    pressed: true,
                });
            }
        }

        events
    }

    /// Release any direction still held. Call when a device stream ends.
    pub fn release_all(&mut self) -> Vec<InputEvent> {
        let mut axes: Vec<u16> = vec![ABS_HAT0X, ABS_HAT0Y];
        axes.retain(|axis| self.hat_directions.get(axis).copied().unwrap_or(0) != 0);

        let mut events = Vec::new();
        for axis in axes {
            let held = self.hat_directions.insert(axis, 0).unwrap_or(0);
            if let Some(direction) = DpadDirection::from_hat(axis, held) {
                events.push(InputEvent::Button {
                    code: direction.code(),
                    pressed: false,
                });
            }
        }
        events
    }
}
