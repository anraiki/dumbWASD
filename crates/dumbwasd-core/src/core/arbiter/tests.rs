use super::*;

const W: u16 = 17;
const ALT: u16 = 56;
const PAGE_UP: u16 = 104;
const CTRL: u16 = 29;
const S: u16 = 31;

// Source button codes.
const STICK_UP: u16 = 0xF000;
const BTN_A: u16 = 304;
const BTN_B: u16 = 305;

fn key(code: u16) -> OutputTarget {
    OutputTarget::Key { code }
}

fn chord(modifier: u16, code: u16) -> OutputTarget {
    OutputTarget::Shortcut {
        modifiers: vec![modifier],
        key: code,
        repeat_ms: None,
    }
}

fn down(code: u16) -> OutputAction {
    OutputAction::Key {
        code,
        pressed: true,
    }
}

fn up(code: u16) -> OutputAction {
    OutputAction::Key {
        code,
        pressed: false,
    }
}

#[test]
fn without_exclusive_bindings_everything_emits_together() {
    let mut arbiter = ExclusiveArbiter::new();

    assert_eq!(
        arbiter.press(STICK_UP, key(W), false).actions,
        vec![down(W)]
    );
    assert_eq!(
        arbiter.press(BTN_A, chord(ALT, PAGE_UP), false).actions,
        vec![down(ALT), down(PAGE_UP)]
    );
    assert_eq!(arbiter.owner(), None);
}

/// The reported problem: stick-held `W` polluting a camera chord.
#[test]
fn exclusive_binding_releases_everything_else_first() {
    let mut arbiter = ExclusiveArbiter::new();
    assert_eq!(
        arbiter.press(STICK_UP, key(W), false).actions,
        vec![down(W)]
    );

    let arbitration = arbiter.press(BTN_A, chord(ALT, PAGE_UP), true);

    // W must go up before the chord goes down, never Alt+W+PageUp.
    assert_eq!(arbitration.actions, vec![up(W), down(ALT), down(PAGE_UP)]);
    assert_eq!(arbitration.suppressed, vec![STICK_UP]);
    assert_eq!(arbitration.activated, vec![(BTN_A, chord(ALT, PAGE_UP))]);
    assert_eq!(arbiter.owner(), Some(BTN_A));
}

#[test]
fn releasing_the_owner_resumes_a_binding_that_is_still_held() {
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(STICK_UP, key(W), false);
    arbiter.press(BTN_A, chord(ALT, PAGE_UP), true);

    let arbitration = arbiter.release(BTN_A);

    assert_eq!(arbitration.actions, vec![up(PAGE_UP), up(ALT), down(W)]);
    assert_eq!(arbitration.suppressed, vec![BTN_A]);
    assert_eq!(arbitration.activated, vec![(STICK_UP, key(W))]);
    assert_eq!(arbiter.owner(), None);
}

#[test]
fn a_binding_pressed_while_suppressed_stays_silent_until_its_turn() {
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(BTN_A, chord(ALT, PAGE_UP), true);

    // Pressed during the exclusive hold — nothing should reach the output.
    let arbitration = arbiter.press(STICK_UP, key(W), false);
    assert!(arbitration.is_empty());

    // It gets its turn once the owner lets go.
    assert_eq!(
        arbiter.release(BTN_A).actions,
        vec![up(PAGE_UP), up(ALT), down(W)]
    );
}

#[test]
fn earliest_exclusive_press_owns_the_output_and_a_later_one_queues() {
    let mut arbiter = ExclusiveArbiter::new();
    assert_eq!(
        arbiter.press(BTN_A, chord(ALT, PAGE_UP), true).actions,
        vec![down(ALT), down(PAGE_UP)]
    );

    // Second exclusive binding must not steal the output.
    assert!(arbiter.press(BTN_B, chord(CTRL, S), true).is_empty());
    assert_eq!(arbiter.owner(), Some(BTN_A));

    // It takes over only once the first is released.
    let arbitration = arbiter.release(BTN_A);
    assert_eq!(
        arbitration.actions,
        vec![up(PAGE_UP), up(ALT), down(CTRL), down(S)]
    );
    assert_eq!(arbiter.owner(), Some(BTN_B));
}

#[test]
fn releasing_a_queued_binding_changes_nothing() {
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(BTN_A, chord(ALT, PAGE_UP), true);
    arbiter.press(BTN_B, chord(CTRL, S), true);

    assert!(arbiter.release(BTN_B).is_empty());
    assert_eq!(arbiter.owner(), Some(BTN_A));
}

#[test]
fn multiple_suppressed_bindings_release_newest_first() {
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(STICK_UP, key(W), false);
    arbiter.press(BTN_B, key(S), false);

    let arbitration = arbiter.press(BTN_A, chord(ALT, PAGE_UP), true);

    assert_eq!(
        arbitration.actions,
        vec![up(S), up(W), down(ALT), down(PAGE_UP)]
    );
    assert_eq!(arbitration.suppressed, vec![BTN_B, STICK_UP]);
}

#[test]
fn releasing_a_plain_binding_emits_only_its_own_release() {
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(STICK_UP, key(W), false);

    let arbitration = arbiter.release(STICK_UP);
    assert_eq!(arbitration.actions, vec![up(W)]);
    assert_eq!(arbitration.suppressed, vec![STICK_UP]);
    assert!(arbitration.activated.is_empty());
}

#[test]
fn a_repeated_press_without_a_release_does_not_duplicate() {
    let mut arbiter = ExclusiveArbiter::new();
    assert_eq!(
        arbiter.press(STICK_UP, key(W), false).actions,
        vec![down(W)]
    );

    // Already emitting, so nothing new — and no second held entry.
    assert!(arbiter.press(STICK_UP, key(W), false).is_empty());
    assert_eq!(arbiter.release(STICK_UP).actions, vec![up(W)]);
    assert!(arbiter.release(STICK_UP).is_empty());
}

#[test]
fn release_all_drops_everything_that_is_emitting() {
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(STICK_UP, key(W), false);
    arbiter.press(BTN_A, key(S), false);

    let arbitration = arbiter.release_all();
    assert_eq!(arbitration.actions, vec![up(S), up(W)]);
    assert!(arbiter.release_all().is_empty());
}

#[test]
fn auto_repeat_targets_are_reported_so_the_repeat_can_follow_ownership() {
    let repeating = OutputTarget::Shortcut {
        modifiers: vec![ALT],
        key: PAGE_UP,
        repeat_ms: Some(120),
    };
    let mut arbiter = ExclusiveArbiter::new();
    arbiter.press(STICK_UP, key(W), false);

    let arbitration = arbiter.press(BTN_A, repeating.clone(), true);
    assert_eq!(arbitration.suppressed, vec![STICK_UP]);
    assert_eq!(arbitration.activated, vec![(BTN_A, repeating)]);

    // Handing back to W must stop the repeat and restart W.
    let back = arbiter.release(BTN_A);
    assert_eq!(back.suppressed, vec![BTN_A]);
    assert_eq!(back.activated, vec![(STICK_UP, key(W))]);
}
