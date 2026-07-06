use anyhow::Result;

use dumbwasd_core::core::config;

pub(crate) fn cmd_profiles() -> Result<()> {
    let profiles = config::list_profiles()?;

    if profiles.is_empty() {
        println!("No profiles found.");
        println!(
            "Create a .toml file in: {}",
            config::profiles_dir()?.display()
        );
        return Ok(());
    }

    for name in &profiles {
        println!("  {name}");
    }

    Ok(())
}
