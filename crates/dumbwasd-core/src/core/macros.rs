use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::{config, profile::MacroStep};

/// How a macro fires once its trigger activates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MacroTriggerMode {
    HoldUntilRelease,
    #[default]
    ExecuteAtOnce,
}

/// A named macro stored in the library.
///
/// `steps` uses the same [`MacroStep`] wire format as
/// [`BindingOutput::Macro`](super::profile::BindingOutput), so a saved macro
/// can be assigned to a device button by copying its steps into a binding.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedMacro {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub trigger_mode: MacroTriggerMode,
    #[serde(default)]
    pub lead_in_ms: u32,
    #[serde(default = "default_iterations")]
    pub iterations: u32,
    #[serde(default)]
    pub pause_between_iterations_ms: u32,
    /// Delay inserted between consecutive input steps during playback.
    #[serde(default = "default_key_delay_ms")]
    pub key_delay_ms: u32,
    #[serde(default)]
    pub steps: Vec<MacroStep>,
}

/// The on-disk macro library.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MacroLibrary {
    #[serde(default)]
    pub macros: Vec<SavedMacro>,
}

impl MacroLibrary {
    /// Load the macro library, returning an empty library when the file does not exist yet.
    pub fn load() -> Result<Self> {
        let path = config::macros_file()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read macro library: {}", path.display()))?;

        let library: MacroLibrary = toml::from_str(&content)
            .with_context(|| format!("failed to parse macro library: {}", path.display()))?;

        Ok(library)
    }

    /// Save the macro library to disk.
    pub fn save(&self) -> Result<PathBuf> {
        let path = config::macros_file()?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = toml::to_string_pretty(self).context("failed to serialize macro library")?;
        std::fs::write(&path, &content)
            .with_context(|| format!("failed to write macro library: {}", path.display()))?;

        Ok(path)
    }

    /// Insert or replace a macro by id.
    pub fn upsert(&mut self, saved: SavedMacro) {
        match self.macros.iter_mut().find(|entry| entry.id == saved.id) {
            Some(slot) => *slot = saved,
            None => self.macros.push(saved),
        }
    }

    /// Remove a macro by id. Returns whether an entry was removed.
    pub fn remove(&mut self, id: &str) -> bool {
        let before = self.macros.len();
        self.macros.retain(|entry| entry.id != id);
        self.macros.len() != before
    }
}

fn default_iterations() -> u32 {
    1
}

fn default_key_delay_ms() -> u32 {
    10
}

#[cfg(test)]
mod tests {
    use super::{MacroLibrary, MacroTriggerMode, SavedMacro};
    use crate::core::profile::MacroStep;

    fn sample_macro() -> SavedMacro {
        SavedMacro {
            id: "burst-fire".to_string(),
            name: "Burst Fire".to_string(),
            trigger_mode: MacroTriggerMode::ExecuteAtOnce,
            lead_in_ms: 50,
            iterations: 3,
            pause_between_iterations_ms: 120,
            key_delay_ms: 10,
            steps: vec![
                MacroStep::KeyDown { code: 30 },
                MacroStep::Delay { ms: 40 },
                MacroStep::KeyUp { code: 30 },
                MacroStep::MouseButton {
                    code: 272,
                    pressed: true,
                },
                MacroStep::MouseButton {
                    code: 272,
                    pressed: false,
                },
            ],
        }
    }

    #[test]
    fn round_trips_through_toml() {
        let mut library = MacroLibrary::default();
        library.upsert(sample_macro());

        let content = toml::to_string_pretty(&library).expect("library should serialize");
        let parsed: MacroLibrary = toml::from_str(&content).expect("library should parse");

        assert_eq!(parsed.macros, library.macros);
    }

    #[test]
    fn parses_minimal_entry_with_defaults() {
        let content = r#"
[[macros]]
id = "hello"

[[macros.steps]]
type = "key_tap"
code = 35
"#;

        let library: MacroLibrary = toml::from_str(content).expect("minimal entry should parse");
        let entry = &library.macros[0];

        assert_eq!(entry.trigger_mode, MacroTriggerMode::ExecuteAtOnce);
        assert_eq!(entry.iterations, 1);
        assert_eq!(entry.lead_in_ms, 0);
        assert_eq!(entry.key_delay_ms, 10);
        assert_eq!(entry.steps, vec![MacroStep::KeyTap { code: 35 }]);
    }

    #[test]
    fn upsert_replaces_and_remove_deletes() {
        let mut library = MacroLibrary::default();
        library.upsert(sample_macro());

        let mut updated = sample_macro();
        updated.name = "Burst Fire v2".to_string();
        library.upsert(updated);

        assert_eq!(library.macros.len(), 1);
        assert_eq!(library.macros[0].name, "Burst Fire v2");

        assert!(library.remove("burst-fire"));
        assert!(!library.remove("burst-fire"));
        assert!(library.macros.is_empty());
    }
}
