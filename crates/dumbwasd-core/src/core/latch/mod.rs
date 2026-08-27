//! Turns a momentary button into a latching one.
//!
//! A latched binding activates on the first press and stays active — held
//! down, or repeating, or whatever the target does — until the button is
//! pressed a second time. The physical release in between is ignored.
//!
//! This sits in front of the output arbiter: it converts physical press and
//! release edges into *logical* ones, and everything downstream is unaware
//! that a latch was involved.

#[cfg(test)]
mod tests;

use std::collections::HashSet;

/// Tracks which latching bindings are currently engaged.
#[derive(Debug, Default)]
pub struct ToggleLatch {
    engaged: HashSet<u16>,
}

impl ToggleLatch {
    pub fn new() -> Self {
        Self::default()
    }

    /// Map a physical button edge onto the logical one the rest of the
    /// pipeline should see.
    ///
    /// Returns `None` when the edge produces no logical change — which is
    /// every physical release of a latching binding.
    pub fn resolve(&mut self, code: u16, pressed: bool, latching: bool) -> Option<bool> {
        if !latching {
            // A binding that stops latching while engaged would otherwise
            // stay stuck on, since its release was swallowed earlier.
            self.engaged.remove(&code);
            return Some(pressed);
        }

        if !pressed {
            return None;
        }

        if self.engaged.remove(&code) {
            Some(false)
        } else {
            self.engaged.insert(code);
            Some(true)
        }
    }

    /// True while this binding is latched on.
    pub fn is_engaged(&self, code: u16) -> bool {
        self.engaged.contains(&code)
    }

    /// Drop every latch, for when monitoring stops.
    pub fn clear(&mut self) {
        self.engaged.clear();
    }
}
