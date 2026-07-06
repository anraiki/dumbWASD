use std::time::Instant;

use anyhow::{Context, Result};
use clap::Subcommand;

use dumbwasd_core::devices::logitech;

#[derive(Subcommand)]
pub(crate) enum LogitechHidrawAction {
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

pub(crate) fn cmd_logitech_hidraw(action: LogitechHidrawAction) -> Result<()> {
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
