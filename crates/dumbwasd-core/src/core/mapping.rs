use std::collections::HashMap;

use tokio::time::{Duration, Instant};

use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{
    Behavior, Binding, BindingOutput, Combo, MacroStep, OutputTarget, PlaybackMode, Profile,
    Trigger,
};

/// Resolves input events to output actions based on the active profile.
#[derive(Default)]
pub struct Mapper {
    interactions: HashMap<u16, InteractionState>,
    scheduled_actions: Vec<ScheduledAction>,
    repeaters: HashMap<String, ActiveRepeater>,
    latches: HashMap<String, ActiveLatch>,
}

#[derive(Debug, Clone, Default)]
struct InteractionState {
    is_pressed: bool,
    press_started_at: Option<Instant>,
    completed_presses: u8,
    long_fired: bool,
    combo_consumed: bool,
    long_deadline: Option<Instant>,
    multi_deadline: Option<Instant>,
}

#[derive(Debug, Clone)]
struct ScheduledAction {
    at: Instant,
    action: OutputAction,
}

#[derive(Clone)]
struct ActiveRepeater {
    source_code: u16,
    interval: Duration,
    next_fire_at: Instant,
    sequence: ActionSequence,
    stop_on_release: bool,
}

#[derive(Clone)]
struct ActiveLatch {
    source_code: u16,
    release_sequence: ActionSequence,
    stop_on_release: bool,
}

#[derive(Clone, Copy)]
enum OutputMode {
    Mirror(bool),
    Tap,
}

#[derive(Clone, Default)]
struct ActionSequence {
    immediate: Vec<OutputAction>,
    delayed: Vec<(Duration, OutputAction)>,
}

#[derive(Default)]
struct CandidateBindings<'a> {
    press_start: Option<&'a Binding>,
    press_release: Option<&'a Binding>,
    single_press: Option<SingleBinding<'a>>,
    long_press: Option<LongBinding<'a>>,
    double_press: Option<SingleBinding<'a>>,
    triple_press: Option<SingleBinding<'a>>,
}

#[derive(Clone, Copy)]
struct SingleBinding<'a> {
    binding: &'a Binding,
    timeout_ms: u32,
}

#[derive(Clone, Copy)]
struct LongBinding<'a> {
    binding: &'a Binding,
    threshold_ms: u32,
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
                        .into_iter()
                        .collect()
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

    fn handle_binding_event(
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

    fn resolve_multi_press_binding<'a>(
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

    fn binding_candidates<'a>(
        &self,
        code: u16,
        profile: &'a Profile,
    ) -> Option<CandidateBindings<'a>> {
        let mut candidates = CandidateBindings::default();

        for binding in profile
            .devices
            .iter()
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

    fn try_activate_combo(
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

    fn combo_candidates<'a>(&self, code: u16, profile: &'a Profile) -> Vec<&'a Combo> {
        profile
            .devices
            .iter()
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

    fn binding_sequence(binding: &Binding, mode: OutputMode) -> ActionSequence {
        let source_sequence = Self::source_sequence(binding.from, mode);
        let custom_sequence = match (&binding.output, mode) {
            (BindingOutput::Key { code }, OutputMode::Mirror(pressed)) => ActionSequence {
                immediate: vec![OutputAction::Key {
                    code: *code,
                    pressed,
                }],
                delayed: Vec::new(),
            },
            (BindingOutput::KeyTap { code }, _)
            | (BindingOutput::Key { code }, OutputMode::Tap) => ActionSequence {
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
            (BindingOutput::MouseButton { code }, OutputMode::Mirror(pressed)) => ActionSequence {
                immediate: vec![OutputAction::MouseButton {
                    code: *code,
                    pressed,
                }],
                delayed: Vec::new(),
            },
            (BindingOutput::MouseButton { code }, OutputMode::Tap) => ActionSequence {
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
            (BindingOutput::Text { value }, _) => Self::text_sequence(value),
            (BindingOutput::Macro { steps }, _) => Self::macro_sequence(steps),
        };

        match binding.behavior {
            Behavior::Override => custom_sequence,
            Behavior::Disabled => ActionSequence::default(),
            Behavior::Passthrough => source_sequence,
            Behavior::AppendBefore => Self::append_sequences(custom_sequence, source_sequence),
            Behavior::AppendAfter => Self::append_sequences(source_sequence, custom_sequence),
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

    fn enqueue_sequence(&mut self, now: Instant, sequence: ActionSequence) -> Vec<OutputAction> {
        for (delay, action) in sequence.delayed {
            self.scheduled_actions.push(ScheduledAction {
                at: now + delay,
                action,
            });
        }

        sequence.immediate
    }

    fn run_binding(
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

    fn source_sequence(code: u16, mode: OutputMode) -> ActionSequence {
        if Self::is_mouse_button_code(code) {
            match mode {
                OutputMode::Mirror(pressed) => ActionSequence {
                    immediate: vec![OutputAction::MouseButton { code, pressed }],
                    delayed: Vec::new(),
                },
                OutputMode::Tap => ActionSequence {
                    immediate: vec![
                        OutputAction::MouseButton {
                            code,
                            pressed: true,
                        },
                        OutputAction::MouseButton {
                            code,
                            pressed: false,
                        },
                    ],
                    delayed: Vec::new(),
                },
            }
        } else {
            match mode {
                OutputMode::Mirror(pressed) => ActionSequence {
                    immediate: vec![OutputAction::Key { code, pressed }],
                    delayed: Vec::new(),
                },
                OutputMode::Tap => ActionSequence {
                    immediate: vec![
                        OutputAction::Key {
                            code,
                            pressed: true,
                        },
                        OutputAction::Key {
                            code,
                            pressed: false,
                        },
                    ],
                    delayed: Vec::new(),
                },
            }
        }
    }

    fn append_sequences(first: ActionSequence, second: ActionSequence) -> ActionSequence {
        let offset = first.max_delay();
        let mut combined = first;
        let shifted = second.shifted(offset);
        combined.immediate.extend(shifted.immediate);
        combined.delayed.extend(shifted.delayed);
        combined
    }

    fn text_sequence(value: &str) -> ActionSequence {
        let mut immediate = Vec::new();

        for ch in value.chars() {
            if let Some(mut actions) = Self::char_actions(ch) {
                immediate.append(&mut actions);
            } else {
                tracing::trace!(character = %ch, "text output character is not supported yet");
            }
        }

        ActionSequence {
            immediate,
            delayed: Vec::new(),
        }
    }

    fn macro_sequence(steps: &[MacroStep]) -> ActionSequence {
        let mut immediate = Vec::new();
        let mut delayed = Vec::new();
        let mut offset = Duration::ZERO;

        for step in steps {
            match step {
                MacroStep::KeyDown { code } => {
                    Self::push_sequence_action(
                        &mut immediate,
                        &mut delayed,
                        offset,
                        OutputAction::Key {
                            code: *code,
                            pressed: true,
                        },
                    );
                }
                MacroStep::KeyUp { code } => {
                    Self::push_sequence_action(
                        &mut immediate,
                        &mut delayed,
                        offset,
                        OutputAction::Key {
                            code: *code,
                            pressed: false,
                        },
                    );
                }
                MacroStep::KeyTap { code } => {
                    Self::push_sequence_action(
                        &mut immediate,
                        &mut delayed,
                        offset,
                        OutputAction::Key {
                            code: *code,
                            pressed: true,
                        },
                    );
                    Self::push_sequence_action(
                        &mut immediate,
                        &mut delayed,
                        offset,
                        OutputAction::Key {
                            code: *code,
                            pressed: false,
                        },
                    );
                }
                MacroStep::MouseButton { code, pressed } => {
                    Self::push_sequence_action(
                        &mut immediate,
                        &mut delayed,
                        offset,
                        OutputAction::MouseButton {
                            code: *code,
                            pressed: *pressed,
                        },
                    );
                }
                MacroStep::Delay { ms } => {
                    offset += Duration::from_millis(u64::from(*ms));
                }
            }
        }

        ActionSequence { immediate, delayed }
    }

    fn push_sequence_action(
        immediate: &mut Vec<OutputAction>,
        delayed: &mut Vec<(Duration, OutputAction)>,
        offset: Duration,
        action: OutputAction,
    ) {
        if offset.is_zero() {
            immediate.push(action);
        } else {
            delayed.push((offset, action));
        }
    }

    fn char_actions(ch: char) -> Option<Vec<OutputAction>> {
        let (code, needs_shift) = match ch {
            'a'..='z' => (Self::alpha_code(ch), false),
            'A'..='Z' => (Self::alpha_code(ch.to_ascii_lowercase()), true),
            '1' => (2, false),
            '2' => (3, false),
            '3' => (4, false),
            '4' => (5, false),
            '5' => (6, false),
            '6' => (7, false),
            '7' => (8, false),
            '8' => (9, false),
            '9' => (10, false),
            '0' => (11, false),
            ' ' => (57, false),
            '-' => (12, false),
            '_' => (12, true),
            '=' => (13, false),
            '+' => (13, true),
            '[' => (26, false),
            '{' => (26, true),
            ']' => (27, false),
            '}' => (27, true),
            ';' => (39, false),
            ':' => (39, true),
            '\'' => (40, false),
            '"' => (40, true),
            '`' => (41, false),
            '~' => (41, true),
            '\\' => (43, false),
            '|' => (43, true),
            ',' => (51, false),
            '<' => (51, true),
            '.' => (52, false),
            '>' => (52, true),
            '/' => (53, false),
            '?' => (53, true),
            '!' => (2, true),
            '@' => (3, true),
            '#' => (4, true),
            '$' => (5, true),
            '%' => (6, true),
            '^' => (7, true),
            '&' => (8, true),
            '*' => (9, true),
            '(' => (10, true),
            ')' => (11, true),
            _ => return None,
        };

        let mut actions = Vec::new();

        if needs_shift {
            actions.push(OutputAction::Key {
                code: 42,
                pressed: true,
            });
        }

        actions.push(OutputAction::Key {
            code,
            pressed: true,
        });
        actions.push(OutputAction::Key {
            code,
            pressed: false,
        });

        if needs_shift {
            actions.push(OutputAction::Key {
                code: 42,
                pressed: false,
            });
        }

        Some(actions)
    }

    fn alpha_code(ch: char) -> u16 {
        match ch {
            'q' => 16,
            'w' => 17,
            'e' => 18,
            'r' => 19,
            't' => 20,
            'y' => 21,
            'u' => 22,
            'i' => 23,
            'o' => 24,
            'p' => 25,
            'a' => 30,
            's' => 31,
            'd' => 32,
            'f' => 33,
            'g' => 34,
            'h' => 35,
            'j' => 36,
            'k' => 37,
            'l' => 38,
            'z' => 44,
            'x' => 45,
            'c' => 46,
            'v' => 47,
            'b' => 48,
            'n' => 49,
            'm' => 50,
            _ => 0,
        }
    }

    fn is_combo_consumed(&self, code: u16) -> bool {
        self.interactions
            .get(&code)
            .map(|state| state.combo_consumed)
            .unwrap_or(false)
    }

    fn release_combo_input(&mut self, code: u16) {
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

    fn resolve_legacy_mapping(
        &self,
        code: u16,
        pressed: bool,
        profile: &Profile,
    ) -> Option<OutputAction> {
        let mapping = profile.mappings.iter().find(|m| m.from == code)?;

        Some(match &mapping.to {
            OutputTarget::Key { code } => OutputAction::Key {
                code: *code,
                pressed,
            },
            OutputTarget::MouseButton { code } => OutputAction::MouseButton {
                code: *code,
                pressed,
            },
        })
    }

    fn is_mouse_button_code(code: u16) -> bool {
        (0x110..=0x117).contains(&code)
    }

    fn binding_runtime_key(binding: &Binding) -> String {
        if !binding.id.is_empty() {
            return binding.id.clone();
        }

        format!("binding:{}:{:?}", binding.from, binding.trigger)
    }

    fn stop_repeaters_for_source(&mut self, source_code: u16) {
        self.repeaters.retain(|_, repeater| {
            !(repeater.source_code == source_code && repeater.stop_on_release)
        });
    }

    fn stop_latches_for_source(&mut self, source_code: u16, now: Instant) -> Vec<OutputAction> {
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

impl CandidateBindings<'_> {
    fn is_empty(&self) -> bool {
        self.press_start.is_none()
            && self.press_release.is_none()
            && self.single_press.is_none()
            && self.long_press.is_none()
            && self.double_press.is_none()
            && self.triple_press.is_none()
    }

    fn has_deferred_triggers(&self) -> bool {
        self.single_press.is_some()
            || self.long_press.is_some()
            || self.double_press.is_some()
            || self.triple_press.is_some()
    }

    fn max_multi_timeout_ms(&self) -> Option<u32> {
        [self.single_press, self.double_press, self.triple_press]
            .into_iter()
            .flatten()
            .map(|binding| binding.timeout_ms)
            .max()
    }
}

impl ActionSequence {
    fn max_delay(&self) -> Duration {
        self.delayed
            .iter()
            .map(|(delay, _)| *delay)
            .max()
            .unwrap_or(Duration::ZERO)
    }

    fn shifted(mut self, offset: Duration) -> Self {
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

#[cfg(test)]
mod tests {
    use super::Mapper;
    use crate::core::event::{InputEvent, OutputAction};
    use crate::core::profile::{
        Behavior, Binding, BindingOutput, BindingPreset, Combo, MacroStep, Mapping, OutputTarget,
        PlaybackMode, Profile, ProfileDevice, ProfileMeta, Trigger,
    };
    use tokio::time::{Duration, Instant};

    #[test]
    fn resolves_legacy_mapping() {
        let profile = Profile {
            profile: ProfileMeta {
                name: "Default".to_string(),
                device_name: None,
            },
            devices: Vec::new(),
            mappings: vec![Mapping {
                device: None,
                from: 30,
                to: OutputTarget::Key { code: 37 },
            }],
        };

        let mut mapper = Mapper::new();
        let actions = mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            Instant::now(),
        );

        assert_eq!(
            actions,
            vec![OutputAction::Key {
                code: 37,
                pressed: true,
            }]
        );
    }

    #[test]
    fn resolves_press_start_immediately() {
        let profile = single_binding_profile(Trigger::PressStart, BindingOutput::Key { code: 37 });
        let mut mapper = Mapper::new();

        let actions = mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            Instant::now(),
        );

        assert_eq!(
            actions,
            vec![OutputAction::Key {
                code: 37,
                pressed: true,
            }]
        );
    }

    #[test]
    fn resolves_single_press_after_timeout() {
        let profile = single_binding_profile(
            Trigger::SinglePress {
                multi_press_timeout_ms: 250,
            },
            BindingOutput::KeyTap { code: 37 },
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            )
            .is_empty());
        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(10),
            )
            .is_empty());

        let actions = mapper.flush_due(&profile, start + Duration::from_millis(260));

        assert_eq!(
            actions,
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );
    }

    #[test]
    fn resolves_double_press_after_second_timeout() {
        let profile = single_binding_profile(
            Trigger::DoublePress {
                multi_press_timeout_ms: 200,
            },
            BindingOutput::KeyTap { code: 37 },
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        for (offset, pressed) in [(0, true), (10, false), (60, true), (70, false)] {
            assert!(mapper
                .handle_event(
                    &InputEvent::Button { code: 30, pressed },
                    &profile,
                    start + Duration::from_millis(offset),
                )
                .is_empty());
        }

        let actions = mapper.flush_due(&profile, start + Duration::from_millis(280));

        assert_eq!(
            actions,
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );
    }

    #[test]
    fn resolves_long_press_when_threshold_expires() {
        let profile = single_binding_profile(
            Trigger::LongPress { long_press_ms: 300 },
            BindingOutput::KeyTap { code: 37 },
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            )
            .is_empty());

        let actions = mapper.flush_due(&profile, start + Duration::from_millis(320));

        assert_eq!(
            actions,
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );
    }

    #[test]
    fn resolves_combo_when_inputs_pressed_within_window() {
        let profile = Profile {
            profile: ProfileMeta {
                name: "Default".to_string(),
                device_name: None,
            },
            devices: vec![ProfileDevice {
                id: "keyboard".to_string(),
                vendor_id: 1,
                product_id: 2,
                name: "Keyboard".to_string(),
                raw_name: String::new(),
                layout: String::new(),
                device_kind: String::new(),
                active_binding_preset: "default".to_string(),
                binding_presets: vec![BindingPreset {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    bindings: Vec::new(),
                    combos: vec![Combo {
                        id: "combo-a-b".to_string(),
                        enabled: true,
                        inputs: vec![30, 48],
                        combo_window_ms: 60,
                        behavior: Behavior::Override,
                        output: BindingOutput::KeyTap { code: 46 },
                        playback: PlaybackMode::Once,
                    }],
                }],
            }],
            mappings: Vec::new(),
        };
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            )
            .is_empty());

        let actions = mapper.handle_event(
            &InputEvent::Button {
                code: 48,
                pressed: true,
            },
            &profile,
            start + Duration::from_millis(20),
        );

        assert_eq!(
            actions,
            vec![
                OutputAction::Key {
                    code: 46,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 46,
                    pressed: false,
                },
            ]
        );

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(30),
            )
            .is_empty());
        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 48,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(40),
            )
            .is_empty());
    }

    #[test]
    fn resolves_text_output_immediately() {
        let profile = single_binding_profile(
            Trigger::PressStart,
            BindingOutput::Text {
                value: "Ab".to_string(),
            },
        );
        let mut mapper = Mapper::new();

        let actions = mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            Instant::now(),
        );

        assert_eq!(
            actions,
            vec![
                OutputAction::Key {
                    code: 42,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 30,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 30,
                    pressed: false,
                },
                OutputAction::Key {
                    code: 42,
                    pressed: false,
                },
                OutputAction::Key {
                    code: 48,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 48,
                    pressed: false,
                },
            ]
        );
    }

    #[test]
    fn resolves_macro_output_with_delays() {
        let profile = single_binding_profile(
            Trigger::PressStart,
            BindingOutput::Macro {
                steps: vec![
                    MacroStep::KeyTap { code: 30 },
                    MacroStep::Delay { ms: 40 },
                    MacroStep::KeyTap { code: 48 },
                ],
            },
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        let immediate = mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start,
        );

        assert_eq!(
            immediate,
            vec![
                OutputAction::Key {
                    code: 30,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 30,
                    pressed: false,
                },
            ]
        );

        assert!(mapper
            .flush_due(&profile, start + Duration::from_millis(20))
            .is_empty());
        assert_eq!(
            mapper.flush_due(&profile, start + Duration::from_millis(50)),
            vec![
                OutputAction::Key {
                    code: 48,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 48,
                    pressed: false,
                },
            ]
        );
    }

    #[test]
    fn resolves_while_held_as_press_then_release() {
        let profile = single_binding_profile_with_playback(
            Trigger::PressStart,
            BindingOutput::Key { code: 37 },
            PlaybackMode::WhileHeld,
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert_eq!(
            mapper.handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            ),
            vec![OutputAction::Key {
                code: 37,
                pressed: true,
            }]
        );

        assert_eq!(
            mapper.handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(10),
            ),
            vec![OutputAction::Key {
                code: 37,
                pressed: false,
            }]
        );
    }

    #[test]
    fn resolves_toggle_as_press_then_second_press_release() {
        let profile = single_binding_profile_with_playback(
            Trigger::PressStart,
            BindingOutput::Key { code: 37 },
            PlaybackMode::Toggle,
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert_eq!(
            mapper.handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            ),
            vec![OutputAction::Key {
                code: 37,
                pressed: true,
            }]
        );

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(10),
            )
            .is_empty());

        assert_eq!(
            mapper.handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start + Duration::from_millis(20),
            ),
            vec![OutputAction::Key {
                code: 37,
                pressed: false,
            }]
        );
    }

    #[test]
    fn resolves_repeat_while_held_until_release() {
        let profile = single_binding_profile_with_playback(
            Trigger::PressStart,
            BindingOutput::KeyTap { code: 37 },
            PlaybackMode::RepeatWhileHeld { interval_ms: 30 },
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert_eq!(
            mapper.handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            ),
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );

        assert_eq!(
            mapper.flush_due(&profile, start + Duration::from_millis(35)),
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(40),
            )
            .is_empty());
        assert!(mapper
            .flush_due(&profile, start + Duration::from_millis(80))
            .is_empty());
    }

    #[test]
    fn resolves_toggle_repeat_until_next_trigger() {
        let profile = single_binding_profile_with_playback(
            Trigger::PressStart,
            BindingOutput::KeyTap { code: 37 },
            PlaybackMode::ToggleRepeat { interval_ms: 30 },
        );
        let mut mapper = Mapper::new();
        let start = Instant::now();

        assert_eq!(
            mapper.handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start,
            ),
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );
        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: false,
                },
                &profile,
                start + Duration::from_millis(5),
            )
            .is_empty());

        assert_eq!(
            mapper.flush_due(&profile, start + Duration::from_millis(35)),
            vec![
                OutputAction::Key {
                    code: 37,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 37,
                    pressed: false,
                },
            ]
        );

        assert!(mapper
            .handle_event(
                &InputEvent::Button {
                    code: 30,
                    pressed: true,
                },
                &profile,
                start + Duration::from_millis(40),
            )
            .is_empty());
        assert!(mapper
            .flush_due(&profile, start + Duration::from_millis(80))
            .is_empty());
    }

    fn single_binding_profile(trigger: Trigger, output: BindingOutput) -> Profile {
        single_binding_profile_with_playback(trigger, output, PlaybackMode::Once)
    }

    fn single_binding_profile_with_playback(
        trigger: Trigger,
        output: BindingOutput,
        playback: PlaybackMode,
    ) -> Profile {
        Profile {
            profile: ProfileMeta {
                name: "Default".to_string(),
                device_name: None,
            },
            devices: vec![ProfileDevice {
                id: "keyboard".to_string(),
                vendor_id: 1,
                product_id: 2,
                name: "Keyboard".to_string(),
                raw_name: String::new(),
                layout: String::new(),
                device_kind: String::new(),
                active_binding_preset: "default".to_string(),
                binding_presets: vec![BindingPreset {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    bindings: vec![Binding {
                        id: "binding".to_string(),
                        enabled: true,
                        from: 30,
                        trigger,
                        behavior: Behavior::Override,
                        output,
                        playback,
                    }],
                    combos: Vec::new(),
                }],
            }],
            mappings: Vec::new(),
        }
    }
}
