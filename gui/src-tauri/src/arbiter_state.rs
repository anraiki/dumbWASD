use dumbwasd_core::core::arbiter::{Arbitration, ExclusiveArbiter};
use dumbwasd_core::core::latch::ToggleLatch;
use dumbwasd_core::core::profile::OutputTarget;
use std::sync::{Arc, Mutex};

use crate::repeat_runner::RepeatRunner;

#[derive(Default)]
struct RouterState {
    latch: ToggleLatch,
    arbiter: ExclusiveArbiter,
}

/// The output routing both runtime paths share: latch first, then
/// arbitration.
///
/// Only one path is ever live at a time — the frontend drives output during
/// normal monitoring, the event reader drives it under runtime remap — but
/// sharing one router means a mode switch cannot strand a binding latched
/// on or stuck holding the output.
#[derive(Clone, Default)]
pub struct SharedArbiter {
    inner: Arc<Mutex<RouterState>>,
}

impl SharedArbiter {
    /// Resolve a physical button edge into the output changes it implies.
    ///
    /// A latching binding turns two presses into one logical press and one
    /// logical release, and the intervening physical release into nothing
    /// at all; the arbiter downstream cannot tell the difference.
    pub fn resolve(
        &self,
        code: u16,
        pressed: bool,
        target: OutputTarget,
        exclusive: bool,
        toggle: bool,
    ) -> Result<Arbitration, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|_| "Output router state poisoned".to_string())?;

        let Some(logical) = state.latch.resolve(code, pressed, toggle) else {
            return Ok(Arbitration::default());
        };

        Ok(if logical {
            state.arbiter.press(code, target, exclusive)
        } else {
            state.arbiter.release(code)
        })
    }

    /// Release everything and drop every latch, for when monitoring stops.
    pub fn release_all(&self) -> Result<Arbitration, String> {
        let mut state = self
            .inner
            .lock()
            .map_err(|_| "Output router state poisoned".to_string())?;
        state.latch.clear();
        Ok(state.arbiter.release_all())
    }

    /// Keep auto-repeat in step with ownership: a binding that loses the
    /// output must stop repeating, and one that gains it starts.
    pub fn sync_repeats(&self, arbitration: &Arbitration, repeats: &RepeatRunner) {
        for code in &arbitration.suppressed {
            if let Err(e) = repeats.stop(*code) {
                tracing::warn!("stopping auto-repeat for code {code} failed: {e}");
            }
        }
        for (code, target) in &arbitration.activated {
            if let Err(e) = repeats.start(*code, target) {
                tracing::warn!("starting auto-repeat for code {code} failed: {e}");
            }
        }
    }
}
