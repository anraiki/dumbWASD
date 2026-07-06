use anyhow::{bail, Result};

use dumbwasd_core::core::layout::{self, ButtonDef, DeviceLayout, DeviceMeta};
use dumbwasd_core::devices::azeron;

use crate::commands::print_summary;

pub(super) fn cmd_azeron_read_layout(
    device: &hidapi::HidDevice,
    name: &str,
    force: bool,
) -> Result<()> {
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
    let lines = azeron::get_profiles(device)?;

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

    let saved_path = new_layout.save(name)?;
    print_summary(&new_layout, &saved_path);

    Ok(())
}
