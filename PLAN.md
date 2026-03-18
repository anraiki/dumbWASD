# dumbWASD — Cross-Platform Input Remapper
> A open-source, cross-platform alternative to reWASD, built in Rust.

---

## 1. Project Overview

dumbWASD is a cross-platform input remapping daemon and GUI that allows users to:
- Remap any HID input device (keypads, controllers, mice) to keyboard/mouse/gamepad output
- Create and manage profiles per game/application
- Define macros with timing, sequences, and modifiers
- Automatically switch profiles based on active application
- Target devices like the Azeron Cyborg, standard gamepads, and custom HID devices

---

## 2. Stack Decision

| Layer | Technology | Reasoning |
|-------|-----------|-----------|
| Core language | **Rust** | Performance, memory safety, cross-platform, native HID access |
| GUI | **Tauri v2** | Rust backend + web frontend, lightweight, cross-platform |
| Frontend | **React + TypeScript** | Familiar JS ecosystem for UI |
| Styling | **Tailwind CSS** | Fast UI development |
| Config format | **JSON / TOML** | Human-readable profile storage |
| CI/CD | **GitHub Actions** | Automated cross-platform builds |
| Package manager | **Cargo** | Rust native, handles all dependencies |

---

## 3. Project Structure

```
dumbWASD/
├── src/
│   ├── main.rs                  # Entry point, daemon startup
│   ├── lib.rs                   # Library exports
│   │
│   ├── core/                    # Platform-agnostic logic
│   │   ├── mod.rs
│   │   ├── profile.rs           # Profile data model
│   │   ├── mapping.rs           # Button mapping logic
│   │   ├── macro_engine.rs      # Macro execution engine
│   │   ├── config.rs            # Config load/save (TOML/JSON)
│   │   └── event.rs             # Internal event types
│   │
│   ├── platform/                # Platform-specific implementations
│   │   ├── mod.rs               # Trait definitions (InputBackend, OutputBackend)
│   │   ├── linux/
│   │   │   ├── mod.rs
│   │   │   ├── input.rs         # evdev input reading
│   │   │   └── output.rs        # uinput virtual device output
│   │   ├── windows/
│   │   │   ├── mod.rs
│   │   │   ├── input.rs         # DirectInput / RawInput
│   │   │   └── output.rs        # SendInput / ViGEm
│   │   └── macos/
│   │       ├── mod.rs
│   │       ├── input.rs         # IOKit / CoreHID
│   │       └── output.rs        # CGEventPost
│   │
│   ├── devices/                 # Device-specific definitions
│   │   ├── mod.rs
│   │   ├── azeron.rs            # Azeron Cyborg button layout/IDs
│   │   └── generic.rs           # Generic HID gamepad
│   │
│   └── ipc/                     # Inter-process communication
│       ├── mod.rs
│       └── server.rs            # IPC server (daemon <-> GUI)
│
├── gui/                         # Tauri + React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Main overview
│   │   │   ├── Profiles.tsx     # Profile management
│   │   │   ├── Mapping.tsx      # Button mapping editor
│   │   │   └── Macros.tsx       # Macro editor
│   │   └── components/
│   │       ├── DeviceView.tsx   # Visual device layout
│   │       ├── KeyPicker.tsx    # Key selection widget
│   │       └── ProfileCard.tsx
│   └── src-tauri/               # Tauri Rust backend for GUI
│       └── main.rs
│
├── dist/                        # Compiled binaries (git ignored)
│   ├── linux/
│   │   └── dumbWASD
│   ├── windows/
│   │   └── dumbWASD.exe
│   └── macos/
│       └── dumbWASD
│
├── profiles/                    # Example/default profiles
│   ├── azeron_dota2.toml
│   └── azeron_default.toml
│
├── Cargo.toml                   # Rust dependencies
├── Cargo.lock
├── .github/
│   └── workflows/
│       └── build.yml            # GitHub Actions cross-compile CI
└── README.md
```

---

## 4. Platform Abstraction Design

The core abstraction — every platform implements these two traits:

```rust
// Input backend — reads raw device events
trait InputBackend {
    fn list_devices(&self) -> Vec<Device>;
    fn open_device(&self, device: &Device) -> Result<DeviceHandle>;
    fn read_event(&self, handle: &DeviceHandle) -> Result<InputEvent>;
}

// Output backend — emits remapped events to OS
trait OutputBackend {
    fn emit_key(&self, key: KeyCode, state: KeyState) -> Result<()>;
    fn emit_mouse(&self, event: MouseEvent) -> Result<()>;
    fn emit_axis(&self, axis: Axis, value: f32) -> Result<()>;
}
```

Platform is selected at compile time:

```rust
#[cfg(target_os = "linux")]
use crate::platform::linux as platform;

#[cfg(target_os = "windows")]
use crate::platform::windows as platform;

#[cfg(target_os = "macos")]
use crate::platform::macos as platform;
```

---

## 5. Core Data Models

### Profile
```toml
[profile]
name = "Dota 2"
device = "Azeron Cyborg"
auto_switch_app = "dota2"

[[mappings]]
button_id = 15
output = { type = "key", value = "KEY_F" }

[[mappings]]
button_id = 10
output = { type = "macro", id = "tp_scroll" }

[[macros]]
id = "tp_scroll"
steps = [
  { action = "key_down", key = "KEY_T", delay_ms = 0 },
  { action = "key_up",   key = "KEY_T", delay_ms = 50 },
]
```

### Internal Event Type
```rust
pub enum InputEvent {
    ButtonPress   { button_id: u16 },
    ButtonRelease { button_id: u16 },
    AxisMove      { axis: Axis, value: f32 },
}

pub enum OutputAction {
    KeyPress    { key: KeyCode },
    KeyRelease  { key: KeyCode },
    MacroRun    { macro_id: String },
    MouseMove   { dx: i32, dy: i32 },
}
```

---

## 6. Key Dependencies (Crates)

```toml
[dependencies]
# HID / Input
evdev       = "0.12"      # Linux input reading
hidapi      = "2.6"       # Cross-platform HID access
uinput      = "0.4"       # Linux virtual device output

# Async runtime
tokio       = { version = "1", features = ["full"] }

# Config
serde       = { version = "1", features = ["derive"] }
serde_json  = "1"
toml        = "0.8"

# IPC (daemon <-> GUI)
tauri       = { version = "2", features = ["shell-open"] }

# Logging
tracing     = "0.1"
tracing-subscriber = "0.3"

# Error handling
anyhow      = "1"
thiserror   = "1"
```

---

## 7. Development Phases

### Phase 1 — Foundation (Linux only)
- [ ] Project scaffold (Cargo workspace)
- [ ] Read Azeron Cyborg HID events via `evdev`
- [ ] Map button IDs to key codes
- [ ] Emit remapped keys via `uinput`
- [ ] Load/save profiles from TOML files
- [ ] CLI to list devices and apply a profile

### Phase 2 — Macro Engine
- [ ] Define macro data model
- [ ] Implement macro execution with timing/delays
- [ ] Key sequence support
- [ ] Modifier key combos (Ctrl+Shift+K etc.)

### Phase 3 — GUI (Tauri)
- [ ] Tauri app scaffold
- [ ] Device viewer with button layout
- [ ] Profile manager (create, edit, delete)
- [ ] Key picker widget
- [ ] Macro editor
- [ ] IPC bridge between daemon and GUI

### Phase 4 — Windows Support
- [ ] Implement Windows input backend (RawInput/DirectInput)
- [ ] Implement Windows output backend (SendInput / ViGEm)
- [ ] Cross-compile CI via GitHub Actions
- [ ] Test on Windows 10/11

### Phase 5 — macOS Support
- [ ] Implement macOS input backend (IOKit)
- [ ] Implement macOS output backend (CGEventPost)
- [ ] Handle macOS permissions (Accessibility, Input Monitoring)
- [ ] Code signing considerations

### Phase 6 — Polish
- [ ] Per-app automatic profile switching
- [ ] System tray integration
- [ ] Auto-start on login (all platforms)
- [ ] Installer/package (`.deb`, `.msi`, `.dmg`)
- [ ] GitHub Releases with pre-built binaries

---

## 8. Cross-Compilation Build Targets

```bash
# Install targets
rustup target add x86_64-unknown-linux-gnu
rustup target add x86_64-pc-windows-gnu
rustup target add x86_64-apple-darwin
rustup target add aarch64-apple-darwin

# Build commands
cargo build --release --target x86_64-unknown-linux-gnu   # Linux
cargo build --release --target x86_64-pc-windows-gnu      # Windows
cargo build --release --target x86_64-apple-darwin        # macOS Intel
cargo build --release --target aarch64-apple-darwin       # macOS Apple Silicon
```

### GitHub Actions CI (`.github/workflows/build.yml`)
- Triggers on every push to `main` and on tagged releases
- Builds all 4 targets in parallel
- Uploads binaries as release artifacts automatically

---

## 9. Naming

| Item | Name |
|------|------|
| Project | **dumbWASD** |
| Daemon binary | `dumbWASD` |
| GUI app | **dumbWASD** |
| Config dir (Linux) | `~/.config/dumbWASD/` |
| Config dir (Windows) | `%APPDATA%\dumbWASD\` |
| Config dir (macOS) | `~/Library/Application Support/dumbWASD/` |
---

## 10. Notes for Claude Code

- Start with **Phase 1 only** — Linux, CLI, no GUI yet
- Prioritize getting Azeron Cyborg input reading working first via `evdev`
- Use `tokio` async runtime from the start to make daemon architecture clean
- All profiles stored as TOML in `~/.config/dumbWASD/profiles/`
- Use `anyhow` for error handling throughout
- Write platform trait interfaces even in Phase 1 so Phase 4/5 slot in cleanly
- The `devices/azeron.rs` module should contain the full Azeron Cyborg button ID map from the azeron-cli reference
- One `evdev` verify input, start designing feedback to see input reflected in a gui
