use anyhow::Result;
use dumbwasd_core::devices::azeron;
use std::time::{Duration, Instant};

use super::types::{AzeronHidReport, MonitoredEvent};

pub(super) fn read_azeron_hid_events(tx: tokio::sync::mpsc::Sender<MonitoredEvent>) -> Result<()> {
    let device = azeron::open_config_device()?;
    let mut buf = [0u8; 64];
    let mut last_ping_at = Instant::now() - Duration::from_secs(10);

    tracing::info!("listening on Azeron config HID interface");
    azeron::prime_joystick_stream(&device)?;

    loop {
        if last_ping_at.elapsed() >= Duration::from_secs(3) {
            if let Err(error) = azeron::ping_device_binary(&device) {
                tracing::debug!("azeron hid ping failed: {error:#}");
            } else {
                last_ping_at = Instant::now();
            }
        }

        let n = device.read_timeout(&mut buf, 100)?;
        if n == 0 {
            continue;
        }

        let report = &buf[..n];
        let joystick = azeron::parse_joystick_state(report);
        let hid_report = AzeronHidReport {
            length: n,
            hex: format_hex(report),
            ascii: format_ascii(report),
            parsed_source: joystick.as_ref().map(|state| state.source.clone()),
        };

        if tx
            .blocking_send(MonitoredEvent::AzeronHidReport(hid_report))
            .is_err()
        {
            break;
        }

        if let Some(joystick) = joystick {
            if tx
                .blocking_send(MonitoredEvent::AzeronJoystick(joystick))
                .is_err()
            {
                break;
            }
        }
    }

    Ok(())
}

fn format_hex(report: &[u8]) -> String {
    report
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_ascii(report: &[u8]) -> Option<String> {
    let ascii = report
        .iter()
        .map(|byte| match byte {
            0x20..=0x7e => char::from(*byte),
            _ => '.',
        })
        .collect::<String>()
        .trim_matches('.')
        .to_string();

    if ascii.is_empty() {
        None
    } else {
        Some(ascii)
    }
}
