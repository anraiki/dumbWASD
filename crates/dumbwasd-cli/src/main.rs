use std::collections::HashSet;
use std::time::Instant;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use dumbwasd_core::core::config;
use dumbwasd_core::core::engine::Engine;
use dumbwasd_core::core::event::{InputEvent, OutputAction};
use dumbwasd_core::core::layout::{self, ButtonDef, DeviceLayout, DeviceMeta};
use dumbwasd_core::core::profile::Profile;
use dumbwasd_core::devices::azeron;
use dumbwasd_core::devices::logitech;
use dumbwasd_core::devices::DeviceInfo;
use dumbwasd_core::platform::{create_input_backend, create_output_backend, InputBackend};

#[derive(Parser)]
#[command(name = "dumbwasd", about = "HID input remapper for Linux")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all available input devices
    ListDevices,
    /// Monitor raw events from a device
    Monitor {
        /// Path to the input device (e.g. /dev/input/event0)
        device_path: String,
    },
    /// Start the remapping daemon
    Run {
        /// Path to the input device
        #[arg(short, long)]
        device: String,
        /// Profile name to load
        #[arg(short, long, default_value = "default")]
        profile: String,
    },
    /// Temporary proof-of-concept keyboard remap: F8 -> ABC, KEY_MINUS -> DEFG
    PrototypeRemap {
        /// Path to the keyboard input device
        #[arg(short, long)]
        device: String,
    },
    /// Inspect Logitech hidraw interfaces directly via hidapi
    LogitechHidraw {
        #[command(subcommand)]
        action: LogitechHidrawAction,
    },
    /// List available profiles
    Profiles,
    /// Azeron keypad configuration
    Azeron {
        #[command(subcommand)]
        action: AzeronAction,
    },
    /// Interactively learn a device's button layout by pressing buttons
    LearnLayout {
        /// Path to the input device (e.g. /dev/input/event29)
        device_path: String,
        /// Output layout name (saved as <name>.toml)
        #[arg(short, long)]
        name: Option<String>,
        /// Scan mode: press all buttons freely, then Ctrl+C to finish
        #[arg(long)]
        scan: bool,
        /// Use an existing layout as template for grid positions
        #[arg(short, long)]
        template: Option<String>,
        /// Overwrite existing layout file
        #[arg(long)]
        force: bool,
    },
    /// Launch the GUI visualizer (requires Tauri app: cd gui && cargo tauri dev)
    Gui,
}

#[derive(Subcommand)]
enum AzeronAction {
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
}

#[derive(Subcommand)]
enum LogitechHidrawAction {
    /// List Logitech hidraw devices visible through hidapi
    List,
    /// Print raw reports from one Logitech hidraw device
    Sniff {
        /// hidraw path to open (for example /dev/hidraw2)
        #[arg(short, long)]
        path: String,
        /// Read timeout per poll iteration in milliseconds
        #[arg(long, default_value = "250")]
        timeout_ms: i32,
        /// Show duplicate consecutive packets instead of collapsing them
        #[arg(long)]
        all_packets: bool,
    },
}

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

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::ListDevices => cmd_list_devices().await?,
        Commands::Monitor { device_path } => cmd_monitor(&device_path).await?,
        Commands::Run { device, profile } => cmd_run(&device, &profile).await?,
        Commands::PrototypeRemap { device } => cmd_prototype_remap(&device).await?,
        Commands::LogitechHidraw { action } => cmd_logitech_hidraw(action)?,
        Commands::Profiles => cmd_profiles()?,
        Commands::Azeron { action } => cmd_azeron(action)?,
        Commands::LearnLayout {
            device_path,
            name,
            scan,
            template,
            force,
        } => cmd_learn_layout(&device_path, name, scan, template, force).await?,
        Commands::Gui => cmd_gui()?,
    }

    Ok(())
}

async fn cmd_list_devices() -> Result<()> {
    let input = create_input_backend();
    let mut devices: Vec<_> = input
        .list_devices()
        .await?
        .into_iter()
        .filter(|d| d.is_likely_controller())
        .collect();

    dumbwasd_core::devices::resolve_device_names(&mut devices);

    if devices.is_empty() {
        println!("No input devices found.");
        println!("(You may need to run with sudo or add your user to the 'input' group.)");
        return Ok(());
    }

    for dev in &devices {
        let tag = if dev.is_azeron() { " [Azeron]" } else { "" };
        let id = dev.path.rsplit('/').next().unwrap_or(&dev.path);
        println!(
            "{id:<12} {name}{tag}  ({path}  vendor={vendor:#06x} product={product:#06x})",
            path = dev.path,
            name = dev.display_name(),
            vendor = dev.vendor_id,
            product = dev.product_id,
        );
    }

    Ok(())
}

async fn cmd_monitor(device_path: &str) -> Result<()> {
    let mut input = dumbwasd_core::platform::linux::LinuxInput::new_passive();
    input.open_device(device_path).await?;

    println!("Monitoring {device_path} — press Ctrl+C to stop\n");

    loop {
        tokio::select! {
            event = input.next_event() => {
                let event = event?;
                println!("{event:?}");
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\nStopped.");
                break;
            }
        }
    }

    Ok(())
}

async fn cmd_run(device_path: &str, profile_name: &str) -> Result<()> {
    let profile = Profile::load(profile_name)?;
    println!("Loaded profile: {}", profile.profile.name);

    let mut input = create_input_backend();
    input.open_device(device_path).await?;

    let output = create_output_backend()?;

    let mut engine = Engine::new(input, output, profile);

    println!("Running remapper on {device_path} — press Ctrl+C to stop\n");

    engine.run().await?;

    Ok(())
}

async fn cmd_prototype_remap(device_path: &str) -> Result<()> {
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

fn cmd_profiles() -> Result<()> {
    let profiles = config::list_profiles()?;

    if profiles.is_empty() {
        println!("No profiles found.");
        println!(
            "Create a .toml file in: {}",
            config::profiles_dir()?.display()
        );
        return Ok(());
    }

    for name in &profiles {
        println!("  {name}");
    }

    Ok(())
}

fn cmd_logitech_hidraw(action: LogitechHidrawAction) -> Result<()> {
    match action {
        LogitechHidrawAction::List => cmd_logitech_hidraw_list(),
        LogitechHidrawAction::Sniff {
            path,
            timeout_ms,
            all_packets,
        } => cmd_logitech_hidraw_sniff(&path, timeout_ms, all_packets),
    }
}

fn cmd_logitech_hidraw_list() -> Result<()> {
    let devices = logitech::list_hidraw_devices()?;

    if devices.is_empty() {
        println!("No Logitech hidraw devices found.");
        println!("Try plugging the receiver in, waking the mouse, or running with sudo.");
        return Ok(());
    }

    println!("Logitech hidraw devices:\n");
    for device in devices {
        println!("  path:        {}", device.path);
        println!(
            "  ids:         vendor={:#06x} product={:#06x}",
            device.vendor_id, device.product_id
        );
        println!("  interface:   {}", device.interface_number);
        println!(
            "  usage:       page={:#06x} usage={:#06x}",
            device.usage_page, device.usage
        );
        println!(
            "  name:        {}",
            device.product.unwrap_or_else(|| "Unknown".to_string())
        );
        println!(
            "  maker:       {}",
            device.manufacturer.unwrap_or_else(|| "Unknown".to_string())
        );
        if let Some(serial) = device.serial_number {
            println!("  serial:      {serial}");
        }
        println!();
    }

    Ok(())
}

fn cmd_logitech_hidraw_sniff(path: &str, timeout_ms: i32, all_packets: bool) -> Result<()> {
    let device = logitech::open_hidraw_path(path)?;
    let start = Instant::now();
    let mut packet_count = 0u64;
    let mut duplicate_count = 0u64;
    let mut last_packet: Option<Vec<u8>> = None;
    let mut buffer = [0u8; 256];

    println!("Sniffing Logitech hidraw reports on {path}");
    println!("Press Ctrl+C to stop.\n");

    loop {
        let read = device
            .read_timeout(&mut buffer, timeout_ms)
            .with_context(|| format!("failed reading HID reports from {path}"))?;

        if read > 0 {
            let packet = buffer[..read].to_vec();
            if !all_packets
                && last_packet
                    .as_ref()
                    .is_some_and(|previous| previous == &packet)
            {
                duplicate_count += 1;
            } else {
                packet_count += 1;
                let elapsed = start.elapsed().as_secs_f32();
                let duplicate_suffix = if duplicate_count > 0 {
                    format!(" (+{duplicate_count} duplicate packets)")
                } else {
                    String::new()
                };
                println!(
                    "[{elapsed:>8.3}s] packet #{packet_count:<4} len={read:<3} hex={}{}",
                    format_hex(&packet),
                    duplicate_suffix
                );
                let ascii = format_ascii(&packet);
                if !ascii.is_empty() {
                    println!("                    ascii={ascii}");
                }
                duplicate_count = 0;
                last_packet = Some(packet);
            }
        }
    }
}

fn cmd_gui() -> Result<()> {
    use std::process::Command;

    let gui_dir = std::env::current_dir()?.join("gui");
    if !gui_dir.join("src-tauri").exists() {
        bail!(
            "GUI directory not found at {}\nRun from the project root, or use: cd gui && cargo tauri dev",
            gui_dir.display()
        );
    }

    let status = Command::new("cargo")
        .args(["tauri", "dev"])
        .current_dir(&gui_dir)
        .env("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
        .status()
        .context("failed to launch Tauri GUI — is cargo-tauri installed?")?;

    if !status.success() {
        bail!("Tauri GUI exited with {status}");
    }

    Ok(())
}

fn cmd_azeron(action: AzeronAction) -> Result<()> {
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
            // Check if output file already exists
            let output_path = layout::layouts_dir()?.join(format!("{name}.toml"));
            if output_path.exists() && !force {
                bail!(
                    "Layout file already exists: {}\nUse --force to overwrite.",
                    output_path.display()
                );
            }

            // Load existing layout as grid position template
            let template = DeviceLayout::load("azeron-cyborg").ok();

            println!("Reading profile from Azeron memory...");
            let lines = azeron::get_profiles(&device)?;

            if lines.is_empty() {
                bail!("No profile data received from device. Try 'learn-layout' instead.");
            }

            let profile_buttons = azeron::parse_profiles(&lines);
            if profile_buttons.is_empty() {
                println!("Could not parse profile data. Raw response:");
                for line in &lines {
                    println!("  {line}");
                }
                bail!("Failed to parse any button entries. Try 'learn-layout' instead.");
            }

            // Build button definitions with evdev codes
            let mut buttons: Vec<ButtonDef> = Vec::new();
            for pb in &profile_buttons {
                if pb.button_type == 6 {
                    continue; // skip disabled buttons
                }

                let code = match azeron::azeron_code_to_evdev(pb.key_code) {
                    Some(c) => c,
                    None => {
                        println!(
                            "  button {}: unknown Azeron code {} (type {}), skipping",
                            pb.button_id, pb.key_code, pb.button_type
                        );
                        continue;
                    }
                };

                let (label, row, col) = if let Some(ref tmpl) = template {
                    let idx = (pb.button_id as usize).saturating_sub(1);
                    if idx < tmpl.buttons.len() {
                        let b = &tmpl.buttons[idx];
                        (b.label.clone(), b.row, b.col)
                    } else {
                        (
                            format!("{}", pb.button_id),
                            Some(idx as u32 / 7),
                            Some(idx as u32 % 7),
                        )
                    }
                } else {
                    let idx = (pb.button_id as u32).saturating_sub(1);
                    (format!("{}", pb.button_id), Some(idx / 7), Some(idx % 7))
                };

                let key_name = layout::evdev_key_name(code);
                println!(
                    "  button {:>2}: Azeron code {} -> evdev {} ({})",
                    pb.button_id, pb.key_code, code, key_name
                );

                buttons.push(ButtonDef {
                    id: code,
                    label,
                    row,
                    col,
                    x: None,
                    y: None,
                    is_joystick: None,
                    colspan: None,
                    rowspan: None,
                });
            }

            if buttons.is_empty() {
                bail!("No mappable buttons found in profile.");
            }

            let new_layout = DeviceLayout {
                device: DeviceMeta {
                    name: "Azeron Cyborg".to_string(),
                    vendor_id: azeron::VENDOR_ID,
                    product_id: azeron::PRODUCT_ID,
                    rows: template.as_ref().map_or(7, |t| t.device.rows),
                    cols: template.as_ref().map_or(7, |t| t.device.cols),
                    layout_type: None,
                },
                buttons,
            };

            let saved_path = new_layout.save(&name)?;
            print_summary(&new_layout, &saved_path);
        }
    }

    Ok(())
}

// ── Learn layout (universal) ────────────────────────────────────

async fn cmd_learn_layout(
    device_path: &str,
    name: Option<String>,
    scan: bool,
    template_name: Option<String>,
    force: bool,
) -> Result<()> {
    // Get device info
    let device_info = get_device_info(device_path).await?;
    let is_azeron = device_info.is_azeron();

    // Determine output name
    let layout_name = name.unwrap_or_else(|| slugify(&device_info.name));

    // Check if output file already exists
    let output_path = layout::layouts_dir()?.join(format!("{layout_name}.toml"));
    if output_path.exists() && !force {
        bail!(
            "Layout file already exists: {}\nUse --force to overwrite, or --name to choose a different name.",
            output_path.display()
        );
    }

    // Load template
    let template = match template_name {
        Some(ref t) => Some(DeviceLayout::load(t)?),
        None if is_azeron => DeviceLayout::load("azeron-cyborg").ok(),
        None => None,
    };

    // Open device passively (no grab)
    let mut input = dumbwasd_core::platform::linux::LinuxInput::new_passive();
    input.open_device(device_path).await?;

    println!("Device: {} ({})\n", device_info.name, device_path);

    // Run learning mode
    let expected_count = if device_info.is_azeron() {
        Some(azeron::BUTTON_COUNT)
    } else {
        template.as_ref().map(|t| t.buttons.len())
    };

    let discovered = if scan {
        learn_scan_mode(&mut input, expected_count).await?
    } else {
        learn_guided_mode(&mut input, &device_info, &template).await?
    };

    if discovered.is_empty() {
        bail!("No buttons were recorded. Nothing to save.");
    }

    // Build layout — scan mode always auto-arranges, guided mode uses template positions
    let use_template_positions = !scan && template.is_some();

    let (rows, cols) = if use_template_positions {
        let tmpl = template.as_ref().unwrap();
        (tmpl.device.rows, tmpl.device.cols)
    } else {
        let c = (discovered.len() as f64).sqrt().ceil() as u32;
        let r = ((discovered.len() as f64) / c as f64).ceil() as u32;
        (r, c)
    };

    let buttons: Vec<ButtonDef> = discovered
        .iter()
        .enumerate()
        .map(|(i, &(code, ref label, row, col))| {
            let (r, c) = if use_template_positions {
                (row, col)
            } else {
                (Some(i as u32 / cols), Some(i as u32 % cols))
            };
            ButtonDef {
                id: code,
                label: label.clone(),
                row: r,
                col: c,
                x: None,
                y: None,
                is_joystick: None,
                colspan: None,
                rowspan: None,
            }
        })
        .collect();

    let layout = DeviceLayout {
        device: DeviceMeta {
            name: device_info.name.clone(),
            vendor_id: device_info.vendor_id,
            product_id: device_info.product_id,
            rows,
            cols,
            layout_type: None,
        },
        buttons,
    };

    let saved_path = layout.save(&layout_name)?;
    print_summary(&layout, &saved_path);
    Ok(())
}

async fn learn_guided_mode(
    input: &mut dumbwasd_core::platform::linux::LinuxInput,
    device_info: &DeviceInfo,
    template: &Option<DeviceLayout>,
) -> Result<Vec<(u16, String, Option<u32>, Option<u32>)>> {
    let mut discovered = Vec::new();
    let mut seen_codes: HashSet<u16> = HashSet::new();

    let button_count = if let Some(ref tmpl) = template {
        tmpl.buttons.len()
    } else if device_info.is_azeron() {
        azeron::BUTTON_COUNT
    } else {
        usize::MAX // press Ctrl+C when done
    };

    if button_count < usize::MAX {
        println!("Guided mode: {button_count} buttons expected.");
    } else {
        println!("Guided mode: press Ctrl+C when all buttons have been pressed.");
    }
    println!();

    for i in 0..button_count {
        let (label, row, col) = if let Some(ref tmpl) = template {
            if i >= tmpl.buttons.len() {
                break;
            }
            let b = &tmpl.buttons[i];
            (b.label.clone(), b.row, b.col)
        } else {
            let num = i + 1;
            (format!("{num}"), None, None)
        };

        println!(
            "  Press button {} (\"{}\"), then release it...",
            i + 1,
            label
        );

        // Wait for press
        let code = loop {
            tokio::select! {
                event = input.next_event() => {
                    if let InputEvent::Button { code, pressed: true } = event? {
                        break code;
                    }
                }
                _ = tokio::signal::ctrl_c() => {
                    println!("\n  Stopped early ({} buttons recorded).", discovered.len());
                    return Ok(discovered);
                }
            }
        };

        // Wait for release
        loop {
            tokio::select! {
                event = input.next_event() => {
                    if let InputEvent::Button { code: c, pressed: false } = event? {
                        if c == code { break; }
                    }
                }
                _ = tokio::signal::ctrl_c() => { break; }
            }
        }

        let key_name = layout::evdev_key_name(code);
        if !seen_codes.insert(code) {
            println!("    WARNING: code {code} ({key_name}) was already recorded!");
        }
        println!("    -> code {code} ({key_name})");

        discovered.push((code, label, row, col));
    }

    println!("\n  All {0} buttons recorded.", discovered.len());
    Ok(discovered)
}

async fn learn_scan_mode(
    input: &mut dumbwasd_core::platform::linux::LinuxInput,
    expected: Option<usize>,
) -> Result<Vec<(u16, String, Option<u32>, Option<u32>)>> {
    println!("Scan mode: press all your buttons in any order.");
    if let Some(n) = expected {
        println!("Expected: ~{n} buttons. Some may be disabled or analog-only.");
    }
    println!("Press Ctrl+C when done.\n");

    let mut seen_codes: Vec<u16> = Vec::new();
    let mut seen_axes: HashSet<u16> = HashSet::new();
    let reminder_interval = tokio::time::Duration::from_secs(8);
    let mut last_new = tokio::time::Instant::now();

    loop {
        tokio::select! {
            event = input.next_event() => {
                match event? {
                    InputEvent::Button { code, pressed: true } => {
                        if !seen_codes.contains(&code) {
                            seen_codes.push(code);
                            last_new = tokio::time::Instant::now();
                            let key_name = layout::evdev_key_name(code);
                            let progress = if let Some(n) = expected {
                                format!(" / ~{n}")
                            } else {
                                String::new()
                            };
                            println!("  [{count}{progress}] code {code} ({key_name})", count = seen_codes.len());
                        }
                    }
                    InputEvent::Axis { axis, .. } => {
                        if seen_axes.insert(axis) {
                            println!("  [axis] code {axis} — joystick/analog, not added to layout");
                        }
                    }
                    _ => {}
                }
            }
            _ = tokio::time::sleep(reminder_interval) => {
                if last_new.elapsed() >= reminder_interval {
                    let progress = if let Some(n) = expected {
                        format!("{} / ~{n}", seen_codes.len())
                    } else {
                        format!("{}", seen_codes.len())
                    };
                    println!("\n  ... {progress} buttons found so far. Keep pressing or Ctrl+C to finish.\n");
                }
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\nDone. {} unique buttons recorded.", seen_codes.len());
                if !seen_axes.is_empty() {
                    println!("  ({} analog axes detected but not included in layout)", seen_axes.len());
                }
                break;
            }
        }
    }

    // Build results with auto-arranged grid positions
    let results: Vec<(u16, String, Option<u32>, Option<u32>)> = seen_codes
        .iter()
        .enumerate()
        .map(|(i, &code)| {
            let label = format!("{}", i + 1);
            (code, label, None, None) // positions will be auto-arranged later
        })
        .collect();

    Ok(results)
}

// ── Helpers ─────────────────────────────────────────────────────

fn format_hex(packet: &[u8]) -> String {
    packet
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_ascii(packet: &[u8]) -> String {
    packet
        .iter()
        .map(|byte| match byte {
            0x20..=0x7e => char::from(*byte),
            _ => '.',
        })
        .collect::<String>()
        .trim_matches('.')
        .to_string()
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

async fn get_device_info(device_path: &str) -> Result<DeviceInfo> {
    let input = create_input_backend();
    let devices = input.list_devices().await?;
    devices
        .into_iter()
        .find(|d| d.path == device_path)
        .with_context(|| format!("device not found: {device_path}"))
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn print_summary(layout: &DeviceLayout, path: &std::path::Path) {
    println!();
    println!("Layout saved successfully!");
    println!();
    println!(
        "  Device:  {} (vendor={:#06x}, product={:#06x})",
        layout.device.name, layout.device.vendor_id, layout.device.product_id
    );
    println!("  Buttons: {}", layout.buttons.len());
    println!("  File:    {}", path.display());
    println!();
    println!("  {:<8} {:<6} {:<18} {}", "Button", "Code", "Name", "Grid");
    println!("  {:<8} {:<6} {:<18} {}", "------", "----", "----", "----");
    for (i, btn) in layout.buttons.iter().enumerate() {
        let key_name = layout::evdev_key_name(btn.id);
        let row = btn
            .row
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string());
        let col = btn
            .col
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string());
        println!(
            "  {:<8} {:<6} {:<18} ({}, {})",
            i + 1,
            btn.id,
            key_name,
            row,
            col
        );
    }
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
