//! Decides which held bindings are allowed to reach the output device.
//!
//! Without arbitration every held binding emits at once, so holding a stick
//! direction bound to `W` while pressing a chord bound to `Alt+PageUp`
//! produces `Alt+W+PageUp` — the two bindings collide on one virtual
//! keyboard and the application sees a combination nobody asked for.
//!
//! A binding marked exclusive claims the output for as long as it is held:
//! everything else is released and stays suppressed. Among several
//! exclusive bindings the earliest-pressed one owns the output, and a later
//! one only takes over once the owner is released and it is still held.

#[cfg(test)]
mod tests;

use std::collections::HashSet;

use crate::core::event::OutputAction;
use crate::core::profile::OutputTarget;

/// What the caller must do to bring the output in line with the new state.
///
/// `actions` is already ordered — suppressed bindings are released before
/// the newly active ones are pressed, so the output never briefly holds
/// both.
#[derive(Debug, Default, PartialEq)]
pub struct Arbitration {
    pub actions: Vec<OutputAction>,
    /// Bindings that stopped emitting; any auto-repeat must be cancelled.
    pub suppressed: Vec<u16>,
    /// Bindings that started emitting, with the target that did it, so
    /// auto-repeat can be (re)started.
    pub activated: Vec<(u16, OutputTarget)>,
}

impl Arbitration {
    pub fn is_empty(&self) -> bool {
        self.actions.is_empty() && self.suppressed.is_empty() && self.activated.is_empty()
    }
}

#[derive(Debug, Clone)]
struct Held {
    code: u16,
    target: OutputTarget,
    exclusive: bool,
}

/// Tracks which bindings are physically held and which of them may emit.
#[derive(Debug, Default)]
pub struct ExclusiveArbiter {
    /// Held bindings in the order they were pressed — this ordering is what
    /// gives the earliest press priority.
    held: Vec<Held>,
    /// Bindings currently emitting, in the order they started, so releases
    /// unwind last-in-first-out.
    emitting: Vec<(u16, OutputTarget)>,
}

impl ExclusiveArbiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a binding as held and return the resulting output changes.
    pub fn press(&mut self, code: u16, target: OutputTarget, exclusive: bool) -> Arbitration {
        // A repeat press without an intervening release (autorepeat, or a
        // resync) must not create a duplicate entry.
        self.held.retain(|held| held.code != code);
        self.held.push(Held {
            code,
            target,
            exclusive,
        });
        self.reconcile()
    }

    /// Register a binding as released and return the resulting output
    /// changes, including any binding that now gets its turn.
    pub fn release(&mut self, code: u16) -> Arbitration {
        self.held.retain(|held| held.code != code);
        self.reconcile()
    }

    /// Drop everything, releasing whatever is still emitting. For when
    /// monitoring stops.
    pub fn release_all(&mut self) -> Arbitration {
        self.held.clear();
        self.reconcile()
    }

    /// The binding currently allowed to emit exclusively, if any.
    pub fn owner(&self) -> Option<u16> {
        self.held
            .iter()
            .find(|held| held.exclusive)
            .map(|held| held.code)
    }

    fn reconcile(&mut self) -> Arbitration {
        // With an exclusive binding held, it is the only thing allowed out.
        let desired: Vec<(u16, OutputTarget)> = match self.owner() {
            Some(owner) => self
                .held
                .iter()
                .filter(|held| held.code == owner)
                .map(|held| (held.code, held.target.clone()))
                .collect(),
            None => self
                .held
                .iter()
                .map(|held| (held.code, held.target.clone()))
                .collect(),
        };
        let desired_codes: HashSet<u16> = desired.iter().map(|(code, _)| *code).collect();

        let mut arbitration = Arbitration::default();

        // Release anything no longer allowed, newest first so the output
        // unwinds in the reverse of the order it was built up.
        let mut still_emitting = Vec::with_capacity(self.emitting.len());
        let mut to_release = Vec::new();
        for entry in std::mem::take(&mut self.emitting) {
            if desired_codes.contains(&entry.0) {
                still_emitting.push(entry);
            } else {
                to_release.push(entry);
            }
        }
        for (code, target) in to_release.into_iter().rev() {
            arbitration.actions.extend(target.actions(false));
            arbitration.suppressed.push(code);
        }
        self.emitting = still_emitting;

        // Then let through anything newly allowed.
        for (code, target) in desired {
            if self.emitting.iter().any(|(active, _)| *active == code) {
                continue;
            }

            arbitration.actions.extend(target.actions(true));
            arbitration.activated.push((code, target.clone()));
            self.emitting.push((code, target));
        }

        arbitration
    }
}
