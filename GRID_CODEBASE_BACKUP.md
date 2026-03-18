# Grid-Based Layout Visualizer - Working Implementation Backup

This document preserves the current working grid-based button layout visualizer implementation. This serves as a reference to restore this version if needed when experimenting with alternative approaches (e.g., React Flow).

## Overview

The current implementation uses CSS Grid with row/column positioning to render device button layouts. It supports:

- **Grid-based layouts** with row/col coordinates and colspan/rowspan spanning
- **Custom absolute positioning** layouts (not currently used)
- **Auto-connection** to devices when both device and layout are selected
- **Real-time button state visualization** with glow effects
- **Connection status indicator** (disconnected/connecting/connected)
- **Joystick rendering** with directional labels (W/A/S/D)

## Key Files

### 1. App.ts - Main Application Logic

Location: `/home/anri/Documents/projects/dumbWASD/gui/src/App.ts`

**Key Features:**
- Device and layout selector dropdowns
- Auto-select first Azeron device and default layout
- Auto-start monitoring when both device and layout are selected
- Connection indicator with visual states
- Button event listener for real-time updates

**Critical Code Sections:**

```typescript
// Auto-select first Azeron device
const firstAzeron = devices.find(d => d.is_azeron);
if (firstAzeron && deviceSelectorEl) {
  const select = deviceSelectorEl.querySelector('select');
  if (select) {
    select.value = firstAzeron.path;
    selectedDevice = firstAzeron.path;
    statusEl.textContent = `Auto-selected: ${firstAzeron.name}`;
  }
}

// Auto-start monitoring when both device and layout are selected
if (selectedDevice && !monitoring) {
  await startMonitoring();
}

// Listen for button state events
unlisten = await listen<ButtonStateEvent>("button-state", (event) => {
  const { code, pressed } = event.payload;
  buttonGrid?.setButtonState(code, pressed);
  if (buttonGrid && !buttonGrid.hasButton(code)) {
    statusEl.textContent = `Unmatched code: ${code} (${pressed ? "press" : "release"}) — layout IDs don't match device`;
  }
});
```

### 2. button-grid.ts - Grid Rendering Logic

Location: `/home/anri/Documents/projects/dumbWASD/gui/src/button-grid.ts`

**Key Features:**
- Supports both grid-based and custom absolute positioning layouts
- Uses device.rows and device.cols for grid dimensions (prioritized over calculated bounds)
- Handles colspan/rowspan for multi-cell buttons (e.g., 2×2 joystick)
- Creates button elements with labels and event IDs
- Provides API for setting button state and clearing all states

**Grid Calculation Logic:**

```typescript
// Use the device-specified rows/cols if available, otherwise calculate from button positions
const useRows = layout.device.rows || 0;
const useCols = layout.device.cols || 0;

let minRow = Infinity, maxRow = -Infinity;
let minCol = Infinity, maxCol = -Infinity;

for (const btn of layout.buttons) {
  minRow = Math.min(minRow, btn.row!);
  maxRow = Math.max(maxRow, btn.row!);
  minCol = Math.min(minCol, btn.col!);
  maxCol = Math.max(maxCol, btn.col!);
}

const actualRows = useRows || (maxRow - minRow + 1);
const actualCols = useCols || (maxCol - minCol + 1);

const grid = document.createElement("div");
grid.className = "button-grid";
grid.style.gridTemplateRows = `repeat(${actualRows}, 1fr)`;
grid.style.gridTemplateColumns = `repeat(${actualCols}, 1fr)`;
```

**Colspan/Rowspan Support:**

```typescript
const rowStart = btn.row! - minRow + 1;
const colStart = btn.col! - minCol + 1;
const rowSpan = btn.rowspan || 1;
const colSpan = btn.colspan || 1;

el.style.gridRow = `${rowStart} / span ${rowSpan}`;
el.style.gridColumn = `${colStart} / span ${colSpan}`;
```

**Joystick Rendering:**

```typescript
if (btn.is_joystick) {
  el.innerHTML = `
    <div class="joystick-label">Keyboard Joystick</div>
    <div class="joystick-circle">
      <span class="joystick-dir joystick-w">W</span>
      <span class="joystick-dir joystick-a">A</span>
      <span class="joystick-dir joystick-s">S</span>
      <span class="joystick-dir joystick-d">D</span>
    </div>
    <div class="joystick-label-bottom">${btn.label}</div>
  `;
}
```

### 3. style.css - Visual Styling

Location: `/home/anri/Documents/projects/dumbWASD/gui/src/style.css`

**Key Features:**
- Dark theme with accent color (#0f7dff)
- Button glow effect on active state
- Connection indicator with pulse animation
- Joystick-specific styling
- Responsive grid layout

**Button Styling (Critical - DO NOT add fixed width/height):**

```css
.button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 70px;
  min-height: 90px;  /* Changed from 70px per user request */
  padding: 8px;
  background: var(--button-bg);
  border: 2px solid #3a3a5a;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-dim);
  transition: all 0.08s ease-out;
  user-select: none;
  position: relative;
}

.button.active {
  background: var(--button-active);
  border-color: var(--accent-glow);
  color: #fff;
  box-shadow:
    0 0 12px rgba(15, 125, 255, 0.5),
    0 0 24px rgba(15, 125, 255, 0.2);
  transform: scale(1.04);
}
```

**Joystick Styling (NO fixed width/height to allow grid spanning):**

```css
.button.joystick {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  background: var(--button-bg);
  border: 2px solid #3a3a5a;
  /* NO width or height! Let grid spanning control size */
}

.joystick-circle {
  position: relative;
  width: 80px;
  height: 80px;
  background: #0a0a0f;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**Connection Indicator States:**

```css
.connection-indicator.disconnected {
  color: #666;
}

.connection-indicator.connecting {
  color: #ffa500;
  animation: pulse 1.5s ease-in-out infinite;
}

.connection-indicator.connected {
  color: #00ff00;
  text-shadow: 0 0 8px rgba(0, 255, 0, 0.6);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

### 4. Layout Definition (azeron-cyborg.toml)

Location: `/home/anri/Documents/projects/dumbWASD/layouts/azeron-cyborg.toml`

**Structure:**

```toml
[device]
name = "Azeron LTD Azeron Keypad"
vendor_id = 5840
product_id = 4284
rows = 6  # Used to create 6-row grid
cols = 8  # Used to create 8-column grid

# Regular button (single cell)
[[buttons]]
id = 4
label = "Z"
row = 1
col = 1

# Joystick button (2×2 cells)
[[buttons]]
id = 24
label = "Left Stick"
row = 3
col = 6
colspan = 2
rowspan = 2
is_joystick = true
```

### 5. Backend Layout Structures

Location: `/home/anri/Documents/projects/dumbWASD/crates/dumbwasd-core/src/core/layout.rs`

**ButtonDef Structure:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ButtonDef {
    pub id: u16,  // evdev event code
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colspan: Option<u32>,  // For multi-cell buttons
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rowspan: Option<u32>,  // For multi-cell buttons
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_joystick: Option<bool>,
}
```

### 6. Tauri Backend Commands

Location: `/home/anri/Documents/projects/dumbWASD/gui/src-tauri/src/main.rs`

**Available Commands:**

```rust
#[tauri::command]
async fn list_devices() -> Result<Vec<DeviceEntry>, String>

#[tauri::command]
fn list_layouts() -> Result<Vec<String>, String>

#[tauri::command]
fn get_layout(name: String) -> Result<DeviceLayout, String>

#[tauri::command]
fn save_layout(name: String, layout: DeviceLayout) -> Result<String, String>

#[tauri::command]
async fn start_monitoring(
    device_path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, MonitorState>,
) -> Result<(), String>

#[tauri::command]
async fn stop_monitoring(state: tauri::State<'_, MonitorState>) -> Result<(), String>
```

**Environment Setup (important for finding layouts/profiles):**

```rust
// Resolve project root so layouts/profiles are found regardless of CWD.
// In dev mode, the Tauri CWD is gui/, so we go up one level.
if std::env::var_os("DUMBWASD_LAYOUTS_DIR").is_none() {
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    // CARGO_MANIFEST_DIR = gui/src-tauri, project root is two levels up
    let project_root = manifest.parent().and_then(|p| p.parent()).unwrap();
    std::env::set_var("DUMBWASD_LAYOUTS_DIR", project_root.join("layouts"));
    if std::env::var_os("DUMBWASD_PROFILES_DIR").is_none() {
        std::env::set_var("DUMBWASD_PROFILES_DIR", project_root.join("profiles"));
    }
}
```

## Common Issues and Fixes

### Issue 1: Joystick Button Not Spanning 2×2 Cells

**Problem:** Joystick appears as 1×1 or 1.5× size instead of proper 2×2 span.

**Root Cause:** Fixed `width` and `height` CSS properties on `.button.joystick` override grid spanning.

**Fix:** Remove any fixed width/height from `.button.joystick`. The grid span properties should control the size:

```css
/* WRONG - fixed dimensions prevent spanning */
.button.joystick {
  width: 120px;
  height: 180px;
}

/* CORRECT - let grid spanning control size */
.button.joystick {
  display: flex;
  flex-direction: column;
  /* NO width or height */
}
```

### Issue 2: Grid Not Using Full Column/Row Count

**Problem:** Grid calculates bounding box from button positions instead of using device.rows/cols.

**Root Cause:** Code calculated grid size from min/max button positions only.

**Fix:** Prioritize device.rows and device.cols from layout definition:

```typescript
const useRows = layout.device.rows || 0;
const useCols = layout.device.cols || 0;
const actualRows = useRows || (maxRow - minRow + 1);
const actualCols = useCols || (maxCol - minCol + 1);
```

### Issue 3: Connection Not Auto-Starting

**Problem:** User has to manually click to start monitoring.

**Root Cause:** Monitoring wasn't triggered when both device and layout were selected.

**Fix:** Auto-start monitoring in both device and layout selection handlers:

```typescript
// In device selector onChange
if (selectedLayout) {
  await startMonitoring();
}

// In layout selector onChange
if (selectedDevice) {
  await startMonitoring();
}
```

## How to Restore This Implementation

If you need to restore this working grid-based implementation after experimenting with React Flow or other approaches:

1. Restore [App.ts](gui/src/App.ts) from this version (lines 35-221)
2. Restore [button-grid.ts](gui/src/button-grid.ts) from this version (lines 1-159)
3. Restore [style.css](gui/src/style.css) from this version (lines 1-283)
4. Ensure backend files are unchanged:
   - [layout.rs](crates/dumbwasd-core/src/core/layout.rs)
   - [main.rs](gui/src-tauri/src/main.rs)
5. Run `npm run tauri dev` to start the application

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         App.ts                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Device     │  │    Layout    │  │   Connection    │   │
│  │   Selector   │  │   Selector   │  │   Indicator     │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              button-grid.ts                         │   │
│  │  createButtonGrid() → ButtonGrid interface          │   │
│  │                                                     │   │
│  │  ┌───────────────────────────────────────────┐     │   │
│  │  │    CSS Grid (rows × cols)                 │     │   │
│  │  │                                           │     │   │
│  │  │  [Btn] [Btn] [Btn]  [Joystick ]          │     │   │
│  │  │  [Btn] [Btn] [Btn]  [2x2 span]           │     │   │
│  │  │  [Btn] [Btn] [Btn] [Btn] [Btn]           │     │   │
│  │  └───────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                   Tauri Backend (Rust)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │list_devices  │  │ list_layouts │  │ get_layout   │     │
│  │list_layouts  │  │ start_monitor│  │ save_layout  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  Events: "button-state" { code, pressed }                  │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                    Device Input Backend                     │
│           (evdev on Linux, handles hardware)                │
└─────────────────────────────────────────────────────────────┘
```

## Testing the Implementation

1. **Start dev server:** `npm run tauri dev`
2. **Check auto-selection:** First Azeron device and first layout should be selected automatically
3. **Check auto-connection:** Connection indicator should turn green automatically
4. **Test button presses:** Press buttons on the device and verify they highlight in the UI
5. **Test joystick:** Verify joystick is 2×2 cells and W/A/S/D labels are visible
6. **Check button heights:** All buttons should have min-height of 90px
7. **Test reconnect:** Click Reconnect button if connection is lost

## Current Status

**Working Features:**
- ✅ Grid-based button rendering with colspan/rowspan
- ✅ Auto-select first Azeron device
- ✅ Auto-select default layout
- ✅ Auto-start monitoring when ready
- ✅ Real-time button state updates
- ✅ Connection status indicator with animations
- ✅ Joystick rendering with directional labels (2×2 span)
- ✅ Button event IDs displayed on each button
- ✅ 90px min-height for all buttons
- ✅ Reconnect functionality

**Not Yet Implemented:**
- ❌ Visual layout editor (drag-and-drop to rearrange buttons)
- ❌ Pan/zoom canvas for custom layouts
- ❌ Save modified layouts back to TOML files
- ❌ Custom absolute positioning mode

## Next Steps (React Flow Implementation)

The next step is to implement a React Flow-based visual editor that allows:
1. Pan and zoom the canvas
2. Drag buttons to rearrange them
3. Center view on the layout
4. Save modified layouts back to TOML files

This should be implemented in a separate file (`react-flow-editor.tsx`) and integrated as an optional "Edit Mode" in the application, keeping the current grid-based view as the default.
