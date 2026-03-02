use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{OutputTarget, Profile};

/// Resolves input events to output actions based on the active profile.
pub struct Mapper;

impl Mapper {
    pub fn new() -> Self {
        Self
    }

    /// Try to map an input event to an output action using the given profile.
    ///
    /// Returns `None` if no mapping exists for this event.
    pub fn resolve(&self, event: &InputEvent, profile: &Profile) -> Option<OutputAction> {
        match event {
            InputEvent::Button { code, pressed } => {
                let mapping = profile.mappings.iter().find(|m| m.from == *code)?;

                Some(match &mapping.to {
                    OutputTarget::Key { code } => OutputAction::Key {
                        code: *code,
                        pressed: *pressed,
                    },
                    OutputTarget::MouseButton { code } => OutputAction::MouseButton {
                        code: *code,
                        pressed: *pressed,
                    },
                })
            }
            // Axis and Sync events are not mapped in Phase 1
            _ => None,
        }
    }
}
