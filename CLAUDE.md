# dumbWASD — codebase maintenance rules

Linux-only input remapper: evdev in, uinput out. Cargo workspace: `dumbwasd-core`
(library — all logic shared by CLI and GUI), `dumbwasd-cli`, `dumbwasd-gui`
(Tauri v2 + Vite + vanilla TS in `gui/`).

## File size

- **Target ≤ 250 lines per source file** (`.rs`, `.ts`, `.tsx`). Smaller files are
  easier to maintain for both humans and agents.
- New modules must meet the target. Don't create a new file you already know
  will exceed it — design the split first.
- **Split-when-touched**: when an edit lands in a file already over 250 lines,
  carve out a coherent piece as part of that change (types, one UI section, one
  subsystem). No big-bang refactors; shrink the file you're in.
- **How to split**: carve services, components, and reusable functions into a
  **subfolder with a context name matching the file** — `macro-studio.ts` →
  `macro-studio/` with `index.ts`, `mapping.rs` → `mapping/` with `mod.rs` —
  where the index/mod re-exports the existing public API so importers don't
  change. Behavior-preserving moves only; restructure logic in separate
  changes.
- `gui/src/style.css` is exempt for now but should migrate toward
  per-component sections; don't let it grow without structure.

### Burn-down list (over target as of 2026-08)

`macro-flow-prototype.tsx` 762 · `react-flow-editor.tsx` 689 ·
`devices/registry.rs` 426 · `profile-manager/index.ts` 405 ·
`keyboard-joystick.ts` 324 · `devices/azeron/key_codes.rs` 304 (data tables) ·
`button-grid.ts` 288 · `App.ts` 285 ·
`src-tauri/events/device_reader.rs` 277 · `platform/linux/input.rs` 268

Cleared 2026-08: `src-tauri/events.rs` 400 → `events/` (mod 146, device_reader
249, azeron_hid 82, types 36) · `input-codes.ts` 350 → `input-codes/` (index
144, code-labels 152, browser-input 127) · `platform/linux/input.rs` 342 → 268
(d-pad translation moved to `core/dpad/`) · `monitoring/monitor.ts` 316 →
`monitoring/monitor/` (index 230, request 110, types 49) ·
`profile-manager.ts` 495 → `profile-manager/` (index 405, device-matching 94,
selected-device-storage 43).

Update this list when a file crosses the line in either direction.

## Placement

- Logic needed by both CLI and GUI lives in `dumbwasd-core`, never in
  `gui/src-tauri`. Tauri commands should be thin wrappers.
- Runtime output policy lives in core and is driven by each runtime:
  `core/sticks` (axis → synthetic button), `core/dpad` (any d-pad shape →
  canonical `BTN_DPAD_*`), `core/arbiter` (which held binding may emit).
  Three drivers exist — `core/engine.rs` (CLI), `events/device_reader.rs`
  (GUI runtime remap) and the `emit_output_target` command (GUI monitoring)
  — so a new policy has to be wired into each.
- Wire types are defined once in core; the TS mirror lives in one dedicated
  module (e.g. `gui/src/macro-types.ts`) — never re-declared per file.
- GUI features get their own directory/module (`binder/`, `monitoring/`,
  `components/app/`), not more code in `App.ts`.

## Verification gates (before calling work done)

1. `cargo test -p dumbwasd-core`
2. `cargo check -p dumbwasd-gui`
3. `cd gui && pnpm run build` (includes tsc typecheck)
4. GUI-facing changes: verify rendering/behavior headlessly (vite + headless
   browser harness) or in the running app — not just typecheck.

## Formatting

- Run `cargo fmt` on Rust files you touch (no repo-wide reformat in an
  unrelated change).
- Match surrounding style in TS; no lint config exists yet — if one is added,
  it becomes a gate.

## Hazards

- Macro/remap playback emits real input events via uinput — never run playback
  paths on the dev machine as a "test" without the user asking.
- Azeron HID config commands can grab exclusive device access; be careful with
  HID operations while the device is in use.
