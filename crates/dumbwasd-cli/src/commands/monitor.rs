use anyhow::Result;

use dumbwasd_core::platform::InputBackend;

pub(crate) async fn cmd_monitor(device_path: &str) -> Result<()> {
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
