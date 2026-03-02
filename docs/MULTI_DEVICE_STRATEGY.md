# Multi-Device Strategy for dumbWASD

## Key Insight from azeron-linux

> **azeron-linux is designed for ONE Azeron device** with multiple software profiles.
>
> **dumbWASD will support MULTIPLE INPUT DEVICES** - a key differentiator!

## The Difference

### azeron-linux Approach
```
Single Azeron Device
    ↓
Multiple Profiles (Gaming, Editing, etc.)
    ↓
Switch profiles via button/menu
```

### dumbWASD Approach (Better!)
```
Multiple Input Devices
    ↓
    ├─ Azeron Keypad (primary)
    ├─ Regular Keyboard (secondary)
    ├─ Mouse (for combo bindings)
    └─ Other Gamepads
    ↓
Single Unified Profile
    ↓
Map ANY button from ANY device to ANY action
```

## Why Multi-Device Matters

**Use Case Examples:**

1. **Hybrid Gaming Setup:**
   ```
   Azeron Thumb Button → Press 'E' (interact)
   Keyboard Numpad 1 → Cast Spell 1 (macro)
   Mouse Side Button → Melee attack
   ```

2. **Macro Chaining:**
   ```
   Press Azeron Button 5
       ↓
   Trigger macro that:
       1. Holds Left Shift (keyboard)
       2. Clicks Mouse Button 4
       3. Presses 'R' key
       4. Releases Left Shift
   ```

3. **Accessibility:**
   ```
   User has limited mobility
       ↓
   Map complex key combos (Ctrl+Alt+Del) to single Azeron button
       ↓
   Also read from foot pedal for jump
   ```

## Implementation Architecture

### Device Manager

```rust
// In dumbwasd-core/src/devices/manager.rs

pub struct DeviceManager {
    devices: HashMap<DeviceId, Box<dyn InputDevice>>,
    event_stream: mpsc::Receiver<DeviceEvent>,
}

impl DeviceManager {
    pub async fn discover_devices() -> Result<Self> {
        let mut devices = HashMap::new();

        // Scan for Azeron devices
        for device in enumerate_azeron_devices()? {
            devices.insert(device.id(), Box::new(device));
        }

        // Scan for evdev devices (keyboard, mouse, etc.)
        for path in glob("/dev/input/event*")? {
            if let Ok(device) = EvdevDevice::open(&path) {
                devices.insert(device.id(), Box::new(device));
            }
        }

        Ok(Self { devices, event_stream })
    }

    pub async fn read_event(&mut self) -> Option<DeviceEvent> {
        // Merge events from all devices into single stream
        self.event_stream.recv().await
    }
}

pub struct DeviceEvent {
    pub source: DeviceId,      // Which device sent this
    pub button: ButtonId,      // Which button (normalized)
    pub state: ButtonState,    // Press/Release
    pub timestamp: Instant,
}
```

### Profile Format Extension

```toml
# profile.toml

[meta]
name = "Multi-Device Gaming"
description = "Uses Azeron + Keyboard + Mouse"

# Device-specific mappings
[[mappings]]
source_device = "azeron:0"     # First Azeron found
source_button = 5
target = { key = "E" }

[[mappings]]
source_device = "keyboard:0"   # System keyboard
source_button = 79             # Numpad 1
target = { macro = "spell1" }

[[mappings]]
source_device = "mouse:0"      # Primary mouse
source_button = 275            # Side button
target = { key = "F" }

# Cross-device macro
[[macros]]
name = "spell1"
steps = [
    { action = "key_down", key = "LeftShift", device = "keyboard:0" },
    { action = "delay", duration_ms = 50 },
    { action = "mouse_click", button = "Left", device = "mouse:0" },
    { action = "delay", duration_ms = 100 },
    { action = "key_press", key = "R", device = "keyboard:0" },
    { action = "key_up", key = "LeftShift", device = "keyboard:0" },
]
```

## UI Design for Multi-Device

### Device Selector (Sidebar Extension)

```
┌─────────────────┐
│  DEVICES        │
├─────────────────┤
│ ✓ Azeron Cyborg │  ← Primary device (always shown)
│ ✓ Keyboard      │  ← Additional devices
│ ✓ Mouse         │
│ + Add Device    │
└─────────────────┘
```

### Mapping View Update

```
┌────────────────────────────────────────────┐
│  Mapping: Button 5                         │
├────────────────────────────────────────────┤
│  Source Device: [Azeron Cyborg ▼]          │
│  Source Button: [Button 5      ]           │
│                                            │
│  Action Type:   [Macro         ▼]          │
│  Macro:         [Spell 1       ▼]          │
│                                            │
│  [Test] [Save] [Cancel]                    │
└────────────────────────────────────────────┘
```

### Macro Editor Enhancement

```
┌────────────────────────────────────────────┐
│  Macro: Spell 1                            │
├────────────────────────────────────────────┤
│  Steps:                                    │
│                                            │
│  1. Key Down      [LeftShift ▼] [@Keyboard]│
│  2. Delay         [50ms      ]             │
│  3. Mouse Click   [Left      ▼] [@Mouse   ]│
│  4. Delay         [100ms     ]             │
│  5. Key Press     [R         ▼] [@Keyboard]│
│  6. Key Up        [LeftShift ▼] [@Keyboard]│
│                                            │
│  [+ Add Step] [Record]                     │
└────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Single Azeron (Match azeron-linux)
- ✅ Connect to Azeron device
- ✅ Show keypad visualization
- ✅ Configure button mappings
- ✅ Basic profile support
- **Goal:** Feature parity with azeron-linux

### Phase 2: Add System Keyboard
- ✅ Detect system keyboard via evdev
- ✅ Allow mapping Azeron buttons to keyboard inputs
- ✅ Show both devices in UI
- **Goal:** Prove multi-device concept

### Phase 3: Add System Mouse
- ✅ Detect mouse via evdev
- ✅ Allow mouse button mappings
- ✅ Track mouse movement for macros
- **Goal:** Complete input coverage

### Phase 4: Advanced Macros
- ✅ Cross-device macro steps
- ✅ Conditional logic (if X pressed, do Y)
- ✅ Repeat loops
- ✅ Variable delays
- **Goal:** Power user features

### Phase 5: Device Monitoring
- ✅ Hotplug support (device connect/disconnect)
- ✅ Device priority (which device wins on conflict)
- ✅ Per-application profiles
- **Goal:** Production-ready stability

## Technical Challenges

### 1. **Event Timing**
**Problem:** Events from multiple devices arrive at different times
**Solution:**
```rust
// Buffer events with 5ms window for grouping
let mut event_buffer = Vec::new();
let mut last_event_time = Instant::now();

loop {
    if let Some(event) = timeout(5ms, device_manager.read_event()).await {
        event_buffer.push(event);
        last_event_time = Instant::now();
    } else if !event_buffer.is_empty() {
        // Process batch
        process_events(&event_buffer);
        event_buffer.clear();
    }
}
```

### 2. **Device Identification**
**Problem:** Same keyboard model appears as different /dev/input/eventX on reboot
**Solution:**
```rust
// Use device properties for stable ID
pub struct DeviceId {
    vendor_id: u16,
    product_id: u16,
    serial: Option<String>,
    name: String,
}

// Store in profile as human-readable
// "keyboard:Logitech_G915:serial123"
```

### 3. **Permission Management**
**Problem:** Need root to read /dev/input
**Solution:**
- Use udev rules (already have for Azeron)
- Add user to `input` group
- Package installer sets this up

## Comparison Table

| Feature | azeron-linux | dumbWASD (Goal) |
|---------|--------------|-----------------|
| Azeron Support | ✅ Yes | ✅ Yes |
| Visual Keypad | ✅ Yes | ✅ Yes |
| Button Mapping | ✅ Yes | ✅ Yes |
| Macros | ✅ Basic | ✅ Advanced |
| **Multi-Device** | ❌ No | ✅ **YES** |
| **Cross-Device Macros** | ❌ No | ✅ **YES** |
| Keyboard Input | ❌ No | ✅ Yes |
| Mouse Input | ❌ No | ✅ Yes |
| Gamepad Input | ❌ No | 🔄 Future |
| Per-App Profiles | ✅ Yes | ✅ Yes |
| Platform | Linux/Win/Mac | Linux (Win/Mac TODO) |
| App Size | ~100MB | ~10MB |
| Language | JavaScript | Rust |

## Why This Matters

**dumbWASD's multi-device support is a HUGE differentiator:**

1. **More Flexible:** Users aren't limited to Azeron buttons only
2. **Better Macros:** Can simulate complex inputs across devices
3. **Accessibility:** Users can combine inputs in creative ways
4. **Future-Proof:** Easy to add new device types (foot pedals, stream decks, etc.)

## Next Steps

1. ✅ Finish Phase 1 (single Azeron - match azeron-linux UI)
2. ✅ Implement `DeviceManager` with keyboard support
3. ✅ Update UI to show multiple devices
4. ✅ Extend profile format for multi-device
5. ✅ Build cross-device macro engine
6. ✅ Test with real gaming scenarios
