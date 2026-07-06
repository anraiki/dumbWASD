use super::super::Mapper;
use super::single_binding_profile_with_playback;
use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{BindingOutput, PlaybackMode, Trigger};
use tokio::time::{Duration, Instant};

#[test]
fn resolves_while_held_as_press_then_release() {
    let profile = single_binding_profile_with_playback(
        Trigger::PressStart,
        BindingOutput::Key { code: 37 },
        PlaybackMode::WhileHeld,
    );
    let mut mapper = Mapper::new();
    let start = Instant::now();

    assert_eq!(
        mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start,
        ),
        vec![OutputAction::Key {
            code: 37,
            pressed: true,
        }]
    );

    assert_eq!(
        mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: false,
            },
            &profile,
            start + Duration::from_millis(10),
        ),
        vec![OutputAction::Key {
            code: 37,
            pressed: false,
        }]
    );
}

#[test]
fn resolves_toggle_as_press_then_second_press_release() {
    let profile = single_binding_profile_with_playback(
        Trigger::PressStart,
        BindingOutput::Key { code: 37 },
        PlaybackMode::Toggle,
    );
    let mut mapper = Mapper::new();
    let start = Instant::now();

    assert_eq!(
        mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start,
        ),
        vec![OutputAction::Key {
            code: 37,
            pressed: true,
        }]
    );

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

    assert_eq!(
        mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start + Duration::from_millis(20),
        ),
        vec![OutputAction::Key {
            code: 37,
            pressed: false,
        }]
    );
}

#[test]
fn resolves_repeat_while_held_until_release() {
    let profile = single_binding_profile_with_playback(
        Trigger::PressStart,
        BindingOutput::KeyTap { code: 37 },
        PlaybackMode::RepeatWhileHeld { interval_ms: 30 },
    );
    let mut mapper = Mapper::new();
    let start = Instant::now();

    assert_eq!(
        mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start,
        ),
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

    assert_eq!(
        mapper.flush_due(&profile, start + Duration::from_millis(35)),
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

    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: false,
            },
            &profile,
            start + Duration::from_millis(40),
        )
        .is_empty());
    assert!(mapper
        .flush_due(&profile, start + Duration::from_millis(80))
        .is_empty());
}

#[test]
fn resolves_toggle_repeat_until_next_trigger() {
    let profile = single_binding_profile_with_playback(
        Trigger::PressStart,
        BindingOutput::KeyTap { code: 37 },
        PlaybackMode::ToggleRepeat { interval_ms: 30 },
    );
    let mut mapper = Mapper::new();
    let start = Instant::now();

    assert_eq!(
        mapper.handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start,
        ),
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
    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: false,
            },
            &profile,
            start + Duration::from_millis(5),
        )
        .is_empty());

    assert_eq!(
        mapper.flush_due(&profile, start + Duration::from_millis(35)),
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

    assert!(mapper
        .handle_event(
            &InputEvent::Button {
                code: 30,
                pressed: true,
            },
            &profile,
            start + Duration::from_millis(40),
        )
        .is_empty());
    assert!(mapper
        .flush_due(&profile, start + Duration::from_millis(80))
        .is_empty());
}
