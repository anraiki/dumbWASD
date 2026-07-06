mod commands;

use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use commands::azeron::AzeronAction;
use commands::logitech_hidraw::LogitechHidrawAction;

#[derive(Parser)]
#[command(name = "dumbwasd", about = "HID input remapper for Linux")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List all available input devices
    ListDevices,
    /// Monitor raw events from a device
    Monitor {
        /// Path to the input device (e.g. /dev/input/event0)
        device_path: String,
    },
    /// Start the remapping daemon
    Run {
        /// Path to the input device
        #[arg(short, long)]
        device: String,
        /// Profile name to load
        #[arg(short, long, default_value = "default")]
        profile: String,
    },
    /// Temporary proof-of-concept keyboard remap: F8 -> ABC, KEY_MINUS -> DEFG
    PrototypeRemap {
        /// Path to the keyboard input device
        #[arg(short, long)]
        device: String,
    },
    /// Inspect Logitech hidraw interfaces directly via hidapi
    LogitechHidraw {
        #[command(subcommand)]
        action: LogitechHidrawAction,
    },
    /// List available profiles
    Profiles,
    /// Azeron keypad configuration
    Azeron {
        #[command(subcommand)]
        action: AzeronAction,
    },
    /// Interactively learn a device's button layout by pressing buttons
    LearnLayout {
        /// Path to the input device (e.g. /dev/input/event29)
        device_path: String,
        /// Output layout name (saved as <name>.toml)
        #[arg(short, long)]
        name: Option<String>,
        /// Scan mode: press all buttons freely, then Ctrl+C to finish
        #[arg(long)]
        scan: bool,
        /// Use an existing layout as template for grid positions
        #[arg(short, long)]
        template: Option<String>,
        /// Overwrite existing layout file
        #[arg(long)]
        force: bool,
    },
    /// Launch the GUI visualizer (requires Tauri app: cd gui && cargo tauri dev)
    Gui,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::ListDevices => commands::list_devices::cmd_list_devices().await?,
        Commands::Monitor { device_path } => commands::monitor::cmd_monitor(&device_path).await?,
        Commands::Run { device, profile } => commands::run::cmd_run(&device, &profile).await?,
        Commands::PrototypeRemap { device } => {
            commands::prototype_remap::cmd_prototype_remap(&device).await?
        }
        Commands::LogitechHidraw { action } => {
            commands::logitech_hidraw::cmd_logitech_hidraw(action)?
        }
        Commands::Profiles => commands::profiles::cmd_profiles()?,
        Commands::Azeron { action } => commands::azeron::cmd_azeron(action).await?,
        Commands::LearnLayout {
            device_path,
            name,
            scan,
            template,
            force,
        } => commands::learn::cmd_learn_layout(&device_path, name, scan, template, force).await?,
        Commands::Gui => commands::gui::cmd_gui()?,
    }

    Ok(())
}
