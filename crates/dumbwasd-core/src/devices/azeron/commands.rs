use anyhow::Result;
use hidapi::HidDevice;

use super::device::{button_pins, ButtonType};
use super::transport::{
    send_binary_command_no_response, send_command, send_command_multi, send_command_no_response,
};

/// Get the firmware version string.
pub fn get_firmware_version(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_FW_VERSION")
}

/// Prime the configurator HID stream so the device starts emitting live joystick packets.
///
/// This mirrors the startup sequence used by the official Azeron Linux app:
/// text firmware/type probes plus binary firmware/details/right-analog requests.
pub fn prime_joystick_stream(device: &HidDevice) -> Result<()> {
    const FIRMWARE_VERSION: u8 = 5;
    const KEYPAD_DETAILS: u8 = 2;
    const RIGHT_ANALOG: u8 = 33;

    send_command_no_response(device, "GET_FW_VERSION")?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_binary_command_no_response(device, FIRMWARE_VERSION, &[], 1)?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_command_no_response(device, "GET_FW_TYPE")?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_binary_command_no_response(device, KEYPAD_DETAILS, &[], 2)?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    send_binary_command_no_response(device, RIGHT_ANALOG, &[], 3)?;

    Ok(())
}

/// Keepalive used by the official app to keep the configurator HID stream active.
pub fn ping_device(device: &HidDevice) -> Result<()> {
    send_command_no_response(device, "Hi")
}

/// Binary keepalive used once the device is in the modern binary protocol path.
pub fn ping_device_binary(device: &HidDevice) -> Result<()> {
    const PING_DEVICE: u8 = 18;
    send_binary_command_no_response(device, PING_DEVICE, &[], 4)
}

/// Get the current profiles configuration (multi-packet response).
pub fn get_profiles(device: &HidDevice) -> Result<Vec<String>> {
    send_command_multi(device, "GET_PROFILES")
}

/// Get LED state.
pub fn get_led_state(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_LEDS")
}

/// Get analog stick type (ANALOG_SQUARE or ANALOG_CIRCLE).
pub fn get_analog_type(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_ANALOG_TYPE")
}

/// Get keypad type info.
pub fn get_keypad_info(device: &HidDevice) -> Result<String> {
    send_command(device, "GET_FW_TYPE")
}

/// Set a single button to a keyboard key.
///
/// - `profile_id`: 0 or 1
/// - `button_id`: 1-38
/// - `key_code`: Azeron internal key code (use `azeron_key_code()`)
/// - `meta_keys`: modifier key codes (LCTRL=57345, LSHIFT=57346, LALT=57348)
pub fn set_button_key(
    device: &HidDevice,
    profile_id: u8,
    button_id: u8,
    key_code: u32,
    meta_keys: &[u32],
) -> Result<bool> {
    let pins = button_pins(button_id);
    let button_type = ButtonType::KeyboardKey as u8;

    // Key values: up to 4 slots, pad with 0
    let keys = format!("{}|0|0|0", key_code);

    // Meta keys: up to 3 slots, pad with 0
    let mut metas = meta_keys.iter().map(|k| k.to_string()).collect::<Vec<_>>();
    metas.resize(3, "0".to_string());
    let meta_str = metas.join("|");

    let cmd = format!(
        "B{profile_id}|{button_id}|{button_type}|{pin0}|{pin1}|{keys}|{meta_str}|0",
        pin0 = pins[0],
        pin1 = pins[1],
    );

    let response = send_command(device, &cmd)?;
    Ok(response.starts_with(&format!("BOK_{button_id}")))
}

/// Disable a single button.
pub fn disable_button(device: &HidDevice, profile_id: u8, button_id: u8) -> Result<bool> {
    let pins = button_pins(button_id);
    let button_type = ButtonType::Disabled as u8;
    let cmd = format!(
        "B{profile_id}|{button_id}|{button_type}|{pin0}|{pin1}|0|0|0|0|0|0|0|0",
        pin0 = pins[0],
        pin1 = pins[1],
    );
    let response = send_command(device, &cmd)?;
    Ok(response.starts_with(&format!("BOK_{button_id}")))
}

/// Set a button to a joystick button (appears on js0 interface).
pub fn set_button_joystick(
    device: &HidDevice,
    profile_id: u8,
    button_id: u8,
    joy_button: u32,
) -> Result<bool> {
    let pins = button_pins(button_id);
    let button_type = ButtonType::JoystickButton as u8;
    let keys = format!("{}|0|0|0", joy_button);
    let cmd = format!(
        "B{profile_id}|{button_id}|{button_type}|{pin0}|{pin1}|{keys}|0|0|0|0",
        pin0 = pins[0],
        pin1 = pins[1],
    );
    let response = send_command(device, &cmd)?;
    Ok(response.starts_with(&format!("BOK_{button_id}")))
}
