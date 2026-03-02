use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::config;

/// Top-level profile file structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub profile: ProfileMeta,
    #[serde(default)]
    pub mappings: Vec<Mapping>,
}

/// Profile metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileMeta {
    pub name: String,
    #[serde(default)]
    pub device_name: Option<String>,
}

/// A single input-to-output mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mapping {
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
}

impl Profile {
    /// Load a profile by name from the profiles directory.
    pub fn load(name: &str) -> Result<Self> {
        let dir = config::profiles_dir()?;
        let path = dir.join(format!("{name}.toml"));

        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read profile: {}", path.display()))?;

        let profile: Profile =
            toml::from_str(&content).with_context(|| format!("failed to parse profile: {}", path.display()))?;

        Ok(profile)
    }
}
