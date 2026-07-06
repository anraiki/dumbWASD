pub(crate) mod azeron;
pub(crate) mod gui;
pub(crate) mod learn;
pub(crate) mod list_devices;
pub(crate) mod logitech_hidraw;
pub(crate) mod monitor;
pub(crate) mod profiles;
pub(crate) mod prototype_remap;
pub(crate) mod run;

use anyhow::{Context, Result};

use dumbwasd_core::core::layout::{self, DeviceLayout};
use dumbwasd_core::devices::DeviceInfo;
use dumbwasd_core::platform::{create_input_backend, InputBackend};

pub(crate) async fn get_device_info(device_path: &str) -> Result<DeviceInfo> {
    let input = create_input_backend();
    let devices = input.list_devices().await?;
    devices
        .into_iter()
        .find(|d| d.path == device_path)
        .with_context(|| format!("device not found: {device_path}"))
}

pub(crate) fn print_summary(layout: &DeviceLayout, path: &std::path::Path) {
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
