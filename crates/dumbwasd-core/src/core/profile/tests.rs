use super::{Behavior, BindingOutput, MacroBindMode, OutputTarget, PlaybackMode, Profile, Trigger};
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
