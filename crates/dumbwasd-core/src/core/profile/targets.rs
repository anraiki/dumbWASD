use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::core::event::OutputAction;
use crate::core::macros::SavedMacro;

/// Floor for a repeat interval, in milliseconds.
///
/// Each tick emits the whole chord — press and release for every modifier
/// plus the key — so a very short interval turns into a stream of input
/// events that bogs down the receiving application.
pub const MIN_REPEAT_MS: u32 = 100;

/// A single input-to-output mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mapping {
    /// Optional device key ("vendor_id:product_id"). If absent, mapping applies globally.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    /// Source evdev event code (e.g. BTN_SOUTH = 304).
    pub from: u16,
    /// Target output action.
    pub to: OutputTarget,
    /// Claim exclusive use of the output while this binding is held.
    ///
    /// Every other binding's output is released and stays suppressed for the
    /// duration, so a chord cannot be polluted by keys another binding is
    /// already holding down. Among several exclusive bindings the
    /// earliest-pressed one owns the output; later ones wait their turn.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub exclusive: bool,
    /// Latch the binding: the first press activates it and it stays active
    /// until pressed again, rather than following the button.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub toggle: bool,
}

/// What an input event maps to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutputTarget {
    /// A keyboard key.
    Key { code: u16 },
    /// A mouse button.
    MouseButton { code: u16 },
    /// A modifier chord such as Ctrl+L.
    ///
    /// Held by default: the modifiers and key go down on press and come back
    /// up on release, so the chord follows the button exactly like a plain
    /// key does. The host keyboard repeat applies while it is held.
    ///
    /// Setting `repeat_ms` switches to auto-repeat instead: the chord is
    /// tapped on press and re-tapped every `repeat_ms` for as long as the
    /// button is held, at a rate that does not depend on the host's keyboard
    /// repeat settings. Nothing stays held down in that mode.
    Shortcut {
        modifiers: Vec<u16>,
        key: u16,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        repeat_ms: Option<u32>,
    },
    /// A macro imported from the macro library.
    ///
    /// `definition` is a snapshot embedded into the profile at bind time -
    /// like code loaded into memory. Editing or deleting the library macro
    /// leaves this copy untouched until the binding is explicitly reimported;
    /// `definition.id` records which library macro it was imported from.
    ///
    /// Playback is driven by a host-side runner, not by direct action
    /// expansion, so `actions()` yields nothing for this variant.
    Macro {
        #[serde(default)]
        mode: MacroBindMode,
        definition: SavedMacro,
    },
}

/// How a button press drives a bound macro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MacroBindMode {
    /// Press starts playback; pressing again while playing stops it.
    #[default]
    Toggle,
    /// Playback runs while the button is held and stops on release.
    Hold,
}

impl OutputTarget {
    pub fn actions(&self, pressed: bool) -> Vec<OutputAction> {
        match self {
            Self::Macro { .. } => Vec::new(),
            Self::Key { code } => vec![OutputAction::Key {
                code: *code,
                pressed,
            }],
            Self::MouseButton { code } => vec![OutputAction::MouseButton {
                code: *code,
                pressed,
            }],
            Self::Shortcut {
                modifiers,
                key,
                repeat_ms,
            } => {
                // Auto-repeat taps the whole chord on the press edge and
                // leaves nothing held, so the release edge has no work.
                if repeat_ms.is_some() {
                    return if pressed {
                        shortcut_tap(modifiers, *key)
                    } else {
                        Vec::new()
                    };
                }

                let mut actions = Vec::with_capacity(modifiers.len() + 1);

                if pressed {
                    for modifier in modifiers {
                        actions.push(OutputAction::Key {
                            code: *modifier,
                            pressed: true,
                        });
                    }
                    actions.push(OutputAction::Key {
                        code: *key,
                        pressed: true,
                    });
                } else {
                    // Release in reverse so the modifiers outlive the key and
                    // the chord never decays into a bare keypress.
                    actions.push(OutputAction::Key {
                        code: *key,
                        pressed: false,
                    });
                    for modifier in modifiers.iter().rev() {
                        actions.push(OutputAction::Key {
                            code: *modifier,
                            pressed: false,
                        });
                    }
                }

                actions
            }
        }
    }

    /// How long to wait between repeats while the button is held, or `None`
    /// when this target does not repeat.
    ///
    /// Intervals below [`MIN_REPEAT_MS`] are raised to it. Firing a whole
    /// chord faster than that floods the virtual device and the applications
    /// reading it, so the floor is enforced here rather than trusted to the
    /// UI — a hand-edited profile has to obey it too.
    pub fn repeat_interval(&self) -> Option<Duration> {
        match self {
            Self::Shortcut { repeat_ms, .. } => repeat_ms
                .filter(|ms| *ms > 0)
                .map(|ms| Duration::from_millis(u64::from(ms.max(MIN_REPEAT_MS)))),
            _ => None,
        }
    }

    /// The actions to emit on each auto-repeat tick. Empty when the target
    /// does not auto-repeat.
    pub fn repeat_actions(&self) -> Vec<OutputAction> {
        match self {
            Self::Shortcut {
                modifiers,
                key,
                repeat_ms,
            } if repeat_ms.is_some_and(|ms| ms > 0) => shortcut_tap(modifiers, *key),
            _ => Vec::new(),
        }
    }
}

/// One complete press-and-release of a chord.
fn shortcut_tap(modifiers: &[u16], key: u16) -> Vec<OutputAction> {
    let mut actions = Vec::with_capacity(modifiers.len() * 2 + 2);

    for modifier in modifiers {
        actions.push(OutputAction::Key {
            code: *modifier,
            pressed: true,
        });
    }
    actions.push(OutputAction::Key {
        code: key,
        pressed: true,
    });
    actions.push(OutputAction::Key {
        code: key,
        pressed: false,
    });
    for modifier in modifiers.iter().rev() {
        actions.push(OutputAction::Key {
            code: *modifier,
            pressed: false,
        });
    }

    actions
}
