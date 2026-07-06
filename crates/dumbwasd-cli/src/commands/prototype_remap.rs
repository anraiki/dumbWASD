use std::collections::HashSet;

use anyhow::Result;

use dumbwasd_core::core::event::{InputEvent, OutputAction};
use dumbwasd_core::platform::{create_input_backend, create_output_backend, InputBackend};

use super::get_device_info;

const KEY_MINUS_CODE: u16 = 12;
const KEY_F8_CODE: u16 = 66;
const KEY_LEFTSHIFT_CODE: u16 = 42;
const KEY_RIGHTSHIFT_CODE: u16 = 54;
const KEY_A_CODE: u16 = 30;
const KEY_B_CODE: u16 = 48;
const KEY_C_CODE: u16 = 46;
const KEY_D_CODE: u16 = 32;
const KEY_E_CODE: u16 = 18;
const KEY_F_CODE: u16 = 33;
const KEY_G_CODE: u16 = 34;

const F8_SEQUENCE: [u16; 3] = [KEY_A_CODE, KEY_B_CODE, KEY_C_CODE];
const MINUS_SEQUENCE: [u16; 4] = [KEY_D_CODE, KEY_E_CODE, KEY_F_CODE, KEY_G_CODE];

pub(crate) async fn cmd_prototype_remap(device_path: &str) -> Result<()> {
    let device = get_device_info(device_path).await?;
    let mut input = create_input_backend();
    input.open_device(device_path).await?;

    let mut output = create_output_backend()?;
    let mut held_keys = HashSet::new();

    println!(
        "Prototype remap enabled on {} ({device_path})",
        device.display_name()
    );
    println!("  F8 (66) -> ABC");
    println!("  KEY_MINUS (12) -> DEFG");
    println!(
        "Press Ctrl+C in this terminal to disable the prototype and restore normal behavior.\n"
    );

    loop {
        tokio::select! {
            event = input.next_event() => {
                match event? {
                    InputEvent::Button { code, pressed } => {
                        update_held_keys(&mut held_keys, code, pressed);

                        if let Some(sequence) = prototype_sequence_for(code) {
                            if pressed {
                                emit_text_sequence(&mut output, sequence, shift_is_held(&held_keys))?;
                            }
                            continue;
                        }

                        emit_key(&mut output, code, pressed)?;
                    }
                    InputEvent::Sync => {}
                    InputEvent::Axis { axis, value } => {
                        tracing::trace!(axis, value, "ignoring non-key event in keyboard prototype");
                    }
                }
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\nPrototype remap disabled. Keyboard grab released.");
                break;
            }
        }
    }

    Ok(())
}

fn prototype_sequence_for(code: u16) -> Option<&'static [u16]> {
    match code {
        KEY_F8_CODE => Some(&F8_SEQUENCE),
        KEY_MINUS_CODE => Some(&MINUS_SEQUENCE),
        _ => None,
    }
}

fn shift_is_held(held_keys: &HashSet<u16>) -> bool {
    held_keys.contains(&KEY_LEFTSHIFT_CODE) || held_keys.contains(&KEY_RIGHTSHIFT_CODE)
}

fn update_held_keys(held_keys: &mut HashSet<u16>, code: u16, pressed: bool) {
    if pressed {
        held_keys.insert(code);
    } else {
        held_keys.remove(&code);
    }
}

fn emit_key<O: dumbwasd_core::platform::OutputBackend>(
    output: &mut O,
    code: u16,
    pressed: bool,
) -> Result<()> {
    output.emit(&OutputAction::Key { code, pressed })?;
    output.emit_sync()?;
    Ok(())
}

fn emit_key_tap<O: dumbwasd_core::platform::OutputBackend>(
    output: &mut O,
    code: u16,
) -> Result<()> {
    output.emit(&OutputAction::Key {
        code,
        pressed: true,
    })?;
    output.emit(&OutputAction::Key {
        code,
        pressed: false,
    })?;
    Ok(())
}

fn emit_text_sequence<O: dumbwasd_core::platform::OutputBackend>(
    output: &mut O,
    sequence: &[u16],
    shift_already_held: bool,
) -> Result<()> {
    if !shift_already_held {
        output.emit(&OutputAction::Key {
            code: KEY_LEFTSHIFT_CODE,
            pressed: true,
        })?;
    }

    for &code in sequence {
        emit_key_tap(output, code)?;
    }

    if !shift_already_held {
        output.emit(&OutputAction::Key {
            code: KEY_LEFTSHIFT_CODE,
            pressed: false,
        })?;
    }

    output.emit_sync()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        prototype_sequence_for, shift_is_held, update_held_keys, KEY_F8_CODE, KEY_LEFTSHIFT_CODE,
        KEY_MINUS_CODE,
    };
    use std::collections::HashSet;

    #[test]
    fn prototype_sequences_match_expected_triggers() {
        assert_eq!(prototype_sequence_for(KEY_F8_CODE), Some(&[30, 48, 46][..]));
        assert_eq!(
            prototype_sequence_for(KEY_MINUS_CODE),
            Some(&[32, 18, 33, 34][..])
        );
        assert_eq!(prototype_sequence_for(1), None);
    }

    #[test]
    fn shift_state_tracks_pressed_keys() {
        let mut held = HashSet::new();
        assert!(!shift_is_held(&held));

        update_held_keys(&mut held, KEY_LEFTSHIFT_CODE, true);
        assert!(shift_is_held(&held));

        update_held_keys(&mut held, KEY_LEFTSHIFT_CODE, false);
        assert!(!shift_is_held(&held));
    }
}
