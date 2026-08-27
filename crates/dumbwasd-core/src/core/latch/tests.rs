use super::*;

const BTN: u16 = 304;
const OTHER: u16 = 305;

#[test]
fn a_non_latching_binding_passes_both_edges_through() {
    let mut latch = ToggleLatch::new();

    assert_eq!(latch.resolve(BTN, true, false), Some(true));
    assert_eq!(latch.resolve(BTN, false, false), Some(false));
    assert!(!latch.is_engaged(BTN));
}

#[test]
fn first_press_engages_and_the_release_is_swallowed() {
    let mut latch = ToggleLatch::new();

    assert_eq!(latch.resolve(BTN, true, true), Some(true));
    assert_eq!(latch.resolve(BTN, false, true), None);
    assert!(latch.is_engaged(BTN));
}

#[test]
fn second_press_disengages_and_its_release_is_swallowed_too() {
    let mut latch = ToggleLatch::new();
    latch.resolve(BTN, true, true);
    latch.resolve(BTN, false, true);

    assert_eq!(latch.resolve(BTN, true, true), Some(false));
    assert_eq!(latch.resolve(BTN, false, true), None);
    assert!(!latch.is_engaged(BTN));
}

#[test]
fn latches_are_tracked_per_button() {
    let mut latch = ToggleLatch::new();

    assert_eq!(latch.resolve(BTN, true, true), Some(true));
    assert_eq!(latch.resolve(OTHER, true, true), Some(true));
    assert!(latch.is_engaged(BTN));
    assert!(latch.is_engaged(OTHER));

    assert_eq!(latch.resolve(BTN, true, true), Some(false));
    assert!(!latch.is_engaged(BTN));
    assert!(latch.is_engaged(OTHER));
}

#[test]
fn cycling_a_latch_repeatedly_alternates() {
    let mut latch = ToggleLatch::new();

    for expected in [true, false, true, false] {
        assert_eq!(latch.resolve(BTN, true, true), Some(expected));
        assert_eq!(latch.resolve(BTN, false, true), None);
    }
}

/// Turning the setting off on a binding that is currently latched on must
/// not strand it: the next edge falls straight through and releases it.
#[test]
fn dropping_the_latch_setting_while_engaged_releases_cleanly() {
    let mut latch = ToggleLatch::new();
    latch.resolve(BTN, true, true);
    assert!(latch.is_engaged(BTN));

    assert_eq!(latch.resolve(BTN, false, false), Some(false));
    assert!(!latch.is_engaged(BTN));
}

#[test]
fn clear_drops_every_latch() {
    let mut latch = ToggleLatch::new();
    latch.resolve(BTN, true, true);
    latch.resolve(OTHER, true, true);

    latch.clear();

    assert!(!latch.is_engaged(BTN));
    assert!(!latch.is_engaged(OTHER));
    // A fresh press engages again rather than reading as the second press.
    assert_eq!(latch.resolve(BTN, true, true), Some(true));
}
