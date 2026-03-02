use anyhow::Result;

use crate::core::event::InputEvent;
use crate::core::mapping::Mapper;
use crate::core::profile::Profile;
use crate::platform::{InputBackend, OutputBackend};

/// The main event loop: reads input, maps it, emits output.
pub struct Engine<I: InputBackend, O: OutputBackend> {
    input: I,
    output: O,
    profile: Profile,
    mapper: Mapper,
}

impl<I: InputBackend, O: OutputBackend> Engine<I, O> {
    pub fn new(input: I, output: O, profile: Profile) -> Self {
        Self {
            input,
            output,
            profile,
            mapper: Mapper::new(),
        }
    }

    /// Run the event loop until interrupted.
    pub async fn run(&mut self) -> Result<()> {
        loop {
            tokio::select! {
                event = self.input.next_event() => {
                    let event = event?;

                    if let InputEvent::Sync = &event {
                        self.output.emit_sync()?;
                        continue;
                    }

                    if let Some(action) = self.mapper.resolve(&event, &self.profile) {
                        tracing::info!(?event, ?action, "mapped");
                        self.output.emit(&action)?;
                        self.output.emit_sync()?;
                    } else {
                        tracing::trace!(?event, "unmapped (no matching profile entry)");
                    }
                }
                _ = tokio::signal::ctrl_c() => {
                    tracing::info!("Received Ctrl+C, shutting down");
                    break;
                }
            }
        }

        Ok(())
    }
}
