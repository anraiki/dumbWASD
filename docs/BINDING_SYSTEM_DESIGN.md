# Binding System Design for dumbWASD

## Purpose

This document defines the proposed binding system model for dumbWASD before implementation.

The design goals are:

- support multiple curated input devices under one profile
- support multiple switchable binding presets per device
- support simple remaps, trigger-based bindings, combos, macros, turbo, and toggle behaviors
- support import/export/share of device binding presets
- keep the model extensible without forcing a redesign later

This design is conceptually similar to firmware-driven layout systems such as MoErgo/ZMK, but adapted for a host-side remapper that grabs physical input devices and emits virtual output events.

## Core Principles

1. dumbWASD manages multiple devices under one top-level profile.
2. Each device can have multiple binding presets.
3. A device has exactly one active binding preset at a time.
4. A single physical input may have multiple candidate bindings, but one interaction resolves to one winning binding.
5. `Combo` means multiple source inputs together. It should not be used for single-input timing behaviors.
6. Trigger, behavior, output, and playback should be modeled separately.

## Hierarchy

```text
Profile
  -> Device[]
    -> BindingPreset[]
      -> Binding[]
      -> Combo[]
```

### Profile

A top-level user workspace or scenario.

Examples:

- `Default`
- `FPS`
- `Work`
- `MMO`

Responsibilities:

- groups multiple curated devices together
- stores the user-facing name and metadata
- provides a container for import/export at full-profile scope

### Device

A curated physical input device managed under a profile.

Examples:

- Logitech G602
- Logitech G502 X LIGHTSPEED
- Azeron keypad
- regular keyboard

Responsibilities:

- identifies the physical device
- stores one active binding preset id
- contains multiple binding presets for quick switching

### BindingPreset

A named, switchable set of bindings for one device.

Examples:

- `FPS`
- `Desktop`
- `MMO`
- `Editing`

Responsibilities:

- stores `Binding[]` and `Combo[]`
- acts as the import/export/share unit for a device-specific mapping set
- may later contain profile-local defaults such as timing thresholds

### Binding

A single-input rule with:

- one source input
- one trigger
- one behavior
- one output program
- one playback mode

Examples:

- `Single Press A -> K`
- `Long Press A -> ABC`
- `Double Press Mouse4 -> Esc`

### Combo

A multi-input rule that activates when multiple inputs are pressed together within a configured window.

Examples:

- `Combo A + B -> C`
- `Combo Mouse4 + Mouse5 -> Alt+Tab`

## User-Facing Terminology

The UI and docs should use these names:

- `Single Press`
- `Long Press`
- `Double Press`
- `Triple Press`
- `Press Start`
- `Press Release`
- `Combo`

Avoid calling single-input timing behaviors "combos".

Examples:

- `Single Press A -> K`
- `Long Press A -> ABC`
- `Double Press A -> Esc`
- `Combo A + B -> C`

## Binding Resolution Model

One source input may have multiple trigger-specific bindings defined in the same binding preset.

Example:

- `Single Press A -> K`
- `Long Press A -> ABC`
- `Double Press A -> Esc`

Only one resolved binding should fire for one completed interaction.

Examples:

- quick tap -> `Single Press A`
- long hold -> `Long Press A`
- double tap -> `Double Press A`

This is not fanout. The binding system chooses one winner.

## Device Identity

The current codebase often uses `vendor_id:product_id`, but that is not sufficient as a permanent identity for all scenarios.

The final design should support a stronger device identity than just VID:PID, because:

- multiple devices may share VID:PID
- one receiver may expose multiple interfaces
- one physical device may appear under multiple event nodes

Recommended device identity fields:

- `vendor_id`
- `product_id`
- `name`
- `raw_name`
- optional stable runtime key derived from grouped interfaces

The exact persisted identifier can be finalized during implementation, but it must be device-specific enough to avoid collisions across similar devices.

## Binding Structure

Each `Binding` should conceptually contain:

- `id`
- `enabled`
- `from`
- `trigger`
- `behavior`
- `output`
- `playback`

### Suggested Conceptual Shape

```text
Binding {
  id,
  enabled,
  from,
  trigger,
  behavior,
  output,
  playback
}
```

## Trigger Types

The initial trigger set should be:

- `press_start`
- `press_release`
- `single_press`
- `long_press`
- `double_press`
- `triple_press`

### Trigger Definitions

#### `press_start`

Fires immediately when the input goes down.

#### `press_release`

Fires immediately when the input goes up.

#### `single_press`

Fires after release only if the interaction does not become a double press or triple press.

This usually requires a short resolution delay.

#### `long_press`

Fires once the hold threshold is crossed.

#### `double_press`

Fires when two full presses happen inside the configured multi-press window.

#### `triple_press`

Fires when three full presses happen inside the configured multi-press window.

## Trigger Timing

These timing values should be supported:

- `long_press_ms`
- `multi_press_timeout_ms`
- `combo_window_ms`

An optional extra tolerance field can exist if needed later:

- `deadzone_ms`

### Timing Notes

`single_press` cannot usually fire at the exact original press-down moment if double/triple press is also supported on the same source. It must wait long enough to know whether the interaction is becoming a multi-press action.

Recommended default behavior:

- `press_start` is immediate
- `press_release` is immediate
- `single_press` resolves after the multi-press timeout expires with no second press
- `double_press` resolves after the second press sequence completes
- `triple_press` resolves after the third press sequence completes
- `long_press` resolves once the hold threshold is crossed

Future calibration based on user-recorded timing can be considered later, but V1 should use explicit configurable thresholds rather than adaptive timing.

## Behavior Modes

Behavior determines what happens to the original source input once the binding resolves.

Recommended initial set:

- `passthrough`
- `append_before`
- `append_after`
- `override`
- `disabled`

### Definitions

#### `passthrough`

Emit the original/default input only.

#### `append_before`

Emit custom output first, then synthesize the original/default input.

#### `append_after`

Synthesize the original/default input first, then emit custom output.

#### `override`

Emit custom output only. Do not synthesize the original/default input.

#### `disabled`

Swallow the input and emit nothing.

## Important Host-Side Constraint

On Linux, dumbWASD grabs the physical device when used as an active remapper. That means the original physical input does not continue to the OS naturally.

As a result:

- `passthrough` means the app must explicitly synthesize the original event
- `append_before` and `append_after` must also explicitly synthesize the original event
- `override` means the app emits only the replacement output

This is a key difference between dumbWASD and firmware-based systems.

## Output Types

The initial output model should support:

- `key`
- `key_tap`
- `mouse_button`
- `text`
- `macro`

### Definitions

#### `key`

Mirrors press/release state for a target key.

#### `key_tap`

Synthesizes a full press-and-release key tap.

#### `mouse_button`

Mirrors or taps a target mouse button.

#### `text`

A text expansion such as `"ABC"`.

Recommended V1 behavior:

- implement text as a sequence of synthesized key taps
- do not rely on Unicode text injection APIs

This keeps behavior predictable in games and software that expect raw key events.

#### `macro`

An ordered list of output steps and delays.

Examples of macro steps:

- key down
- key up
- key tap
- mouse button press/release
- mouse movement
- delay

## Playback Modes

Playback determines how the output program runs after the binding resolves.

Recommended initial set:

- `once`
- `while_held`
- `repeat_while_held`
- `toggle`
- `toggle_repeat`

### Definitions

#### `once`

Run the output one time.

#### `while_held`

Keep the output active for as long as the source input remains held.

#### `repeat_while_held`

Run the output repeatedly at a configured interval while the source input remains held.

This is the proposed `turbo` behavior.

#### `toggle`

Press once to start the output state, press again to stop it.

#### `toggle_repeat`

Press once to start a repeated loop, press again to stop it.

This is the proposed loop/toggle feature.

### Playback Notes

Toggle behaviors require persistent runtime state per binding.

Expected V1 cancellation rules:

- toggles stop on profile switch
- toggles stop on app shutdown
- repeated outputs stop immediately on release if the mode is `repeat_while_held`

## Combo Structure

Combos should be modeled separately from single-input bindings.

Each `Combo` should conceptually contain:

- `id`
- `enabled`
- `inputs`
- `combo_window_ms`
- `behavior`
- `output`
- `playback`

### Combo Rules

Example:

- `Combo A + B -> C`

Expected semantics:

- if `A` and `B` are pressed within the combo window, the combo wins
- plain `A` and plain `B` should not also fire if the combo consumes them
- combo resolution has higher priority than plain bindings when a valid combo is matched

This means some plain bindings may need a short delay so the runtime can determine whether the interaction is becoming a combo.

## Macro Builder Integration

The existing macro builder should map naturally into the binding design.

The builder produces:

- `output = macro`
- an ordered sequence of macro steps

Bindings and combos can both target macros.

Examples:

- `Single Press Mouse4 -> Macro`
- `Combo A + B -> Macro`
- `Long Press G602 Button -> Macro`

The macro builder should not be a separate parallel remapping system. It should be one output type inside the same binding schema.

## Turbo Support

Turbo should not be modeled as a trigger.

Turbo belongs in playback behavior:

- output repeats quickly while held
- interval is configurable

Example:

- `Press Start A -> Key(X) with repeat_while_held every 30ms`

## Toggle Support

Toggle should not be modeled as a trigger.

Toggle belongs in playback behavior:

- press once to start
- press again to stop

Examples:

- `Single Press A -> toggle macro loop`
- `Single Press Mouse5 -> toggle repeated key presses`

## Reset Semantics

`Reset` should be treated as a UI action, not a persisted binding behavior.

Reset means:

- remove the custom binding for that source input
- fall back to the device binding preset's default behavior

In practice, this usually means restoring passthrough/default mapping behavior.

## Import and Export

The design should support at least these export units:

- one binding preset
- one full device configuration
- one full multi-device profile

This matters because dumbWASD manages grouped devices, not just one keyboard.

Recommended use cases:

- share one G602 binding preset with the community
- export one full Azeron + mouse + keyboard profile
- backup one device's presets independently of others

## TOML Sketch

The repo currently stores profiles as TOML, so the design examples below use TOML.

This is only a conceptual sketch, not final syntax.

```toml
[profile]
name = "Default"

[[devices]]
id = "logitech-g602"
name = "Logitech G602"
vendor_id = 1133
product_id = 16428
active_binding_preset = "fps"

[[devices.binding_presets]]
id = "fps"
name = "FPS"

[[devices.binding_presets.bindings]]
id = "single-a"
enabled = true
from = 30
trigger = { type = "single_press", multi_press_timeout_ms = 250 }
behavior = { type = "override" }
output = { type = "key_tap", code = 37 }
playback = { type = "once" }

[[devices.binding_presets.bindings]]
id = "long-a"
enabled = true
from = 30
trigger = { type = "long_press", long_press_ms = 300 }
behavior = { type = "override" }
output = { type = "text", value = "ABC" }
playback = { type = "once" }

[[devices.binding_presets.bindings]]
id = "turbo-a"
enabled = true
from = 48
trigger = { type = "press_start" }
behavior = { type = "override" }
output = { type = "key_tap", code = 46 }
playback = { type = "repeat_while_held", interval_ms = 30 }

[[devices.binding_presets.combos]]
id = "combo-a-b"
enabled = true
inputs = [30, 48]
combo_window_ms = 60
behavior = { type = "override" }
output = { type = "key_tap", code = 46 }
playback = { type = "once" }
```

## Runtime Requirements

To implement this design, the runtime will need:

- device-aware event resolution
- per-input state tracking
- timers for long press and multi-press handling
- timers for combo windows
- scheduled playback for turbo and macros
- persistent state for toggle bindings
- explicit synthesis of passthrough/original input when required

## Current Codebase Gaps

The current codebase does not yet support this model fully.

Current limitations include:

- mappings are currently one input code to one immediate output action
- the mapper does not yet implement trigger timing state machines
- the mapper does not yet honor device-scoped binding resolution robustly
- there is no generalized playback engine for toggle/turbo/structured macros
- reset/passthrough semantics are not yet formalized for grabbed devices

## Recommended Implementation Order

1. Update the persisted schema in `dumbwasd-core`
2. Add stronger device identity handling
3. Implement device-scoped binding preset resolution
4. Implement single-input trigger state machine
5. Implement combo resolution
6. Implement output program execution
7. Implement playback modes
8. Integrate macro builder into `output = macro`
9. Build import/export at binding-preset, device, and full-profile scopes
10. Add editor UI for binding presets, triggers, behaviors, outputs, and combos

## Open Questions

These should be finalized during implementation:

1. Should `single_press` always wait for the multi-press timeout, or can the system support a low-latency fallback mode?
2. Should combo resolution support "strict simultaneous press" and "windowed chord" as separate modes?
3. Should `deadzone_ms` be exposed in UI terminology, or should the UI consistently call it `combo window` / `timing window`?
4. How should device identity be persisted across reconnects when the OS renames interfaces?
5. Should binding presets support inherited defaults, or stay fully explicit?

## Recommended V1 Boundary

The recommended first implementation boundary is:

- multi-device profile model
- per-device binding presets
- single-input bindings
- combos
- trigger types:
  - `press_start`
  - `press_release`
  - `single_press`
  - `long_press`
  - `double_press`
  - `triple_press`
- behavior types:
  - `passthrough`
  - `append_before`
  - `append_after`
  - `override`
  - `disabled`
- output types:
  - `key`
  - `key_tap`
  - `mouse_button`
  - `text`
  - `macro`
- playback types:
  - `once`
  - `repeat_while_held`
  - `toggle`

This is enough to support the current design goals without overextending the first pass.
