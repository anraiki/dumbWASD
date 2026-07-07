use serde::{Deserialize, Serialize};

use crate::core::event::OutputAction;
use crate::core::macros::SavedMacro;

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
}

/// What an input event maps to.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutputTarget {
    /// A keyboard key.
    Key { code: u16 },
    /// A mouse button.
    MouseButton { code: u16 },
    /// A modifier chord such as Ctrl+L.
    Shortcut { modifiers: Vec<u16>, key: u16 },
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
            Self::Shortcut { modifiers, key } => {
                if !pressed {
                    return Vec::new();
                }

                let mut actions = Vec::with_capacity(modifiers.len() * 2 + 2);

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

                actions
            }
        }
    }
}
