use super::super::Mapper;
use super::single_binding_profile;
use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{BindingOutput, Mapping, OutputTarget, Profile, ProfileMeta, Trigger};
use tokio::time::{Duration, Instant};

#[test]
fn resolves_legacy_mapping() {
    let profile = Profile {
        profile: ProfileMeta {
            name: "Default".to_string(),
            device_name: None,
        },
        devices: Vec::new(),
        mappings: vec![Mapping {
            device: None,
            from: 30,
            to: OutputTarget::Key { code: 37 },
        }],
    };

    let mut mapper = Mapper::new();
    let actions = mapper.handle_event(
        &InputEvent::Button {
            code: 30,
            pressed: true,
        },
        &profile,
        Instant::now(),
    );

    assert_eq!(
        actions,
        vec![OutputAction::Key {
            code: 37,
            pressed: true,
        }]
    );
}

#[test]
fn resolves_press_start_immediately() {
    let profile = single_binding_profile(Trigger::PressStart, BindingOutput::Key { code: 37 });
    let mut mapper = Mapper::new();

    let actions = mapper.handle_event(
        &InputEvent::Button {
            code: 30,
            pressed: true,
        },
        &profile,
        Instant::now(),
    );

    assert_eq!(
        actions,
        vec![OutputAction::Key {
            code: 37,
            pressed: true,
        }]
    );
}

#[test]
fn resolves_single_press_after_timeout() {
    let profile = single_binding_profile(
        Trigger::SinglePress {
            multi_press_timeout_ms: 250,
        },
        BindingOutput::KeyTap { code: 37 },
    );
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
    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: false,
            },
            &profile,
            start + Duration::from_millis(10),
        )
        .is_empty());

    let actions = mapper.flush_due(&profile, start + Duration::from_millis(260));

    assert_eq!(
        actions,
        vec![
            OutputAction::Key {
                code: 37,
                pressed: true,
            },
            OutputAction::Key {
                code: 37,
                pressed: false,
            },
        ]
    );
}

#[test]
fn resolves_double_press_after_second_timeout() {
    let profile = single_binding_profile(
        Trigger::DoublePress {
            multi_press_timeout_ms: 200,
        },
        BindingOutput::KeyTap { code: 37 },
    );
    let mut mapper = Mapper::new();
    let start = Instant::now();

    for (offset, pressed) in [(0, true), (10, false), (60, true), (70, false)] {
        assert!(mapper
            .handle_event(
                &InputEvent::Button { code: 30, pressed },
                &profile,
                start + Duration::from_millis(offset),
            )
            .is_empty());
    }

    let actions = mapper.flush_due(&profile, start + Duration::from_millis(280));

    assert_eq!(
        actions,
        vec![
            OutputAction::Key {
                code: 37,
                pressed: true,
            },
            OutputAction::Key {
                code: 37,
                pressed: false,
            },
        ]
    );
}

#[test]
fn resolves_long_press_when_threshold_expires() {
    let profile = single_binding_profile(
        Trigger::LongPress { long_press_ms: 300 },
        BindingOutput::KeyTap { code: 37 },
    );
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

    let actions = mapper.flush_due(&profile, start + Duration::from_millis(320));

    assert_eq!(
        actions,
        vec![
            OutputAction::Key {
                code: 37,
                pressed: true,
            },
            OutputAction::Key {
                code: 37,
                pressed: false,
            },
        ]
    );
}
