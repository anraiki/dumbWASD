use anyhow::{bail, Context, Result};

pub(crate) fn cmd_gui() -> Result<()> {
    use std::process::Command;

    let gui_dir = std::env::current_dir()?.join("gui");
    if !gui_dir.join("src-tauri").exists() {
        bail!(
            "GUI directory not found at {}\nRun from the project root, or use: cd gui && cargo tauri dev",
            gui_dir.display()
        );
    }

    let status = Command::new("cargo")
        .args(["tauri", "dev"])
        .current_dir(&gui_dir)
        .env("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
        .status()
        .context("failed to launch Tauri GUI — is cargo-tauri installed?")?;

    if !status.success() {
        bail!("Tauri GUI exited with {status}");
    }

    Ok(())
}
