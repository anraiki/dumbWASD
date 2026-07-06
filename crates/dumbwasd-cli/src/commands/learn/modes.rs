use std::collections::HashSet;

use anyhow::Result;

use dumbwasd_core::core::event::InputEvent;
use dumbwasd_core::core::layout::{self, DeviceLayout};
use dumbwasd_core::devices::azeron;
use dumbwasd_core::devices::DeviceInfo;
use dumbwasd_core::platform::InputBackend;

pub(super) async fn learn_guided_mode(
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

pub(super) async fn learn_scan_mode(
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
