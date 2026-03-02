# Tauri GUI Implementation Plan for dumbWASD

## Overview

**Goal:** Build a Tauri v2 GUI that replicates the azeron-linux Electron app's functionality, with additional features for macros and multi-device support.

**Current Status:**
- ✅ Tauri v2 skeleton exists in `gui/`
- ✅ Basic device selector implemented
- ✅ Button grid started
- ✅ Core Rust backend (`dumbwasd-core`) ready
- ❌ Need macro engine
- ❌ Need full visual mapping interface
- ❌ Need profile editor

## What to Extract from azeron-linux

### 1. **Visual Assets**
- **Keypad Image:** `/tmp/azeron-app-extracted/dist/c3e7383ba2fe69ce679f.png`
  - This is the visual representation of the Azeron keypad
  - Shows button positions for visual mapping
  - Copy to: `gui/src/assets/azeron-keypad.png`

### 2. **UI Components to Replicate**

From azeron-linux (React app), we need these views:

#### A. **Device Selection View**
```
[x] Device dropdown
[x] Connect/Disconnect button
[ ] Connection status indicator
[ ] Firmware version display
```

#### B. **Button Mapping View**
```
[ ] Visual keypad with clickable buttons
[ ] Button highlight on hover
[ ] Button highlight on press (live feedback)
[ ] Per-button configuration panel:
    - Action type selector (Key, Mouse, Macro, etc.)
    - Key picker
    - Modifier keys (Ctrl, Alt, Shift, Win)
    - Click type (Single, Double, Long press)
```

#### C. **Macro Editor**
```
[ ] Macro list
[ ] Macro recorder
[ ] Macro step editor:
    - Action type (KeyDown, KeyUp, MouseButton, Delay)
    - Delay in milliseconds
    - Add/Remove steps
[ ] Play/Test macro
```

#### D. **Profile Manager**
```
[ ] Profile list
[ ] Create/Delete/Duplicate profile
[ ] Import/Export profile
[ ] Active profile selector
[ ] Profile auto-switch (per-application)
```

#### E. **Settings Panel**
```
[ ] Analog stick sensitivity
[ ] DPI settings
[ ] LED configuration
[ ] Auto-start on boot
[ ] Minimize to tray
```

## Architecture

### Frontend (TypeScript + Vite)

```
gui/src/
├── App.ts                    # Main app component
├── components/
│   ├── DeviceSelector.ts     # ✅ EXISTS
│   ├── ButtonGrid.ts         # ✅ EXISTS (basic)
│   ├── ButtonConfig.ts       # ❌ TODO
│   ├── MacroEditor.ts        # ❌ TODO
│   ├── ProfileManager.ts     # ❌ TODO
│   ├── SettingsPanel.ts      # ❌ TODO
│   └── LiveFeedback.ts       # ❌ TODO (shows pressed buttons)
├── assets/
│   └── azeron-keypad.png     # ❌ TODO (copy from azeron-linux)
└── types/
    ├── device.ts             # Device types
    ├── profile.ts            # Profile types
    └── macro.ts              # Macro types
```

### Backend (Rust + Tauri)

```
gui/src-tauri/src/
├── main.rs                   # ✅ EXISTS
├── events.rs                 # ✅ EXISTS
├── commands/
│   ├── device.rs             # Device management commands
│   ├── profile.rs            # Profile CRUD commands
│   ├── macro.rs              # ❌ TODO - Macro execution
│   └── mapping.rs            # Button mapping commands
└── services/
    ├── macro_engine.rs       # ❌ TODO - Macro player
    └── multi_device.rs       # ❌ TODO - Multi-device input
```

## Missing Features to Implement

### 1. **Macro Engine** (High Priority)

**Rust Backend:**
```rust
// In dumbwasd-core/src/macros/
pub struct Macro {
    pub id: String,
    pub name: String,
    pub steps: Vec<MacroStep>,
}

pub enum MacroStep {
    KeyDown(Key),
    KeyUp(Key),
    MouseButton { button: Button, state: ButtonState },
    MouseMove { x: i32, y: i32 },
    Delay(Duration),
}

pub struct MacroEngine {
    running_macros: HashMap<String, JoinHandle<()>>,
}

impl MacroEngine {
    pub async fn execute(&mut self, macro_def: &Macro) {
        // Spawn async task
        // Execute each step with delays
        // Write to uinput device
    }

    pub fn stop(&mut self, macro_id: &str) {
        // Cancel running macro
    }
}
```

**Tauri Command:**
```rust
#[tauri::command]
async fn execute_macro(state: State<'_, AppState>, macro_def: Macro) -> Result<()> {
    state.macro_engine.lock().await.execute(&macro_def).await
}

#[tauri::command]
async fn stop_macro(state: State<'_, AppState>, macro_id: String) -> Result<()> {
    state.macro_engine.lock().await.stop(&macro_id);
    Ok(())
}
```

### 2. **Multi-Device Input** (Medium Priority)

**Goal:** Read from keyboard, mouse, and other gamepads simultaneously

```rust
// In dumbwasd-core/src/devices/
pub struct MultiDeviceManager {
    devices: Vec<DeviceHandle>,
}

impl MultiDeviceManager {
    pub fn add_device(&mut self, path: PathBuf) -> Result<()> {
        // Open evdev device
        // Add to monitoring list
    }

    pub async fn read_events(&mut self) -> impl Stream<Item = InputEvent> {
        // Merge events from all devices
        // Use tokio::select! or futures::stream::select_all
    }
}
```

### 3. **Live Button Feedback** (High Priority - UX)

**Tauri Event Stream:**
```rust
#[tauri::command]
async fn subscribe_button_events(window: Window) -> Result<()> {
    tokio::spawn(async move {
        let mut events = device.read_events();
        while let Some(event) = events.next().await {
            window.emit("button-event", ButtonEvent {
                button_id: event.code,
                state: event.value,
            }).ok();
        }
    });
    Ok(())
}
```

**Frontend:**
```typescript
import { listen } from '@tauri-apps/api/event';

listen('button-event', (event) => {
    const button = event.payload;
    highlightButton(button.button_id, button.state);
});
```

## Implementation Priority

### Phase 1: Core GUI (1-2 weeks)
1. ✅ Copy keypad image from azeron-linux
2. ✅ Implement visual button mapping
3. ✅ Implement button configuration panel
4. ✅ Add live button feedback
5. ✅ Profile loading/saving

### Phase 2: Macro System (1 week)
1. ✅ Design macro data structure
2. ✅ Implement macro engine in Rust
3. ✅ Build macro editor UI
4. ✅ Add macro recorder
5. ✅ Test macro playback

### Phase 3: Multi-Device (1 week)
1. ✅ Implement multi-device manager
2. ✅ Add device list UI
3. ✅ Allow mapping from any device
4. ✅ Test cross-device macros

### Phase 4: Polish (1 week)
1. ✅ Settings panel
2. ✅ Profile auto-switching
3. ✅ Tray icon
4. ✅ Auto-start configuration
5. ✅ Export/import profiles

## Key Differences from azeron-linux

| Feature | azeron-linux (Electron) | dumbWASD (Tauri) |
|---------|------------------------|------------------|
| **Framework** | React + Electron | Vanilla TS + Tauri v2 |
| **Backend** | Node.js + node-hid | Rust + hidapi/evdev |
| **Size** | ~100MB | ~10-15MB |
| **Performance** | Good | Excellent |
| **Multi-device** | ❌ No | ✅ Yes |
| **Macro engine** | Basic | Advanced (async) |
| **Platform** | Linux/Mac/Windows | Linux (Win/Mac TODO) |

## Resources to Copy

From `/tmp/azeron-linux` to `dumbWASD`:

1. **Keypad Image:**
   ```bash
   cp /tmp/azeron-app-extracted/dist/c3e7383ba2fe69ce679f.png \
      gui/src/assets/azeron-keypad.png
   ```

2. **Button Coordinates:** (Extract from minified React code or manually map)
   - Need X,Y positions for each button
   - Can overlay clickable areas on the image

3. **Color Schemes/Styles:**
   - Extract CSS from azeron-linux for consistent look
   - Or design fresh Tauri-native UI

## Next Steps

1. **Run azeron-linux** and take screenshots of each view
2. **Copy keypad image** to Tauri project
3. **Map button positions** on the image
4. **Implement ButtonConfig component** first
5. **Add macro engine** to Rust backend
6. **Build macro UI**
7. **Test end-to-end**

## Questions to Answer

- [ ] Do we want to replicate the exact azeron-linux UI, or modernize it?
- [ ] Should macros be stored in profiles, or separately?
- [ ] Do we need cloud sync for profiles?
- [ ] Should we support scripting (Lua/Rhai) for advanced macros?
