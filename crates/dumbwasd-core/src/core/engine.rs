use std::collections::HashMap;

use anyhow::Result;
use tokio::time::{sleep_until, Instant};

use crate::core::event::{InputEvent, OutputAction};
use crate::core::mapping::Mapper;
use crate::core::profile::Profile;
use crate::core::sticks::{StickThresholds, StickTracker};
use crate::platform::{InputBackend, OutputBackend};

/// An auto-repeating binding that fires for as long as its button is held.
struct ActiveRepeat {
    actions: Vec<OutputAction>,
    interval: std::time::Duration,
    next_fire_at: Instant,
}

/// The main event loop: reads input, maps it, emits output.
pub struct Engine<I: InputBackend, O: OutputBackend> {
    input: I,
    output: O,
    profile: Profile,
    mapper: Mapper,
    sticks: StickTracker,
    /// Auto-repeating bindings, keyed by the source button holding them.
    repeats: HashMap<u16, ActiveRepeat>,
}

impl<I: InputBackend, O: OutputBackend> Engine<I, O> {
    pub fn new(input: I, output: O, profile: Profile) -> Self {
        let mut sticks = StickTracker::new(StickThresholds::default());
        for (axis, minimum, maximum, flat) in input.axis_ranges() {
            sticks.set_axis_range(axis, minimum, maximum, flat);
        }

        Self {
            input,
            output,
            profile,
            mapper: Mapper::new(),
            sticks,
            repeats: HashMap::new(),
        }
    }

    /// Run the event loop until interrupted.
    pub async fn run(&mut self) -> Result<()> {
        loop {
            if let Some(deadline) = self.next_deadline() {
                tokio::select! {
                    event = self.input.next_event() => {
                        let event = event?;
                        self.process_input_event(event).await?;
                    }
                    _ = sleep_until(deadline) => {
                        self.flush_due_actions().await?;
                        self.fire_due_repeats().await?;
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

        // Thumbstick motion has no button code of its own. Convert it into
        // presses on the synthetic stick codes and map those instead, so a
        // stick direction binds like any other button.
        if let InputEvent::Axis { axis, value } = &event {
            let synthesized = self.sticks.handle_axis(*axis, *value);
            for stick_event in synthesized {
                if let InputEvent::Button { code, pressed } = &stick_event {
                    self.track_repeat(*code, *pressed);
                }
                let actions = self.mapper.handle_event(
                    &stick_event,
                    &self.profile,
                    tokio::time::Instant::now(),
                );
                if !actions.is_empty() {
                    tracing::info!(?stick_event, ?actions, "mapped stick direction");
                    self.emit_actions(actions)?;
                }
            }
            return Ok(());
        }

        if let InputEvent::Button { code, pressed } = &event {
            self.track_repeat(*code, *pressed);
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

    /// The soonest the loop needs to wake, across mapper deadlines and any
    /// auto-repeat that is currently held.
    fn next_deadline(&self) -> Option<Instant> {
        let repeat = self
            .repeats
            .values()
            .map(|repeat| repeat.next_fire_at)
            .min();

        match (self.mapper.next_deadline(), repeat) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (deadline, None) => deadline,
            (None, deadline) => deadline,
        }
    }

    /// Start or stop an auto-repeat as its button is pressed or released.
    fn track_repeat(&mut self, code: u16, pressed: bool) {
        if !pressed {
            self.repeats.remove(&code);
            return;
        }

        let Some(mapping) = self.profile.mappings.iter().find(|m| m.from == code) else {
            return;
        };
        let Some(interval) = mapping.to.repeat_interval() else {
            return;
        };
        let actions = mapping.to.repeat_actions();
        if actions.is_empty() {
            return;
        }

        self.repeats.insert(
            code,
            ActiveRepeat {
                actions,
                interval,
                next_fire_at: Instant::now() + interval,
            },
        );
    }

    /// Emit every auto-repeat whose interval has elapsed.
    async fn fire_due_repeats(&mut self) -> Result<()> {
        let now = Instant::now();
        let mut due: Vec<OutputAction> = Vec::new();

        for repeat in self.repeats.values_mut() {
            while repeat.next_fire_at <= now {
                due.extend(repeat.actions.iter().cloned());
                repeat.next_fire_at += repeat.interval;
            }
        }

        if due.is_empty() {
            return Ok(());
        }

        tracing::debug!(count = due.len(), "auto-repeat tick");
        self.emit_actions(due)
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
