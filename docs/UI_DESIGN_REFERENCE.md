# UI Design Reference - From azeron-linux

## Screenshots Analysis

Based on the azeron-linux app running, here's what we need to replicate:

## Main Layout

```
┌─────────────────────────────────────────────────────┐
│  [Azeron Logo]                                      │
│  ┌──────────┐                                       │
│  │ PROFILES │  ← Grid icon (4x4)                    │
│  └──────────┘                                       │
│  ┌──────────┐                                       │
│  │ SETTINGS │  ← Sliders icon                       │
│  └──────────┘                                       │
│  ┌──────────┐                                       │
│  │COMMUNITY │  ← Dragon icon                        │
│  └──────────┘                                       │
│                                                     │
│                 Main Content Area                   │
│                                                     │
│              [Azeron Logo]                          │
│              connecting...                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Color Scheme

**Primary Colors:**
- Background: `#0a0a0f` (Very dark blue/black)
- Sidebar: `#1a1a2e` (Dark purple/blue)
- Accent: `#6c5ce7` (Purple - for selected items)
- Text: `#ffffff` (White)
- Secondary text: `#a0a0b0` (Light gray)

**Key Observations:**
1. **Left sidebar is fixed** - navigation stays consistent
2. **Dark theme throughout** - modern gaming aesthetic
3. **Loading state** - "connecting..." shows while device connects
4. **Single device focus** - designed for ONE Azeron device at a time

## User Flow

### 1. App Startup
```
Launch App
    ↓
Show "connecting..." splash
    ↓
Detect Azeron device via HID
    ↓
Load device profile
    ↓
Display main keypad view
```

### 2. Profile View (Main Screen)
Once connected, user sees:
- **Visual keypad image** with clickable buttons
- **Button assignments** shown on each button
- **Analog stick visualization**
- **Active profile name** at top
- **Quick edit panel** when button clicked

### 3. Settings View
- Device firmware info
- LED settings
- Analog sensitivity
- DPI configuration
- Auto-start options

### 4. Community View
- Shared profiles from other users
- Import/Export functionality

## Key Features Per View

### Profiles View (Main)
- [ ] Large keypad visualization
- [ ] Buttons light up on press (live feedback)
- [ ] Click button to configure
- [ ] Show current mapping on each button
- [ ] Analog stick with deadzone indicator
- [ ] Profile switcher dropdown
- [ ] Save/Load profile buttons

### Button Configuration Panel
When you click a button, show modal/sidebar with:
- [ ] Button name/number
- [ ] Action type dropdown:
  - Single Key
  - Key Combo (Ctrl+C, etc.)
  - Mouse Button
  - Macro
  - Analog Toggle
  - Profile Switch
- [ ] Click type selector:
  - Single Click
  - Double Click
  - Long Press
- [ ] Test button (sends the action)

### Macro Editor
- [ ] Macro name input
- [ ] Step list:
  ```
  1. Key Down: Left Shift
  2. Delay: 100ms
  3. Key Down: A
  4. Delay: 50ms
  5. Key Up: A
  6. Key Up: Left Shift
  ```
- [ ] Add step button (+)
- [ ] Delete step button (×)
- [ ] Record button (captures live input)
- [ ] Play/Test button

### Settings View
- [ ] **Device Info:**
  - Model: Azeron Cyborg
  - Firmware: v1.2.3
  - Serial: ABC123

- [ ] **LED Settings:**
  - Effect: Static/Breathing/Rainbow
  - Color picker
  - Brightness slider

- [ ] **Analog Settings:**
  - Sensitivity slider
  - Deadzone slider
  - Invert X/Y checkboxes

- [ ] **Application:**
  - Auto-start on boot
  - Minimize to tray
  - Check for updates

## Important Design Notes

> **One Device, Multiple Profiles**
>
> The azeron-linux app is designed for a SINGLE Azeron device but supports multiple software profiles:
> - Gaming profile (WASD, mouse buttons)
> - Editing profile (Photoshop shortcuts)
> - Programming profile (VS Code shortcuts)
>
> User can quickly switch between profiles without reconfiguring hardware.

## Tauri Implementation Strategy

### Phase 1: Basic Layout
```typescript
// App.ts structure
class AzeronApp {
  sidebar: Sidebar;
  mainView: ProfileView | SettingsView | CommunityView;
  deviceStatus: DeviceStatus;

  constructor() {
    this.renderSidebar();
    this.renderMainView();
    this.connectToDevice();
  }

  async connectToDevice() {
    this.showConnecting();
    const device = await invoke('connect_device');
    this.loadProfile();
    this.showKeypad();
  }
}
```

### Phase 2: Live Button Feedback
```typescript
// Listen to button events from Rust backend
listen('button-press', (event) => {
  const button = event.payload;
  highlightButton(button.id, true);
  setTimeout(() => highlightButton(button.id, false), 100);
});
```

### Phase 3: Configuration
```typescript
// When user clicks a button
function onButtonClick(buttonId: number) {
  showConfigPanel({
    buttonId,
    currentMapping: getButtonMapping(buttonId),
    onSave: (newMapping) => {
      invoke('update_button_mapping', {
        buttonId,
        mapping: newMapping
      });
    }
  });
}
```

## Asset Requirements

### Images Needed
- [x] Keypad base image: `azeron-keypad.png` (1.2MB, already copied)
- [ ] Button overlay SVGs (for highlighting)
- [ ] Analog stick visualization
- [ ] Azeron logo SVG

### Icons Needed
- [x] Profiles icon (grid 2x2)
- [x] Settings icon (sliders)
- [x] Community icon (dragon)
- [ ] Plus icon (add macro step)
- [ ] Trash icon (delete)
- [ ] Play icon (test macro)
- [ ] Record icon (record macro)

## Responsive Considerations

**Minimum Window Size:** 1280x720
- Sidebar: 94px fixed width
- Main area: Remaining space (1186px at minimum)
- Keypad image scales to fit

**No mobile support** - This is a desktop-only app for PC gamers

## Next Implementation Steps

1. **Create base Tauri layout:**
   ```bash
   cd gui
   npm run tauri dev
   ```

2. **Build sidebar component:**
   - Logo at top
   - 3 navigation buttons
   - Active state highlighting

3. **Build connecting screen:**
   - Center logo + "connecting..."
   - Spinner animation

4. **Build keypad view:**
   - Load azeron-keypad.png
   - Overlay clickable button regions
   - Add button labels

5. **Implement device connection:**
   - Tauri command to enumerate HID devices
   - Connect to Azeron interface 4
   - Load default profile

6. **Add live feedback:**
   - Stream button events from Rust
   - Highlight buttons on press
   - Show analog stick movement

## Technical Notes

- **Framework:** Vanilla TypeScript (no React - keep it lightweight)
- **Styling:** CSS with CSS Variables for theming
- **State Management:** Simple object-based state (no Redux/Vuex needed)
- **Image Handling:** SVG overlays on PNG base for button regions
- **Animation:** CSS transitions for button highlights (smooth 60fps)

## Keyboard Shortcuts (Future)

- `Ctrl+S` - Save current profile
- `Ctrl+N` - New profile
- `Ctrl+O` - Open profile
- `F5` - Reload device
- `Esc` - Close config panel
