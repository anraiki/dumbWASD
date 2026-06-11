# dumbWASD

Linux input remapper for gaming keypads, mice, and gamepads (built around the Azeron Cyborg). Reads physical devices via evdev, remaps buttons through TOML profiles, and emits keyboard/mouse output through a virtual device. Ships as a CLI daemon plus a Tauri GUI visualizer.

## ⚠️ What this app does to your system

Read this before running. dumbWASD works by hooking into the Linux input layer, and you should know exactly what that means:

1. **It takes exclusive control of devices it remaps.** When remapping is active, dumbWASD grabs the device (`EVIOCGRAB`) so the kernel stops delivering that device's events to everything else — your desktop, games, and other apps no longer see the physical device at all. Its input is replaced entirely by dumbWASD's output. Monitoring mode observes passively without grabbing. If the process exits or crashes, the kernel releases the grab automatically and the device returns to normal.

2. **It creates a virtual input device.** Remapped output is injected through `/dev/uinput` as a synthetic keyboard/mouse that the rest of the system cannot distinguish from real hardware.

3. **It talks directly to Azeron hardware over hidraw.** Reading device info and profiles sends raw HID reports to the keypad's config interface — the same channel the official Azeron software uses.

4. **It never elevates privileges.** There is no `sudo`, polkit, or setuid anywhere in the app. It runs as your user and simply fails if it lacks access. You grant access once, at setup time:
   - add your user to the `input` group (read `/dev/input/event*`), or set up udev rules
   - a udev rule for `/dev/uinput` (or the `uinput` group, distro-dependent)
   - `assets/99-azeron.rules` for the Azeron's hidraw interface (`sudo cp assets/99-azeron.rules /etc/udev/rules.d/ && sudo udevadm control --reload-rules && sudo udevadm trigger`)

In short: no root at runtime, no background services, no network — but full takeover of any device you point it at, for as long as remapping runs.

## Quick start

```sh
dumbwasd list-devices                          # enumerate input devices
dumbwasd monitor <path>                        # watch raw events (no grab)
dumbwasd run --device <path> --profile <name>  # start remapping (grabs the device)
dumbwasd gui                                   # launch the GUI visualizer
```

## Docs

- `docs/BINDING_SYSTEM_DESIGN.md` — binding/preset schema and migration status
- `docs/MULTI_DEVICE_STRATEGY.md` — multi-device architecture and device identity
- `docs/azeron-protocol-reference.md` — Azeron HID protocol analysis
