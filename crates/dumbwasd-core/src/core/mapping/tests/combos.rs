use super::super::Mapper;
use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{
    Behavior, BindingOutput, BindingPreset, Combo, PlaybackMode, Profile, ProfileDevice,
    ProfileMeta,
};
use tokio::time::{Duration, Instant};

#[test]
fn resolves_combo_when_inputs_pressed_within_window() {
    let profile = Profile {
        profile: ProfileMeta {
            name: "Default".to_string(),
            device_name: None,
        },
        devices: vec![ProfileDevice {
            id: "keyboard".to_string(),
            vendor_id: 1,
            product_id: 2,
            name: "Keyboard".to_string(),
            raw_name: String::new(),
            layout: String::new(),
            device_kind: String::new(),
            active_binding_preset: "default".to_string(),
            binding_presets: vec![BindingPreset {
                id: "default".to_string(),
                name: "Default".to_string(),
                bindings: Vec::new(),
                combos: vec![Combo {
                    id: "combo-a-b".to_string(),
                    enabled: true,
                    inputs: vec![30, 48],
                    combo_window_ms: 60,
                    behavior: Behavior::Override,
                    output: BindingOutput::KeyTap { code: 46 },
                    playback: PlaybackMode::Once,
                }],
            }],
        }],
        mappings: Vec::new(),
    };
    let mut mapper = Mapper::new();
    let start = Instant::now();

    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start,
        )
        .is_empty());

    let actions = mapper.handle_event(
        &InputEvent::Button {
            code: 48,
            pressed: true,
        },
        &profile,
        start + Duration::from_millis(20),
    );

    assert_eq!(
        actions,
        vec![
            OutputAction::Key {
                code: 46,
                pressed: true,
            },
            OutputAction::Key {
                code: 46,
                pressed: false,
            },
        ]
    );

    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: false,
            },
            &profile,
            start + Duration::from_millis(30),
        )
        .is_empty());
    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 48,
                pressed: false,
            },
            &profile,
            start + Duration::from_millis(40),
        )
        .is_empty());
}
