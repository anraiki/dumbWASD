use anyhow::Result;

use dumbwasd_core::core::engine::Engine;
use dumbwasd_core::core::profile::Profile;
use dumbwasd_core::platform::{create_input_backend, create_output_backend, InputBackend};

pub(crate) async fn cmd_run(device_path: &str, profile_name: &str) -> Result<()> {
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
