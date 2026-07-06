use std::collections::HashMap;

use tokio::time::Instant;

use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{Binding, Profile};

use super::types::{
    ActionSequence, ActiveLatch, ActiveRepeater, InteractionState, OutputMode, ScheduledAction,
};

/// Resolves input events to output actions based on the active profile.
#[derive(Default)]
pub struct Mapper {
    pub(super) interactions: HashMap<u16, InteractionState>,
    pub(super) scheduled_actions: Vec<ScheduledAction>,
    pub(super) repeaters: HashMap<String, ActiveRepeater>,
    pub(super) latches: HashMap<String, ActiveLatch>,
}

impl Mapper {
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a physical input event and return any immediately resolved output actions.
    pub fn handle_event(
        &mut self,
        event: &InputEvent,
        profile: &Profile,
        now: Instant,
    ) -> Vec<OutputAction> {
        match event {
            InputEvent::Button { code, pressed } => {
                if self.is_combo_consumed(*code) && !pressed {
                    self.release_combo_input(*code);
                    self.stop_repeaters_for_source(*code);
                    return Vec::new();
                }

                let actions = if let Some(actions) =
                    self.handle_binding_event(*code, *pressed, profile, now)
                {
                    actions
                } else {
                    self.resolve_legacy_mapping(*code, *pressed, profile)
                        .unwrap_or_default()
                };

                let mut actions = actions;
                if !pressed {
                    self.stop_repeaters_for_source(*code);
                    actions.extend(self.stop_latches_for_source(*code, now));
                }

                actions
            }
            _ => Vec::new(),
        }
    }

    /// Flush any binding actions whose deadlines have elapsed.
    pub fn flush_due(&mut self, profile: &Profile, now: Instant) -> Vec<OutputAction> {
        let codes: Vec<u16> = self.interactions.keys().copied().collect();
        let mut actions = Vec::new();

        for code in codes {
            let Some(candidates) = self.binding_candidates(code, profile) else {
                continue;
            };

            let mut reset = false;
            let mut remove = false;
            let mut due_binding: Option<&Binding> = None;

            if let Some(state) = self.interactions.get_mut(&code) {
                if state.is_pressed {
                    if let (Some(deadline), Some(long_binding)) =
                        (state.long_deadline, candidates.long_press)
                    {
                        if !state.long_fired && deadline <= now {
                            due_binding = Some(long_binding.binding);
                            state.long_fired = true;
                            state.long_deadline = None;
                            state.multi_deadline = None;
                        }
                    }
                } else if let Some(deadline) = state.multi_deadline {
                    if deadline <= now {
                        due_binding =
                            Self::resolve_multi_press_binding(&candidates, state.completed_presses);
                        reset = true;
                    }
                }

                if reset {
                    *state = InteractionState::default();
                }

                remove = !state.is_pressed
                    && state.press_started_at.is_none()
                    && !state.long_fired
                    && !state.combo_consumed
                    && state.completed_presses == 0
                    && state.long_deadline.is_none()
                    && state.multi_deadline.is_none();
            }

            if remove {
                self.interactions.remove(&code);
            }

            if let Some(binding) = due_binding {
                actions.extend(self.run_binding(binding, OutputMode::Tap, now));
            }
        }

        let mut pending = Vec::new();
        for scheduled in self.scheduled_actions.drain(..) {
            if scheduled.at <= now {
                actions.push(scheduled.action);
            } else {
                pending.push(scheduled);
            }
        }
        self.scheduled_actions = pending;

        let repeater_keys: Vec<String> = self.repeaters.keys().cloned().collect();
        let mut due_repeats: Vec<(Instant, ActionSequence)> = Vec::new();
        for key in repeater_keys {
            if let Some(repeater) = self.repeaters.get_mut(&key) {
                while repeater.next_fire_at <= now {
                    due_repeats.push((repeater.next_fire_at, repeater.sequence.clone()));
                    repeater.next_fire_at += repeater.interval;
                }
            }
        }
        for (at, sequence) in due_repeats {
            actions.extend(self.enqueue_sequence(at, sequence));
        }

        actions
    }

    /// Return the next mapper deadline that the engine should wake up for.
    pub fn next_deadline(&self) -> Option<Instant> {
        self.interactions
            .values()
            .flat_map(|state| [state.long_deadline, state.multi_deadline])
            .flatten()
            .chain(self.scheduled_actions.iter().map(|scheduled| scheduled.at))
            .chain(
                self.repeaters
                    .values()
                    .map(|repeater| repeater.next_fire_at),
            )
            .min()
    }

    fn resolve_legacy_mapping(
        &self,
        code: u16,
        pressed: bool,
        profile: &Profile,
    ) -> Option<Vec<OutputAction>> {
        let mapping = profile.mappings.iter().find(|m| m.from == code)?;

        Some(mapping.to.actions(pressed))
    }
}
