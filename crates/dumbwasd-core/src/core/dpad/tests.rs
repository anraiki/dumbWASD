use crate::core::event::InputEvent;

use super::*;

fn press(code: u16) -> InputEvent {
    InputEvent::Button {
        code,
        pressed: true,
    }
}

fn release(code: u16) -> InputEvent {
    InputEvent::Button {
        code,
        pressed: false,
    }
}

fn gamepad_with_hat() -> DpadNormalizer {
    let mut normalizer = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: false,
        has_hat_axes: true,
        is_gamepad: true,
    });
    for axis in [ABS_HAT0X, ABS_HAT0Y] {
        normalizer.set_hat_range(axis, -1, 1);
    }
    normalizer
}

#[test]
fn canonical_codes_match_evdev_btn_dpad_numbering() {
    assert_eq!(DPAD_UP, 544);
    assert_eq!(DPAD_DOWN, 545);
    assert_eq!(DPAD_LEFT, 546);
    assert_eq!(DPAD_RIGHT, 547);
}

#[test]
fn every_canonical_code_round_trips_and_has_a_label() {
    for direction in [
        DpadDirection::Up,
        DpadDirection::Down,
        DpadDirection::Left,
        DpadDirection::Right,
    ] {
        let code = direction.code();
        assert!(is_dpad_code(code));
        assert_eq!(DpadDirection::from_code(code), Some(direction));
        assert_eq!(dpad_label(code), Some(direction.label()));
    }

    assert!(!is_dpad_code(304));
    assert_eq!(dpad_label(304), None);
}

// ── Shape 1: the pad already sends BTN_DPAD_* (the user's Xbox 360 pad) ──

#[test]
fn canonical_dpad_buttons_pass_through_untouched() {
    let normalizer = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: true,
        has_hat_axes: false,
        is_gamepad: true,
    });

    for code in [DPAD_UP, DPAD_DOWN, DPAD_LEFT, DPAD_RIGHT] {
        assert_eq!(normalizer.normalize_button(code), code);
    }
}

#[test]
fn unrelated_buttons_pass_through_untouched() {
    let normalizer = gamepad_with_hat();

    // BTN_SOUTH, BTN_START, a keyboard key.
    for code in [304, 315, 30] {
        assert_eq!(normalizer.normalize_button(code), code);
    }
}

// ── Shape 2: a hat ──

#[test]
fn digital_hat_press_and_release_become_dpad_buttons() {
    let mut normalizer = gamepad_with_hat();

    assert_eq!(normalizer.handle_hat(ABS_HAT0Y, -1), vec![press(DPAD_UP)]);
    assert_eq!(normalizer.handle_hat(ABS_HAT0Y, 0), vec![release(DPAD_UP)]);
}

#[test]
fn hat_x_maps_left_and_right() {
    let mut normalizer = gamepad_with_hat();

    assert_eq!(normalizer.handle_hat(ABS_HAT0X, -1), vec![press(DPAD_LEFT)]);
    normalizer.handle_hat(ABS_HAT0X, 0);
    assert_eq!(normalizer.handle_hat(ABS_HAT0X, 1), vec![press(DPAD_RIGHT)]);
}

#[test]
fn hat_direction_flip_releases_then_presses() {
    let mut normalizer = gamepad_with_hat();
    normalizer.handle_hat(ABS_HAT0X, -1);

    assert_eq!(
        normalizer.handle_hat(ABS_HAT0X, 1),
        vec![release(DPAD_LEFT), press(DPAD_RIGHT)]
    );
}

#[test]
fn repeated_hat_value_is_ignored() {
    let mut normalizer = gamepad_with_hat();
    normalizer.handle_hat(ABS_HAT0X, 1);

    assert_eq!(normalizer.handle_hat(ABS_HAT0X, 1), vec![]);
}

#[test]
fn analog_range_hat_is_thresholded_into_dpad_presses() {
    let mut normalizer = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: false,
        has_hat_axes: true,
        is_gamepad: true,
    });
    normalizer.set_hat_range(ABS_HAT0X, -255, 255);

    // Below engage: nothing yet.
    assert_eq!(normalizer.handle_hat(ABS_HAT0X, 100), vec![]);
    // Past engage.
    assert_eq!(
        normalizer.handle_hat(ABS_HAT0X, 255),
        vec![press(DPAD_RIGHT)]
    );
    // Inside the hysteresis band: still held.
    assert_eq!(normalizer.handle_hat(ABS_HAT0X, 110), vec![]);
    // Below release.
    assert_eq!(
        normalizer.handle_hat(ABS_HAT0X, 20),
        vec![release(DPAD_RIGHT)]
    );
}

#[test]
fn hat_with_no_declared_range_is_assumed_digital() {
    let mut normalizer = DpadNormalizer::new(DpadCapabilities::default());

    assert_eq!(normalizer.handle_hat(ABS_HAT0Y, 1), vec![press(DPAD_DOWN)]);
}

#[test]
fn non_hat_axes_are_left_alone() {
    let mut normalizer = gamepad_with_hat();

    // ABS_X and ABS_RY belong to the thumbsticks.
    assert_eq!(normalizer.handle_hat(0x00, 32767), vec![]);
    assert_eq!(normalizer.handle_hat(0x04, -32768), vec![]);
    assert!(!normalizer.owns_axis(0x00));
    assert!(normalizer.owns_axis(ABS_HAT0X));
}

#[test]
fn release_all_drops_a_held_hat_direction() {
    let mut normalizer = gamepad_with_hat();
    normalizer.handle_hat(ABS_HAT0X, -1);
    normalizer.handle_hat(ABS_HAT0Y, -1);

    let mut released = normalizer.release_all();
    released.sort_by_key(|event| match event {
        InputEvent::Button { code, .. } => *code,
        _ => 0,
    });

    assert_eq!(released, vec![release(DPAD_UP), release(DPAD_LEFT)]);
    assert_eq!(normalizer.release_all(), vec![]);
}

// ── Shape 3: BTN_TRIGGER_HAPPY1..4 ──

#[test]
fn trigger_happy_becomes_dpad_on_a_pad_with_no_other_dpad() {
    let normalizer = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: false,
        has_hat_axes: false,
        is_gamepad: true,
    });

    assert_eq!(normalizer.normalize_button(0x2c0), DPAD_LEFT);
    assert_eq!(normalizer.normalize_button(0x2c1), DPAD_RIGHT);
    assert_eq!(normalizer.normalize_button(0x2c2), DPAD_UP);
    assert_eq!(normalizer.normalize_button(0x2c3), DPAD_DOWN);
}

#[test]
fn trigger_happy_is_left_alone_on_a_pad_that_already_has_a_dpad() {
    let with_buttons = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: true,
        has_hat_axes: false,
        is_gamepad: true,
    });
    let with_hat = gamepad_with_hat();

    for normalizer in [with_buttons, with_hat] {
        assert_eq!(normalizer.normalize_button(0x2c0), 0x2c0);
    }
}

#[test]
fn trigger_happy_is_left_alone_on_non_gamepads() {
    // A mouse with many side buttons uses this block for real buttons —
    // claiming it as a d-pad would corrupt those.
    let mouse = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: false,
        has_hat_axes: false,
        is_gamepad: false,
    });

    for code in 0x2c0..=0x2c3 {
        assert_eq!(mouse.normalize_button(code), code);
    }
}

#[test]
fn trigger_happy_outside_the_first_four_is_never_claimed() {
    let normalizer = DpadNormalizer::new(DpadCapabilities {
        has_dpad_buttons: false,
        has_hat_axes: false,
        is_gamepad: true,
    });

    assert_eq!(normalizer.normalize_button(0x2c4), 0x2c4);
    assert_eq!(normalizer.normalize_button(0x2cf), 0x2cf);
}
