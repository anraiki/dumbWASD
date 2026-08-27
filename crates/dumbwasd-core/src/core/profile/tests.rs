use super::{
    Behavior, BindingOutput, MacroBindMode, OutputTarget, PlaybackMode, Profile, Trigger,
    MIN_REPEAT_MS,
};
use crate::core::event::OutputAction;

#[test]
fn parses_macro_mapping_and_defaults_to_toggle_mode() {
    let content = r#"
[profile]
name = "Default"

[[mappings]]
from = 305

[mappings.to]
type = "macro"

[mappings.to.definition]
id = "burst-combo"

[[mappings]]
from = 306

[mappings.to]
type = "macro"
mode = "hold"

[mappings.to.definition]
id = "spin-attack"
"#;

    let profile: Profile = toml::from_str(content).expect("macro mappings should parse");

    assert!(matches!(
        &profile.mappings[0].to,
        OutputTarget::Macro { mode: MacroBindMode::Toggle, definition } if definition.id == "burst-combo"
    ));
    assert!(matches!(
        &profile.mappings[1].to,
        OutputTarget::Macro { mode: MacroBindMode::Hold, definition } if definition.id == "spin-attack"
    ));
    // Macro targets never expand to direct actions - playback is host-driven.
    assert!(profile.mappings[0].to.actions(true).is_empty());
    assert!(profile.mappings[0].to.actions(false).is_empty());
}

#[test]
fn round_trips_macro_mapping_with_embedded_definition() {
    use super::MacroStep;
    use crate::core::macros::{MacroTriggerMode, SavedMacro};
    use crate::core::profile::{Mapping, ProfileMeta};

    let profile = Profile {
        profile: ProfileMeta {
            name: "Default".to_string(),
            device_name: None,
        },
        devices: Vec::new(),
        mappings: vec![Mapping {
            device: None,
            from: 305,
            to: OutputTarget::Macro {
                mode: MacroBindMode::Hold,
                definition: SavedMacro {
                    id: "burst-combo".to_string(),
                    name: "Burst Combo".to_string(),
                    trigger_mode: MacroTriggerMode::HoldUntilRelease,
                    lead_in_ms: 50,
                    iterations: 3,
                    pause_between_iterations_ms: 120,
                    key_delay_ms: 10,
                    steps: vec![
                        MacroStep::KeyDown { code: 17 },
                        MacroStep::Delay { ms: 40 },
                        MacroStep::KeyUp { code: 17 },
                    ],
                },
            },
            exclusive: false,
            toggle: false,
        }],
    };

    let content = toml::to_string_pretty(&profile).expect("profile should serialize");
    let parsed: Profile = toml::from_str(&content).expect("profile should parse back");

    match &parsed.mappings[0].to {
        OutputTarget::Macro { mode, definition } => {
            assert_eq!(*mode, MacroBindMode::Hold);
            assert_eq!(definition.id, "burst-combo");
            assert_eq!(definition.name, "Burst Combo");
            assert_eq!(definition.iterations, 3);
            assert_eq!(definition.steps.len(), 3);
        }
        other => panic!("expected embedded macro mapping, got {other:?}"),
    }
}

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
    assert!(profile.devices[0].mappings_enabled);
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
fn parses_disabled_device_mappings() {
    let content = r#"
[profile]
name = "Default"

[[devices]]
id = "logitech-g602"
vendor_id = 1133
product_id = 16428
name = "Logitech G602"
mappings_enabled = false
"#;

    let profile: Profile = toml::from_str(content).expect("disabled mappings should parse");
    assert!(!profile.devices[0].mappings_enabled);
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

/// A shortcut is held by default: modifiers and key go down on press and
/// come back up on release, so the chord tracks the button.
#[test]
fn shortcut_is_held_for_as_long_as_the_button_is() {
    let target = OutputTarget::Shortcut {
        modifiers: vec![56],
        key: 104,
        repeat_ms: None,
    };

    assert_eq!(
        target.actions(true),
        vec![
            OutputAction::Key {
                code: 56,
                pressed: true
            },
            OutputAction::Key {
                code: 104,
                pressed: true
            },
        ]
    );
    assert_eq!(
        target.actions(false),
        vec![
            OutputAction::Key {
                code: 104,
                pressed: false
            },
            OutputAction::Key {
                code: 56,
                pressed: false
            },
        ]
    );
    assert_eq!(target.repeat_interval(), None);
}

/// Modifiers must outlive the key on release, or the chord briefly decays
/// into a bare keypress the host would act on.
#[test]
fn multi_modifier_shortcut_releases_in_reverse_order() {
    let target = OutputTarget::Shortcut {
        modifiers: vec![29, 42],
        key: 37,
        repeat_ms: None,
    };

    assert_eq!(
        target.actions(true),
        vec![
            OutputAction::Key {
                code: 29,
                pressed: true
            },
            OutputAction::Key {
                code: 42,
                pressed: true
            },
            OutputAction::Key {
                code: 37,
                pressed: true
            },
        ]
    );
    assert_eq!(
        target.actions(false),
        vec![
            OutputAction::Key {
                code: 37,
                pressed: false
            },
            OutputAction::Key {
                code: 42,
                pressed: false
            },
            OutputAction::Key {
                code: 29,
                pressed: false
            },
        ]
    );
}

/// With auto-repeat on, the chord is tapped rather than held, so nothing is
/// left down and the release edge has no work to do.
#[test]
fn auto_repeat_shortcut_taps_instead_of_holding() {
    let target = OutputTarget::Shortcut {
        modifiers: vec![56],
        key: 104,
        repeat_ms: Some(120),
    };

    let tap = vec![
        OutputAction::Key {
            code: 56,
            pressed: true,
        },
        OutputAction::Key {
            code: 104,
            pressed: true,
        },
        OutputAction::Key {
            code: 104,
            pressed: false,
        },
        OutputAction::Key {
            code: 56,
            pressed: false,
        },
    ];

    assert_eq!(target.actions(true), tap);
    assert_eq!(target.actions(false), vec![]);
    assert_eq!(target.repeat_actions(), tap);
    assert_eq!(
        target.repeat_interval(),
        Some(std::time::Duration::from_millis(120))
    );
}

/// Anything below the floor is raised to it — each tick emits a whole
/// chord, so a very short interval floods the receiving application.
#[test]
fn repeat_interval_below_the_floor_is_raised_to_it() {
    let target = OutputTarget::Shortcut {
        modifiers: vec![56],
        key: 104,
        repeat_ms: Some(5),
    };

    assert_eq!(
        target.repeat_interval(),
        Some(std::time::Duration::from_millis(u64::from(MIN_REPEAT_MS)))
    );
}

/// A zero interval would busy-loop the repeater, so it counts as "off".
#[test]
fn zero_repeat_interval_is_treated_as_no_repeat() {
    let target = OutputTarget::Shortcut {
        modifiers: vec![56],
        key: 104,
        repeat_ms: Some(0),
    };

    assert_eq!(target.repeat_interval(), None);
    assert_eq!(target.repeat_actions(), vec![]);
}

/// By contrast, a plain key follows the button for as long as it is held.
#[test]
fn plain_key_tracks_the_button_while_held() {
    let target = OutputTarget::Key { code: 30 };

    assert_eq!(
        target.actions(true),
        vec![OutputAction::Key {
            code: 30,
            pressed: true
        }]
    );
    assert_eq!(
        target.actions(false),
        vec![OutputAction::Key {
            code: 30,
            pressed: false
        }]
    );
    assert_eq!(target.repeat_interval(), None);
}

/// Profiles saved before auto-repeat existed have no `repeat_ms` key.
#[test]
fn shortcut_without_repeat_ms_deserializes_as_held() {
    let content = r#"
[profile]
name = "Default"

[[mappings]]
from = 304

[mappings.to]
type = "shortcut"
modifiers = [56]
key = 104
"#;

    let profile: Profile = toml::from_str(content).expect("profile parses");
    let target = &profile.mappings[0].to;

    assert_eq!(target.repeat_interval(), None);
    assert_eq!(
        target.actions(false),
        vec![
            OutputAction::Key {
                code: 104,
                pressed: false
            },
            OutputAction::Key {
                code: 56,
                pressed: false
            },
        ]
    );
}
