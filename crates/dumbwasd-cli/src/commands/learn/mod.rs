mod modes;

use anyhow::{bail, Result};

use dumbwasd_core::core::layout::{self, ButtonDef, DeviceLayout, DeviceMeta};
use dumbwasd_core::devices::azeron;
use dumbwasd_core::platform::InputBackend;

use super::{get_device_info, print_summary};

pub(crate) async fn cmd_learn_layout(
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
        modes::learn_scan_mode(&mut input, expected_count).await?
    } else {
        modes::learn_guided_mode(&mut input, &device_info, &template).await?
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
