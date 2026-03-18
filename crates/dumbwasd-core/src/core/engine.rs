use anyhow::Result;
use tokio::time::sleep_until;

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
            if let Some(deadline) = self.mapper.next_deadline() {
                tokio::select! {
                    event = self.input.next_event() => {
                        let event = event?;
                        self.process_input_event(event).await?;
                    }
                    _ = sleep_until(deadline) => {
                        self.flush_due_actions().await?;
                    }
                    _ = tokio::signal::ctrl_c() => {
                        tracing::info!("Received Ctrl+C, shutting down");
                        break;
                    }
                }
            } else {
                tokio::select! {
                    event = self.input.next_event() => {
                        let event = event?;
                        self.process_input_event(event).await?;
                    }
                    _ = tokio::signal::ctrl_c() => {
                        tracing::info!("Received Ctrl+C, shutting down");
                        break;
                    }
                }
            }
        }

        Ok(())
    }

    async fn process_input_event(&mut self, event: InputEvent) -> Result<()> {
        if let InputEvent::Sync = &event {
            self.output.emit_sync()?;
            return Ok(());
        }

        let actions = self
            .mapper
            .handle_event(&event, &self.profile, tokio::time::Instant::now());

        if actions.is_empty() {
            tracing::trace!(?event, "unmapped (no matching profile entry)");
            return Ok(());
        }

        tracing::info!(?event, ?actions, "mapped");
        self.emit_actions(actions)?;
        Ok(())
    }

    async fn flush_due_actions(&mut self) -> Result<()> {
        let actions = self
            .mapper
            .flush_due(&self.profile, tokio::time::Instant::now());

        if actions.is_empty() {
            return Ok(());
        }

        tracing::info!(?actions, "mapped delayed trigger");
        self.emit_actions(actions)?;
        Ok(())
    }

    fn emit_actions(&mut self, actions: Vec<crate::core::event::OutputAction>) -> Result<()> {
        for action in &actions {
            self.output.emit(action)?;
        }
        self.output.emit_sync()?;
        Ok(())
    }
}
