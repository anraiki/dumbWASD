//! Azeron keypad support: device identification, HID config protocol,
//! joystick state parsing, and profile reading.

mod commands;
mod device;
mod joystick;
mod key_codes;
mod profiles;
mod transport;

pub use commands::{
    disable_button, get_analog_type, get_firmware_version, get_keypad_info, get_led_state,
    get_profiles, ping_device, ping_device_binary, prime_joystick_stream, set_button_joystick,
    set_button_key,
};
pub use device::{
    button_pins, ButtonType, KnownDevice, BUTTON_COUNT, CONFIG_INTERFACE, CONFIG_USAGE,
    CONFIG_USAGE_PAGE, KNOWN_DEVICES, PRODUCT_ID, VENDOR_ID,
};
pub use joystick::{
    parse_joystick_state, read_joystick_state, JoystickState, JOYSTICK_CENTER, JOYSTICK_SPAN,
};
pub use key_codes::{azeron_code_to_evdev, azeron_key_code, azeron_key_name, hid_usage_to_evdev};
pub use profiles::{parse_profiles, ProfileButton};
pub use transport::open_config_device;
