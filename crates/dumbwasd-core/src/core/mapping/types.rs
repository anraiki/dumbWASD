use tokio::time::{Duration, Instant};

use crate::core::event::OutputAction;
use crate::core::profile::Binding;

#[derive(Debug, Clone, Default)]
pub(super) struct InteractionState {
    pub(super) is_pressed: bool,
    pub(super) press_started_at: Option<Instant>,
    pub(super) completed_presses: u8,
    pub(super) long_fired: bool,
    pub(super) combo_consumed: bool,
    pub(super) long_deadline: Option<Instant>,
    pub(super) multi_deadline: Option<Instant>,
}

#[derive(Debug, Clone)]
pub(super) struct ScheduledAction {
    pub(super) at: Instant,
    pub(super) action: OutputAction,
}

#[derive(Clone)]
pub(super) struct ActiveRepeater {
    pub(super) source_code: u16,
    pub(super) interval: Duration,
    pub(super) next_fire_at: Instant,
    pub(super) sequence: ActionSequence,
    pub(super) stop_on_release: bool,
}

#[derive(Clone)]
pub(super) struct ActiveLatch {
    pub(super) source_code: u16,
    pub(super) release_sequence: ActionSequence,
    pub(super) stop_on_release: bool,
}

#[derive(Clone, Copy)]
pub(super) enum OutputMode {
    Mirror(bool),
    Tap,
}

#[derive(Clone, Default)]
pub(super) struct ActionSequence {
    pub(super) immediate: Vec<OutputAction>,
    pub(super) delayed: Vec<(Duration, OutputAction)>,
}

#[derive(Default)]
pub(super) struct CandidateBindings<'a> {
    pub(super) press_start: Option<&'a Binding>,
    pub(super) press_release: Option<&'a Binding>,
    pub(super) single_press: Option<SingleBinding<'a>>,
    pub(super) long_press: Option<LongBinding<'a>>,
    pub(super) double_press: Option<SingleBinding<'a>>,
    pub(super) triple_press: Option<SingleBinding<'a>>,
}

#[derive(Clone, Copy)]
pub(super) struct SingleBinding<'a> {
    pub(super) binding: &'a Binding,
    pub(super) timeout_ms: u32,
}

#[derive(Clone, Copy)]
pub(super) struct LongBinding<'a> {
    pub(super) binding: &'a Binding,
    pub(super) threshold_ms: u32,
}

impl CandidateBindings<'_> {
    pub(super) fn is_empty(&self) -> bool {
        self.press_start.is_none()
            && self.press_release.is_none()
            && self.single_press.is_none()
            && self.long_press.is_none()
            && self.double_press.is_none()
            && self.triple_press.is_none()
    }

    pub(super) fn has_deferred_triggers(&self) -> bool {
        self.single_press.is_some()
            || self.long_press.is_some()
            || self.double_press.is_some()
            || self.triple_press.is_some()
    }

    pub(super) fn max_multi_timeout_ms(&self) -> Option<u32> {
        [self.single_press, self.double_press, self.triple_press]
            .into_iter()
            .flatten()
            .map(|binding| binding.timeout_ms)
            .max()
    }
}

impl ActionSequence {
    pub(super) fn max_delay(&self) -> Duration {
        self.delayed
            .iter()
            .map(|(delay, _)| *delay)
            .max()
            .unwrap_or(Duration::ZERO)
    }

    pub(super) fn shifted(mut self, offset: Duration) -> Self {
        if offset.is_zero() {
            return self;
        }

        let moved_immediate: Vec<_> = self.immediate.drain(..).collect();

        for (delay, _) in &mut self.delayed {
            *delay += offset;
        }

        for action in moved_immediate {
            self.delayed.push((offset, action));
        }

        self
    }
}
