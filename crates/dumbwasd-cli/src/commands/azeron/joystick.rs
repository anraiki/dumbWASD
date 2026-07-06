use std::time::Instant;

use anyhow::Result;

use dumbwasd_core::devices::azeron;

pub(super) fn cmd_azeron_joystick_listen(
    device: &hidapi::HidDevice,
    timeout_ms: i32,
    all_packets: bool,
) -> Result<()> {
    let start = Instant::now();
    let mut last_ping_at = Instant::now() - std::time::Duration::from_secs(10);
    let mut packet_count = 0u64;
    let mut duplicate_count = 0u64;
    let mut last_state: Option<azeron::JoystickState> = None;

    println!("Listening to Azeron joystick reports on the config HID interface.");
    println!("Use this together with `dumbwasd monitor /dev/input/eventX` if you want to compare HID vs evdev.");
    println!("Press Ctrl+C to stop.\n");
    azeron::prime_joystick_stream(device)?;

    loop {
        if last_ping_at.elapsed() >= std::time::Duration::from_secs(3) {
            if let Err(error) = azeron::ping_device_binary(device) {
                println!("ping error: {error:#}");
            } else {
                last_ping_at = Instant::now();
            }
        }

        let Some(state) = azeron::read_joystick_state(device, timeout_ms)? else {
            continue;
        };

        if !all_packets
            && last_state
                .as_ref()
                .is_some_and(|previous| previous == &state)
        {
            duplicate_count += 1;
            continue;
        }

        packet_count += 1;
        let elapsed = start.elapsed().as_secs_f32();
        let duplicate_suffix = if duplicate_count > 0 {
            format!(" (+{duplicate_count} duplicate packets)")
        } else {
            String::new()
        };
        println!(
            "[{elapsed:>8.3}s] packet #{packet_count:<4} src={:<20} x={:>4} y={:>4} raw_x={:>4} raw_y={:>4} norm=({:>6}, {:>6}){}",
            state.source,
            state.x,
            state.y,
            state.raw_x,
            state.raw_y,
            format_axis_percent(state.normalized_x()),
            format_axis_percent(state.normalized_y()),
            duplicate_suffix,
        );

        duplicate_count = 0;
        last_state = Some(state);
    }
}

fn format_axis_percent(value: f32) -> String {
    let percent = (value * 100.0).round() as i32;
    format!("{percent:+}%")
}
