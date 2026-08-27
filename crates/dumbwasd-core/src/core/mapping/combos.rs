use tokio::time::{Duration, Instant};

use crate::core::event::OutputAction;
use crate::core::profile::{Behavior, BindingOutput, Combo, PlaybackMode, Profile};

use super::types::ActionSequence;
use super::Mapper;

impl Mapper {
    pub(super) fn try_activate_combo(
        &mut self,
        code: u16,
        profile: &Profile,
        now: Instant,
    ) -> Option<Vec<OutputAction>> {
        let combo = self
            .combo_candidates(code, profile)
            .into_iter()
            .find(|combo| self.combo_matches(combo, now))?;

        for input in &combo.inputs {
            let state = self.interactions.entry(*input).or_default();
            state.combo_consumed = true;
            state.long_deadline = None;
            state.multi_deadline = None;
            state.long_fired = false;
            state.completed_presses = 0;
        }

        Some(self.enqueue_sequence(now, Self::combo_sequence(combo)))
    }

    pub(super) fn combo_candidates<'a>(&self, code: u16, profile: &'a Profile) -> Vec<&'a Combo> {
        profile
            .devices
            .iter()
            .filter(|device| device.mappings_enabled)
            .filter_map(|device| device.active_binding_preset())
            .flat_map(|binding_preset| binding_preset.combos.iter())
            .filter(|combo| {
                combo.enabled
                    && combo.inputs.contains(&code)
                    && Self::combo_runtime_supported(combo)
            })
            .collect()
    }

    fn combo_matches(&self, combo: &Combo, now: Instant) -> bool {
        let mut earliest = now;
        let mut found_any = false;

        for input in &combo.inputs {
            let Some(state) = self.interactions.get(input) else {
                return false;
            };

            if !state.is_pressed || state.combo_consumed {
                return false;
            }

            let Some(pressed_at) = state.press_started_at else {
                return false;
            };

            if !found_any || pressed_at < earliest {
                earliest = pressed_at;
                found_any = true;
            }
        }

        found_any
            && now.duration_since(earliest)
                <= Duration::from_millis(u64::from(combo.combo_window_ms))
    }

    fn combo_runtime_supported(combo: &Combo) -> bool {
        if !matches!(combo.behavior, Behavior::Override) {
            tracing::trace!(
                combo_id = combo.id,
                ?combo.behavior,
                "combo behavior not supported by current mapper yet"
            );
            return false;
        }

        if !matches!(combo.playback, PlaybackMode::Once) {
            tracing::trace!(
                combo_id = combo.id,
                ?combo.playback,
                "combo playback mode not supported by current mapper yet"
            );
            return false;
        }

        match combo.output {
            BindingOutput::Key { .. }
            | BindingOutput::KeyTap { .. }
            | BindingOutput::MouseButton { .. }
            | BindingOutput::Text { .. }
            | BindingOutput::Macro { .. } => true,
        }
    }

    fn combo_sequence(combo: &Combo) -> ActionSequence {
        match &combo.output {
            BindingOutput::Key { code } | BindingOutput::KeyTap { code } => ActionSequence {
                immediate: vec![
                    OutputAction::Key {
                        code: *code,
                        pressed: true,
                    },
                    OutputAction::Key {
                        code: *code,
                        pressed: false,
                    },
                ],
                delayed: Vec::new(),
            },
            BindingOutput::MouseButton { code } => ActionSequence {
                immediate: vec![
                    OutputAction::MouseButton {
                        code: *code,
                        pressed: true,
                    },
                    OutputAction::MouseButton {
                        code: *code,
                        pressed: false,
                    },
                ],
                delayed: Vec::new(),
            },
            BindingOutput::Text { value } => Self::text_sequence(value),
            BindingOutput::Macro { steps } => Self::macro_sequence(steps),
        }
    }

    pub(super) fn is_combo_consumed(&self, code: u16) -> bool {
        self.interactions
            .get(&code)
            .map(|state| state.combo_consumed)
            .unwrap_or(false)
    }

    pub(super) fn release_combo_input(&mut self, code: u16) {
        let remove = if let Some(state) = self.interactions.get_mut(&code) {
            state.is_pressed = false;
            state.press_started_at = None;
            state.combo_consumed = false;
            state.completed_presses = 0;
            state.long_fired = false;
            state.long_deadline = None;
            state.multi_deadline = None;
            true
        } else {
            false
        };

        if remove {
            self.interactions.remove(&code);
        }
    }
}
