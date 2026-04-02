# TODO

## Refactoring

### 2026-03-31 — Make device bundles truly drop-in on the frontend

Currently the Rust side is drop-in (registry.rs dynamically scans `devices/*/config.toml`),
but the frontend still has hard imports that break if a device folder is removed.

**What needs to change:**

- Replace explicit `import { createJoystickTracker } from "@devices/azeron/joystick"` in `App.ts`
  with `import.meta.glob("../../devices/*/joystick.ts")` for build-time auto-discovery
- Remove `gui/src/devices/azeron.ts` — device metadata should come from the glob'd `config.toml`s
- Replace hard SVG imports in `gui/src/devices/g502.ts` and `xbox.ts` with dynamic glob
- Define a device contract/interface so each device's `joystick.ts` (and future capability modules)
  registers itself via a standard shape rather than being called by name from `App.ts`

**Related files:**
- `App.ts` lines 17, 28–29 (hard device imports)
- `gui/src/devices/azeron.ts` (imports directly from `@devices/azeron/config.toml`)
- `gui/src/devices/g502.ts`, `xbox.ts` (hard SVG imports)
- `gui/src/devices/layout.ts` — contract is already in place, wiring is next
