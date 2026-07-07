mod bindings;
mod targets;

#[cfg(test)]
mod tests;

pub use bindings::{
    Behavior, Binding, BindingOutput, BindingPreset, Combo, MacroStep, PlaybackMode, Trigger,
};
pub use targets::{MacroBindMode, Mapping, OutputTarget};

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::core::config;

/// Top-level profile file structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub profile: ProfileMeta,
    #[serde(default)]
    pub devices: Vec<ProfileDevice>,
    /// Legacy flat mappings retained during schema migration.
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

/// A device curated into a profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileDevice {
    #[serde(default)]
    pub id: String,
    pub vendor_id: u16,
    pub product_id: u16,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub raw_name: String,
    /// Layout file name (without .toml) for visualization.
    #[serde(default)]
    pub layout: String,
    #[serde(default)]
    pub device_kind: String,
    #[serde(default, alias = "active_binding_profile")]
    pub active_binding_preset: String,
    #[serde(default, alias = "binding_profiles")]
    pub binding_presets: Vec<BindingPreset>,
}

impl ProfileDevice {
    /// Returns the "vendor_id:product_id" compound key.
    pub fn device_key(&self) -> String {
        format!("{}:{}", self.vendor_id, self.product_id)
    }

    /// Returns the stronger device identifier when available, otherwise falls back to VID:PID.
    pub fn identity_key(&self) -> String {
        if self.id.is_empty() {
            self.device_key()
        } else {
            self.id.clone()
        }
    }

    /// Returns the active binding preset for this device, if one exists.
    pub fn active_binding_preset(&self) -> Option<&BindingPreset> {
        if !self.active_binding_preset.is_empty() {
            return self
                .binding_presets
                .iter()
                .find(|preset| preset.id == self.active_binding_preset);
        }

        self.binding_presets.first()
    }
}

impl Profile {
    /// Load a profile by name from the profiles directory.
    pub fn load(name: &str) -> Result<Self> {
        let dir = config::profiles_dir()?;
        let path = dir.join(format!("{name}.toml"));

        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read profile: {}", path.display()))?;

        let profile: Profile = toml::from_str(&content)
            .with_context(|| format!("failed to parse profile: {}", path.display()))?;

        Ok(profile)
    }

    /// Save this profile to disk.
    pub fn save(&self, name: &str) -> Result<PathBuf> {
        let dir = config::profiles_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{name}.toml"));
        let content = toml::to_string_pretty(self).context("failed to serialize profile")?;
        std::fs::write(&path, &content)
            .with_context(|| format!("failed to write profile: {}", path.display()))?;
        Ok(path)
    }
}
