use super::super::Mapper;
use super::single_binding_profile;
use crate::core::event::{InputEvent, OutputAction};
use crate::core::profile::{BindingOutput, MacroStep, Trigger};
use tokio::time::{Duration, Instant};

#[test]
fn resolves_text_output_immediately() {
    let profile = single_binding_profile(
        Trigger::PressStart,
        BindingOutput::Text {
            value: "Ab".to_string(),
        },
    );
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
        vec![
            OutputAction::Key {
                code: 42,
                pressed: true,
            },
            OutputAction::Key {
                code: 30,
                pressed: true,
            },
            OutputAction::Key {
                code: 30,
                pressed: false,
            },
            OutputAction::Key {
                code: 42,
                pressed: false,
            },
            OutputAction::Key {
                code: 48,
                pressed: true,
            },
            OutputAction::Key {
                code: 48,
                pressed: false,
            },
        ]
    );
}

#[test]
fn resolves_macro_output_with_delays() {
    let profile = single_binding_profile(
        Trigger::PressStart,
        BindingOutput::Macro {
            steps: vec![
                MacroStep::KeyTap { code: 30 },
                MacroStep::Delay { ms: 40 },
                MacroStep::KeyTap { code: 48 },
            ],
        },
    );
    let mut mapper = Mapper::new();
    let start = Instant::now();

    let immediate = mapper.handle_event(
        &InputEvent::Button {
            code: 30,
            pressed: true,
        },
        &profile,
        start,
    );

    assert_eq!(
        immediate,
        vec![
            OutputAction::Key {
                code: 30,
                pressed: true,
            },
            OutputAction::Key {
                code: 30,
                pressed: false,
            },
        ]
    );

    assert!(mapper
        .flush_due(&profile, start + Duration::from_millis(20))
        .is_empty());
    assert_eq!(
        mapper.flush_due(&profile, start + Duration::from_millis(50)),
        vec![
            OutputAction::Key {
                code: 48,
                pressed: true,
            },
            OutputAction::Key {
                code: 48,
                pressed: false,
            },
        ]
    );
}
