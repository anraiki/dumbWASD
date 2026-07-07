use serde::{Deserialize, Serialize};

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
    KeyDown {
        code: u16,
    },
    KeyUp {
        code: u16,
    },
    KeyTap {
        code: u16,
    },
    MouseButton {
        code: u16,
        pressed: bool,
    },
    Delay {
        ms: u32,
    },
    /// Rumble the source device for the given duration. Playback currently
    /// times the step; force-feedback output is not wired up yet.
    Rumble {
        ms: u32,
    },
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
