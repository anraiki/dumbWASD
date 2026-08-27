use std::collections::{HashMap, HashSet};

use crate::core::event::InputEvent;

use super::{stick_code, Stick, StickDirection, ABS_RX, ABS_RY, ABS_X, ABS_Y};

/// How far a stick must travel before a direction counts as pressed.
///
/// `engage` is deliberately higher than `release` — the gap is hysteresis.
/// Without it a stick resting near the boundary chatters press/release on
/// every jittering axis report.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StickThresholds {
    /// Normalized magnitude (0.0..1.0) at which a direction engages.
    pub engage: f32,
    /// Normalized magnitude below which an engaged direction releases.
    pub release: f32,
}

impl Default for StickThresholds {
    fn default() -> Self {
        Self {
            engage: 0.5,
            release: 0.35,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct AxisRange {
    minimum: i32,
    maximum: i32,
    /// Device-reported deadzone, in raw units.
    flat: i32,
}

impl Default for AxisRange {
    fn default() -> Self {
        Self {
            minimum: i16::MIN as i32,
            maximum: i16::MAX as i32,
            flat: 0,
        }
    }
}

impl AxisRange {
    /// Map a raw axis value onto -1.0..1.0, with the device deadzone
    /// collapsed to exactly zero.
    fn normalize(&self, value: i32) -> f32 {
        let midpoint = (self.minimum as f32 + self.maximum as f32) / 2.0;
        let half_span = (self.maximum as f32 - self.minimum as f32) / 2.0;
        if half_span <= 0.0 {
            return 0.0;
        }

        let offset = value as f32 - midpoint;
        if self.flat > 0 && offset.abs() <= self.flat as f32 {
            return 0.0;
        }

        (offset / half_span).clamp(-1.0, 1.0)
    }
}

/// Converts thumbstick axis motion into press/release events on the
/// synthetic stick codes.
///
/// Feed every axis event through [`StickTracker::handle_axis`]; the returned
/// events are injected into the normal button pipeline, so stick directions
/// flow through bindings, combos and macros unchanged.
#[derive(Debug, Default)]
pub struct StickTracker {
    thresholds: StickThresholds,
    ranges: HashMap<u16, AxisRange>,
    engaged: HashSet<u16>,
}

impl StickTracker {
    pub fn new(thresholds: StickThresholds) -> Self {
        Self {
            thresholds,
            ranges: HashMap::new(),
            engaged: HashSet::new(),
        }
    }

    /// Record the reported range of an axis. Without this the tracker
    /// assumes a signed 16-bit range, which is right for most gamepads but
    /// wrong for the 0..255 axes some controllers report.
    pub fn set_axis_range(&mut self, axis: u16, minimum: i32, maximum: i32, flat: i32) {
        self.ranges.insert(
            axis,
            AxisRange {
                minimum,
                maximum,
                flat,
            },
        );
    }

    /// True once any direction on any stick is held.
    pub fn has_engaged(&self) -> bool {
        !self.engaged.is_empty()
    }

    /// Feed one raw axis event. Returns the synthetic button events that the
    /// motion implies — empty when the axis is not a thumbstick, or when the
    /// motion did not cross a threshold.
    pub fn handle_axis(&mut self, axis: u16, value: i32) -> Vec<InputEvent> {
        let Some(stick) = Stick::from_axis(axis) else {
            return Vec::new();
        };

        let range = self.ranges.get(&axis).copied().unwrap_or_default();
        let normalized = range.normalize(value);

        // Each axis owns one opposing pair of directions.
        let (negative, positive) = match axis {
            ABS_X | ABS_RX => (StickDirection::Left, StickDirection::Right),
            ABS_Y | ABS_RY => (StickDirection::Up, StickDirection::Down),
            _ => return Vec::new(),
        };

        let mut events = Vec::new();
        self.apply(stick, negative, -normalized, &mut events);
        self.apply(stick, positive, normalized, &mut events);

        // A flick straight through centre both releases one direction and
        // engages its opposite. Emit the release first so the pair is never
        // momentarily held together downstream.
        events.sort_by_key(|event| match event {
            InputEvent::Button { pressed, .. } => *pressed,
            _ => false,
        });
        events
    }

    /// Release every held direction. Call when monitoring stops so no
    /// synthetic key is left stuck down.
    pub fn release_all(&mut self) -> Vec<InputEvent> {
        let mut codes: Vec<u16> = self.engaged.drain().collect();
        codes.sort_unstable();
        codes
            .into_iter()
            .map(|code| InputEvent::Button {
                code,
                pressed: false,
            })
            .collect()
    }

    /// Apply hysteresis for one direction given its signed magnitude.
    fn apply(
        &mut self,
        stick: Stick,
        direction: StickDirection,
        magnitude: f32,
        events: &mut Vec<InputEvent>,
    ) {
        let code = stick_code(stick, direction);
        let held = self.engaged.contains(&code);

        if !held && magnitude >= self.thresholds.engage {
            self.engaged.insert(code);
            events.push(InputEvent::Button {
                code,
                pressed: true,
            });
        } else if held && magnitude < self.thresholds.release {
            self.engaged.remove(&code);
            events.push(InputEvent::Button {
                code,
                pressed: false,
            });
        }
    }
}
