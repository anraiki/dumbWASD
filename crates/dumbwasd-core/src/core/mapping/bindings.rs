use tokio::time::{Duration, Instant};

use crate::core::event::OutputAction;
use crate::core::profile::{Binding, BindingOutput, PlaybackMode, Profile, Trigger};

use super::types::{CandidateBindings, InteractionState, LongBinding, OutputMode, SingleBinding};
use super::Mapper;

impl Mapper {
    pub(super) fn handle_binding_event(
        &mut self,
        code: u16,
        pressed: bool,
        profile: &Profile,
        now: Instant,
    ) -> Option<Vec<OutputAction>> {
        let candidates = self.binding_candidates(code, profile);
        let has_combo_candidates = !self.combo_candidates(code, profile).is_empty();
        let has_deferred = candidates
            .as_ref()
            .map(|candidates| candidates.has_deferred_triggers())
            .unwrap_or(false);

        if candidates.is_none() && !has_combo_candidates {
            return None;
        }

        let mut actions = Vec::new();

        if pressed {
            {
                let state = self.interactions.entry(code).or_default();
                if state.is_pressed {
                    return Some(actions);
                }

                state.is_pressed = true;
                state.press_started_at = Some(now);
                state.combo_consumed = false;
            }

            if let Some(combo_actions) = self.try_activate_combo(code, profile, now) {
                return Some(combo_actions);
            }

            let state = self.interactions.entry(code).or_default();
            if state.completed_presses == 0 {
                if let Some(long_binding) = candidates.as_ref().and_then(|c| c.long_press) {
                    state.long_deadline =
                        Some(now + Duration::from_millis(u64::from(long_binding.threshold_ms)));
                }
            }

            if !has_deferred {
                if let Some(binding) = candidates.as_ref().and_then(|c| c.press_start) {
                    actions.extend(self.run_binding(binding, OutputMode::Mirror(true), now));
                }
            }
        } else {
            let state = self.interactions.entry(code).or_default();
            if !state.is_pressed {
                return Some(actions);
            }

            if state.combo_consumed {
                state.is_pressed = false;
                state.press_started_at = None;
                state.combo_consumed = false;
                state.long_deadline = None;
                state.multi_deadline = None;
                state.completed_presses = 0;
                state.long_fired = false;
                return Some(actions);
            }

            state.is_pressed = false;
            state.press_started_at = None;
            state.long_deadline = None;

            if state.long_fired {
                *state = InteractionState::default();
            } else if has_deferred
                && candidates
                    .as_ref()
                    .and_then(|candidates| candidates.max_multi_timeout_ms())
                    .is_some()
            {
                state.completed_presses = state.completed_presses.saturating_add(1);
                state.multi_deadline = Some(
                    now + Duration::from_millis(u64::from(
                        candidates
                            .as_ref()
                            .and_then(|candidates| candidates.max_multi_timeout_ms())
                            .unwrap(),
                    )),
                );
            } else if !has_deferred {
                if let Some(binding) = candidates.as_ref().and_then(|c| c.press_release) {
                    actions.extend(self.run_binding(binding, OutputMode::Mirror(false), now));
                }
            }
        }

        let should_remove = self
            .interactions
            .get(&code)
            .map(|state| {
                !state.is_pressed
                    && state.press_started_at.is_none()
                    && !state.long_fired
                    && !state.combo_consumed
                    && state.completed_presses == 0
                    && state.long_deadline.is_none()
                    && state.multi_deadline.is_none()
            })
            .unwrap_or(false);

        if should_remove {
            self.interactions.remove(&code);
        }

        Some(actions)
    }

    pub(super) fn resolve_multi_press_binding<'a>(
        candidates: &'a CandidateBindings<'a>,
        completed_presses: u8,
    ) -> Option<&'a Binding> {
        match completed_presses {
            1 => candidates.single_press.map(|candidate| candidate.binding),
            2 => candidates.double_press.map(|candidate| candidate.binding),
            3 => candidates.triple_press.map(|candidate| candidate.binding),
            _ => None,
        }
    }

    pub(super) fn binding_candidates<'a>(
        &self,
        code: u16,
        profile: &'a Profile,
    ) -> Option<CandidateBindings<'a>> {
        let mut candidates = CandidateBindings::default();

        for binding in profile
            .devices
            .iter()
            .filter(|device| device.mappings_enabled)
            .filter_map(|device| device.active_binding_preset())
            .flat_map(|binding_preset| binding_preset.bindings.iter())
            .filter(|binding| binding.enabled && binding.from == code)
        {
            if !Self::binding_runtime_supported(binding) {
                continue;
            }

            match binding.trigger {
                Trigger::PressStart => {
                    candidates.press_start.get_or_insert(binding);
                }
                Trigger::PressRelease => {
                    candidates.press_release.get_or_insert(binding);
                }
                Trigger::SinglePress {
                    multi_press_timeout_ms,
                } => {
                    candidates.single_press.get_or_insert(SingleBinding {
                        binding,
                        timeout_ms: multi_press_timeout_ms,
                    });
                }
                Trigger::LongPress { long_press_ms } => {
                    candidates.long_press.get_or_insert(LongBinding {
                        binding,
                        threshold_ms: long_press_ms,
                    });
                }
                Trigger::DoublePress {
                    multi_press_timeout_ms,
                } => {
                    candidates.double_press.get_or_insert(SingleBinding {
                        binding,
                        timeout_ms: multi_press_timeout_ms,
                    });
                }
                Trigger::TriplePress {
                    multi_press_timeout_ms,
                } => {
                    candidates.triple_press.get_or_insert(SingleBinding {
                        binding,
                        timeout_ms: multi_press_timeout_ms,
                    });
                }
            }
        }

        if candidates.is_empty() {
            None
        } else {
            Some(candidates)
        }
    }

    fn binding_runtime_supported(binding: &Binding) -> bool {
        if !matches!(
            binding.playback,
            PlaybackMode::Once
                | PlaybackMode::WhileHeld
                | PlaybackMode::RepeatWhileHeld { .. }
                | PlaybackMode::Toggle
                | PlaybackMode::ToggleRepeat { .. }
        ) {
            tracing::trace!(
                binding_id = binding.id,
                ?binding.playback,
                "binding playback mode not supported by current mapper yet"
            );
            return false;
        }

        match binding.playback {
            PlaybackMode::WhileHeld => {
                matches!(
                    binding.trigger,
                    Trigger::PressStart | Trigger::LongPress { .. }
                ) && matches!(
                    binding.output,
                    BindingOutput::Key { .. } | BindingOutput::MouseButton { .. }
                )
            }
            PlaybackMode::RepeatWhileHeld { .. } => {
                matches!(
                    binding.trigger,
                    Trigger::PressStart | Trigger::LongPress { .. }
                )
            }
            PlaybackMode::Toggle => matches!(
                binding.output,
                BindingOutput::Key { .. } | BindingOutput::MouseButton { .. }
            ),
            _ => match binding.output {
                BindingOutput::Key { .. }
                | BindingOutput::KeyTap { .. }
                | BindingOutput::MouseButton { .. }
                | BindingOutput::Text { .. }
                | BindingOutput::Macro { .. } => true,
            },
        }
    }
}
