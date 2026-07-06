use anyhow::Result;

use dumbwasd_core::platform::{create_input_backend, InputBackend};

pub(crate) async fn cmd_list_devices() -> Result<()> {
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
