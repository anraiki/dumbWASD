use crate::core::event::InputEvent;

use super::*;

const I16_MAX: i32 = i16::MAX as i32;
const I16_MIN: i32 = i16::MIN as i32;

fn tracker() -> StickTracker {
    let mut tracker = StickTracker::new(StickThresholds::default());
    for axis in [ABS_X, ABS_Y, ABS_RX, ABS_RY] {
        tracker.set_axis_range(axis, I16_MIN, I16_MAX, 128);
    }
    tracker
}

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

#[test]
fn codes_are_unique_and_above_evdev_key_max() {
    let mut seen = Vec::new();
    for stick in [Stick::Left, Stick::Right] {
        for direction in [
            StickDirection::Up,
            StickDirection::Down,
            StickDirection::Left,
            StickDirection::Right,
        ] {
            let code = stick_code(stick, direction);
            assert!(code > 0x2FF, "code {code:#x} collides with evdev key space");
            assert!(is_stick_code(code));
            assert_eq!(stick_from_code(code), Some((stick, direction)));
            seen.push(code);
        }
    }

    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), STICK_CODE_COUNT as usize);
}

#[test]
fn real_evdev_codes_are_not_mistaken_for_stick_codes() {
    // BTN_SOUTH, BTN_DPAD_UP and the top of the KEY range.
    for code in [304u16, 544, 0x2FF] {
        assert!(!is_stick_code(code));
        assert_eq!(stick_from_code(code), None);
    }
}

#[test]
fn pushing_an_axis_past_engage_presses_that_direction() {
    let mut tracker = tracker();
    let events = tracker.handle_axis(ABS_X, I16_MAX);

    assert_eq!(
        events,
        vec![press(stick_code(Stick::Left, StickDirection::Right))]
    );
}

#[test]
fn negative_y_is_up() {
    let mut tracker = tracker();
    let events = tracker.handle_axis(ABS_Y, I16_MIN);

    assert_eq!(
        events,
        vec![press(stick_code(Stick::Left, StickDirection::Up))]
    );
}

#[test]
fn right_stick_axes_drive_right_stick_codes() {
    let mut tracker = tracker();

    assert_eq!(
        tracker.handle_axis(ABS_RX, I16_MIN),
        vec![press(stick_code(Stick::Right, StickDirection::Left))]
    );
    assert_eq!(
        tracker.handle_axis(ABS_RY, I16_MAX),
        vec![press(stick_code(Stick::Right, StickDirection::Down))]
    );
}

#[test]
fn returning_to_centre_releases_the_direction() {
    let mut tracker = tracker();
    tracker.handle_axis(ABS_X, I16_MAX);

    let events = tracker.handle_axis(ABS_X, 0);
    assert_eq!(
        events,
        vec![release(stick_code(Stick::Left, StickDirection::Right))]
    );
    assert!(!tracker.has_engaged());
}

#[test]
fn hysteresis_band_produces_no_chatter() {
    let mut tracker = tracker();
    tracker.handle_axis(ABS_X, I16_MAX);

    // Between release (0.35) and engage (0.5): still held, no new events.
    let midband = (I16_MAX as f32 * 0.42) as i32;
    assert_eq!(tracker.handle_axis(ABS_X, midband), vec![]);
    assert!(tracker.has_engaged());

    // Below release: now it lets go.
    let below = (I16_MAX as f32 * 0.20) as i32;
    assert_eq!(
        tracker.handle_axis(ABS_X, below),
        vec![release(stick_code(Stick::Left, StickDirection::Right))]
    );
}

#[test]
fn approaching_from_rest_needs_full_engage_threshold() {
    let mut tracker = tracker();

    // In the hysteresis band but never engaged — must stay silent.
    let midband = (I16_MAX as f32 * 0.42) as i32;
    assert_eq!(tracker.handle_axis(ABS_X, midband), vec![]);
    assert!(!tracker.has_engaged());
}

#[test]
fn flicking_across_centre_releases_before_pressing_the_opposite() {
    let mut tracker = tracker();
    tracker.handle_axis(ABS_X, I16_MAX);

    let events = tracker.handle_axis(ABS_X, I16_MIN);
    assert_eq!(
        events,
        vec![
            release(stick_code(Stick::Left, StickDirection::Right)),
            press(stick_code(Stick::Left, StickDirection::Left)),
        ]
    );
}

#[test]
fn diagonal_holds_both_axes() {
    let mut tracker = tracker();
    tracker.handle_axis(ABS_X, I16_MAX);
    tracker.handle_axis(ABS_Y, I16_MIN);

    let mut released = tracker.release_all();
    released.sort_by_key(|event| match event {
        InputEvent::Button { code, .. } => *code,
        _ => 0,
    });

    assert_eq!(
        released,
        vec![
            release(stick_code(Stick::Left, StickDirection::Up)),
            release(stick_code(Stick::Left, StickDirection::Right)),
        ]
    );
    assert!(!tracker.has_engaged());
}

#[test]
fn device_deadzone_is_treated_as_centre() {
    let mut tracker = tracker();
    tracker.handle_axis(ABS_X, I16_MAX);

    // A resting stick reporting -1 sits inside flat=128 and must read as 0.
    assert_eq!(
        tracker.handle_axis(ABS_X, -1),
        vec![release(stick_code(Stick::Left, StickDirection::Right))]
    );
}

#[test]
fn unsigned_axis_ranges_are_normalized_around_their_midpoint() {
    let mut tracker = StickTracker::new(StickThresholds::default());
    tracker.set_axis_range(ABS_X, 0, 255, 0);

    // Midpoint of 0..255 is ~127; resting there must not engage anything.
    assert_eq!(tracker.handle_axis(ABS_X, 127), vec![]);
    assert_eq!(
        tracker.handle_axis(ABS_X, 255),
        vec![press(stick_code(Stick::Left, StickDirection::Right))]
    );
}

#[test]
fn non_stick_axes_are_ignored() {
    let mut tracker = tracker();
    // ABS_Z (triggers) and ABS_HAT0X (d-pad) are handled elsewhere.
    assert_eq!(tracker.handle_axis(0x02, I16_MAX), vec![]);
    assert_eq!(tracker.handle_axis(0x10, 1), vec![]);
}

#[test]
fn labels_exist_for_every_reserved_code() {
    for offset in 0..STICK_CODE_COUNT {
        assert!(stick_label(STICK_CODE_BASE + offset).is_some());
    }
    assert_eq!(stick_label(304), None);
}
