use tokio::time::{Duration, Instant};

use crate::core::event::OutputAction;
use crate::core::profile::{Behavior, Binding, BindingOutput, MacroStep};

use super::types::{ActionSequence, OutputMode, ScheduledAction};
use super::Mapper;

impl Mapper {
    pub(super) fn binding_sequence(binding: &Binding, mode: OutputMode) -> ActionSequence {
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

    pub(super) fn enqueue_sequence(
        &mut self,
        now: Instant,
        sequence: ActionSequence,
    ) -> Vec<OutputAction> {
        for (delay, action) in sequence.delayed {
            self.scheduled_actions.push(ScheduledAction {
                at: now + delay,
                action,
            });
        }

        sequence.immediate
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

    pub(super) fn macro_sequence(steps: &[MacroStep]) -> ActionSequence {
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
                // Force-feedback output is not wired up in the engine yet;
                // keep the step's timing so the sequence stays in sync.
                MacroStep::Rumble { ms } => {
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

    fn is_mouse_button_code(code: u16) -> bool {
        (0x110..=0x117).contains(&code)
    }
}
