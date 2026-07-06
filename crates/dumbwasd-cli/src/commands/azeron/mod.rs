mod joystick;
mod read_layout;

use anyhow::{bail, Result};
use clap::Subcommand;

use dumbwasd_core::devices::azeron;

#[derive(Subcommand)]
pub(crate) enum AzeronAction {
    /// Show device info (firmware version, LED state, etc.)
    Info,
    /// Dump the current profile configuration from the device
    DumpProfiles,
    /// Set a button to a keyboard key
    SetButton {
        /// Profile slot (0 or 1)
        #[arg(short = 'P', long, default_value = "0")]
        profile_id: u8,
        /// Button ID (1-38)
        button_id: u8,
        /// Key name (e.g. A, F1, SPACE, ESC)
        key: String,
    },
    /// Disable a button (no output)
    DisableButton {
        /// Profile slot (0 or 1)
        #[arg(short = 'P', long, default_value = "0")]
        profile_id: u8,
        /// Button ID (1-38)
        button_id: u8,
    },
    /// Disable all buttons on a profile (reset to blank)
    ResetProfile {
        /// Profile slot (0 or 1)
        #[arg(default_value = "0")]
        profile_id: u8,
    },
    /// Read button mappings from device memory and generate a layout file
    ReadLayout {
        /// Output layout name (default: azeron-cyborg)
        #[arg(short, long, default_value = "azeron-cyborg")]
        name: String,
        /// Overwrite existing layout file
        #[arg(long)]
        force: bool,
    },
    /// Listen to joystick updates from the Azeron config HID interface
    JoystickListen {
        /// Read timeout per poll iteration in milliseconds
        #[arg(long, default_value = "100")]
        timeout_ms: i32,
        /// Show duplicate consecutive joystick states instead of collapsing them
        #[arg(long)]
        all_packets: bool,
    },
}

pub(crate) async fn cmd_azeron(action: AzeronAction) -> Result<()> {
    let device = azeron::open_config_device()?;
    println!("Connected to Azeron.\n");

    match action {
        AzeronAction::Info => {
            let fw = azeron::get_firmware_version(&device)?;
            let leds = azeron::get_led_state(&device)?;
            let analog = azeron::get_analog_type(&device)?;
            let info = azeron::get_keypad_info(&device)?;

            println!("Firmware:    {fw}");
            println!("Keypad info: {info}");
            println!("LEDs:        {leds}");
            println!("Analog type: {analog}");
        }
        AzeronAction::DumpProfiles => {
            let lines = azeron::get_profiles(&device)?;
            for line in &lines {
                println!("{line}");
            }
            if lines.is_empty() {
                println!("(no profile data received)");
            }
        }
        AzeronAction::SetButton {
            profile_id,
            button_id,
            key,
        } => {
            let code = azeron::azeron_key_code(&key)
                .ok_or_else(|| anyhow::anyhow!("unknown key name: {key}"))?;

            let ok = azeron::set_button_key(&device, profile_id, button_id, code, &[])?;
            if ok {
                println!("Button {button_id} set to {key} (profile {profile_id})");
            } else {
                bail!("device rejected the command for button {button_id}");
            }
        }
        AzeronAction::DisableButton {
            profile_id,
            button_id,
        } => {
            let ok = azeron::disable_button(&device, profile_id, button_id)?;
            if ok {
                println!("Button {button_id} disabled (profile {profile_id})");
            } else {
                bail!("device rejected the command for button {button_id}");
            }
        }
        AzeronAction::ResetProfile { profile_id } => {
            println!(
                "Disabling all {count} buttons on profile {profile_id}...",
                count = azeron::BUTTON_COUNT
            );
            for id in 1..=azeron::BUTTON_COUNT as u8 {
                let ok = azeron::disable_button(&device, profile_id, id)?;
                if ok {
                    print!("  button {id:>2}: disabled\r");
                } else {
                    println!("  button {id:>2}: FAILED");
                }
            }
            println!("\nProfile {profile_id} reset complete.");
        }
        AzeronAction::ReadLayout { name, force } => {
            read_layout::cmd_azeron_read_layout(&device, &name, force)?;
        }
        AzeronAction::JoystickListen {
            timeout_ms,
            all_packets,
        } => {
            joystick::cmd_azeron_joystick_listen(&device, timeout_ms, all_packets)?;
        }
    }

    Ok(())
}
