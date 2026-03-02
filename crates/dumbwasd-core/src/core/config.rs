use std::path::PathBuf;

use anyhow::{Context, Result};

/// Return the directory where profiles are stored.
///
/// Resolution order:
/// 1. `$DUMBWASD_PROFILES_DIR` environment variable
/// 2. `./profiles` relative to the current working directory
pub fn profiles_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("DUMBWASD_PROFILES_DIR") {
        return Ok(PathBuf::from(dir));
    }

    let cwd = std::env::current_dir().context("failed to get current directory")?;
    Ok(cwd.join("profiles"))
}

/// List all profile names (filenames without .toml extension) found in the profiles directory.
pub fn list_profiles() -> Result<Vec<String>> {
    let dir = profiles_dir()?;

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut profiles = Vec::new();
    for entry in std::fs::read_dir(&dir).context("failed to read profiles directory")? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "toml") {
            if let Some(stem) = path.file_stem() {
                profiles.push(stem.to_string_lossy().into_owned());
            }
        }
    }

    profiles.sort();
    Ok(profiles)
}
