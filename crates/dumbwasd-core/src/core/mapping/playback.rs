use tokio::time::{Duration, Instant};

use crate::core::event::OutputAction;
use crate::core::profile::{Binding, PlaybackMode};

use super::types::{ActiveLatch, ActiveRepeater, OutputMode};
use super::Mapper;

impl Mapper {
    pub(super) fn run_binding(
        &mut self,
        binding: &Binding,
        mode: OutputMode,
        now: Instant,
    ) -> Vec<OutputAction> {
        match binding.playback {
            PlaybackMode::Once => {
                let sequence = Self::binding_sequence(binding, mode);
                self.enqueue_sequence(now, sequence)
            }
            PlaybackMode::WhileHeld => {
                let sequence = Self::binding_sequence(binding, OutputMode::Mirror(true));
                let runtime_key = Self::binding_runtime_key(binding);
                self.latches.insert(
                    runtime_key,
                    ActiveLatch {
                        source_code: binding.from,
                        release_sequence: Self::binding_sequence(
                            binding,
                            OutputMode::Mirror(false),
                        ),
                        stop_on_release: true,
                    },
                );
                self.enqueue_sequence(now, sequence)
            }
            PlaybackMode::RepeatWhileHeld { interval_ms } => {
                let sequence = Self::binding_sequence(binding, OutputMode::Tap);
                let runtime_key = Self::binding_runtime_key(binding);
                self.repeaters.insert(
                    runtime_key,
                    ActiveRepeater {
                        source_code: binding.from,
                        interval: Duration::from_millis(u64::from(interval_ms)),
                        next_fire_at: now + Duration::from_millis(u64::from(interval_ms)),
                        sequence: sequence.clone(),
                        stop_on_release: true,
                    },
                );
                self.enqueue_sequence(now, sequence)
            }
            PlaybackMode::Toggle => {
                let sequence = Self::binding_sequence(binding, OutputMode::Mirror(true));
                let runtime_key = Self::binding_runtime_key(binding);
                if let Some(active_latch) = self.latches.remove(&runtime_key) {
                    self.enqueue_sequence(now, active_latch.release_sequence)
                } else {
                    self.latches.insert(
                        runtime_key,
                        ActiveLatch {
                            source_code: binding.from,
                            release_sequence: Self::binding_sequence(
                                binding,
                                OutputMode::Mirror(false),
                            ),
                            stop_on_release: false,
                        },
                    );
                    self.enqueue_sequence(now, sequence)
                }
            }
            PlaybackMode::ToggleRepeat { interval_ms } => {
                let sequence = Self::binding_sequence(binding, OutputMode::Tap);
                let runtime_key = Self::binding_runtime_key(binding);
                if self.repeaters.remove(&runtime_key).is_some() {
                    Vec::new()
                } else {
                    self.repeaters.insert(
                        runtime_key,
                        ActiveRepeater {
                            source_code: binding.from,
                            interval: Duration::from_millis(u64::from(interval_ms)),
                            next_fire_at: now + Duration::from_millis(u64::from(interval_ms)),
                            sequence: sequence.clone(),
                            stop_on_release: false,
                        },
                    );
                    self.enqueue_sequence(now, sequence)
                }
            }
        }
    }

    fn binding_runtime_key(binding: &Binding) -> String {
        if !binding.id.is_empty() {
            return binding.id.clone();
        }

        format!("binding:{}:{:?}", binding.from, binding.trigger)
    }

    pub(super) fn stop_repeaters_for_source(&mut self, source_code: u16) {
        self.repeaters.retain(|_, repeater| {
            !(repeater.source_code == source_code && repeater.stop_on_release)
        });
    }

    pub(super) fn stop_latches_for_source(
        &mut self,
        source_code: u16,
        now: Instant,
    ) -> Vec<OutputAction> {
        let keys_to_remove: Vec<String> = self
            .latches
            .iter()
            .filter(|(_, latch)| latch.source_code == source_code && latch.stop_on_release)
            .map(|(key, _)| key.clone())
            .collect();

        let mut actions = Vec::new();
        for key in keys_to_remove {
            if let Some(latch) = self.latches.remove(&key) {
                actions.extend(self.enqueue_sequence(now, latch.release_sequence));
            }
        }

        actions
    }
}
