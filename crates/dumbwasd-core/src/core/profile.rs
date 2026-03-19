use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::{config, event::OutputAction};

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

/// A named, switchable set of bindings for one device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindingPreset {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub bindings: Vec<Binding>,
    #[serde(default)]
    pub combos: Vec<Combo>,
}

/// A single-input binding rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Binding {
    #[serde(default)]
    pub id: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    pub from: u16,
    pub trigger: Trigger,
    pub behavior: Behavior,
    pub output: BindingOutput,
    #[serde(default)]
    pub playback: PlaybackMode,
}

/// A multi-input binding rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Combo {
    #[serde(default)]
    pub id: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    pub inputs: Vec<u16>,
    pub combo_window_ms: u32,
    pub behavior: Behavior,
    pub output: BindingOutput,
    #[serde(default)]
    pub playback: PlaybackMode,
}

/// When a single-input binding should activate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Trigger {
    PressStart,
    PressRelease,
    SinglePress {
        #[serde(default = "default_multi_press_timeout_ms")]
        multi_press_timeout_ms: u32,
    },
    LongPress {
        #[serde(default = "default_long_press_ms")]
        long_press_ms: u32,
    },
    DoublePress {
        #[serde(default = "default_multi_press_timeout_ms")]
        multi_press_timeout_ms: u32,
    },
    TriplePress {
        #[serde(default = "default_multi_press_timeout_ms")]
        multi_press_timeout_ms: u32,
    },
}

/// What should happen to the source input when a binding wins.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Behavior {
    Passthrough,
    AppendBefore,
    AppendAfter,
    Override,
    Disabled,
}

/// How the binding output should run once triggered.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlaybackMode {
    #[default]
    Once,
    WhileHeld,
    RepeatWhileHeld {
        interval_ms: u32,
    },
    Toggle,
    ToggleRepeat {
        interval_ms: u32,
    },
}

/// The output program emitted by a binding or combo.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BindingOutput {
    Key {
        code: u16,
    },
    KeyTap {
        code: u16,
    },
    MouseButton {
        code: u16,
    },
    Text {
        value: String,
    },
    Macro {
        #[serde(default)]
        steps: Vec<MacroStep>,
    },
}

/// Steps inside a macro output.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MacroStep {
    KeyDown { code: u16 },
    KeyUp { code: u16 },
    KeyTap { code: u16 },
    MouseButton { code: u16, pressed: bool },
    Delay { ms: u32 },
}

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
}

impl OutputTarget {
    pub fn actions(&self, pressed: bool) -> Vec<OutputAction> {
        match self {
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

fn default_enabled() -> bool {
    true
}

fn default_long_press_ms() -> u32 {
    300
}

fn default_multi_press_timeout_ms() -> u32 {
    250
}

#[cfg(test)]
mod tests {
    use super::{Behavior, BindingOutput, OutputTarget, PlaybackMode, Profile, Trigger};
    use crate::core::event::OutputAction;

    #[test]
    fn parses_legacy_profile_shape() {
        let content = r#"
[profile]
name = "Default"
device_name = "Azeron Cyborg"

[[devices]]
vendor_id = 5840
product_id = 4284
name = "Azeron Keypad"
layout = ""

[[mappings]]
from = 304

[mappings.to]
type = "key"
code = 33
"#;

        let profile: Profile = toml::from_str(content).expect("legacy profile should parse");

        assert_eq!(profile.devices.len(), 1);
        assert_eq!(profile.mappings.len(), 1);
        assert!(profile.devices[0].binding_presets.is_empty());
        assert!(profile.devices[0].active_binding_preset().is_none());
        assert!(profile.devices[0].id.is_empty());
    }

    #[test]
    fn parses_new_binding_preset_shape() {
        let content = r#"
[profile]
name = "Default"

[[devices]]
id = "logitech-g602"
vendor_id = 1133
product_id = 16428
name = "Logitech G602"
active_binding_preset = "fps"

[[devices.binding_presets]]
id = "fps"
name = "FPS"

[[devices.binding_presets.bindings]]
id = "single-a"
from = 30
trigger = { type = "single_press", multi_press_timeout_ms = 275 }
behavior = { type = "override" }
output = { type = "text", value = "ABC" }
playback = { type = "once" }

[[devices.binding_presets.combos]]
id = "combo-a-b"
inputs = [30, 48]
combo_window_ms = 60
behavior = { type = "override" }
output = { type = "key_tap", code = 46 }
playback = { type = "toggle_repeat", interval_ms = 35 }
"#;

        let profile: Profile = toml::from_str(content).expect("new profile should parse");
        let device = &profile.devices[0];
        let binding_preset = device
            .active_binding_preset()
            .expect("active binding preset should resolve");

        assert_eq!(device.identity_key(), "logitech-g602");
        assert_eq!(binding_preset.id, "fps");
        assert_eq!(binding_preset.bindings.len(), 1);
        assert_eq!(binding_preset.combos.len(), 1);

        assert!(matches!(
            binding_preset.bindings[0].trigger,
            Trigger::SinglePress {
                multi_press_timeout_ms: 275
            }
        ));
        assert_eq!(binding_preset.bindings[0].behavior, Behavior::Override);
        assert_eq!(
            binding_preset.bindings[0].output,
            BindingOutput::Text {
                value: "ABC".to_string()
            }
        );
        assert_eq!(binding_preset.bindings[0].playback, PlaybackMode::Once);
        assert_eq!(
            binding_preset.combos[0].playback,
            PlaybackMode::ToggleRepeat { interval_ms: 35 }
        );
    }

    #[test]
    fn parses_binding_profile_alias_fields() {
        let content = r#"
[profile]
name = "Default"

[[devices]]
id = "logitech-g602"
vendor_id = 1133
product_id = 16428
name = "Logitech G602"
active_binding_profile = "fps"

[[devices.binding_profiles]]
id = "fps"
name = "FPS"
"#;

        let profile: Profile = toml::from_str(content).expect("legacy preset aliases should parse");
        let device = &profile.devices[0];

        assert_eq!(device.active_binding_preset, "fps");
        assert_eq!(device.binding_presets.len(), 1);
        assert_eq!(
            device
                .active_binding_preset()
                .expect("active binding preset should resolve")
                .id,
            "fps"
        );
    }

    #[test]
    fn shortcut_output_target_emits_tap_sequence_on_press() {
        let actions = OutputTarget::Shortcut {
            modifiers: vec![29],
            key: 38,
        }
        .actions(true);

        assert_eq!(
            actions,
            vec![
                OutputAction::Key {
                    code: 29,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 38,
                    pressed: true,
                },
                OutputAction::Key {
                    code: 38,
                    pressed: false,
                },
                OutputAction::Key {
                    code: 29,
                    pressed: false,
                },
            ]
        );
    }
}
