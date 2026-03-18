# dumbWASD - Next Steps

## What We Just Accomplished

✅ **Fixed and ran azeron-linux** - Successfully built and launched the Electron app
✅ **Analyzed the UI** - Documented the interface design and user flow
✅ **Extracted assets** - Copied 1.2MB keypad image to `gui/src/assets/`
✅ **Created implementation plans** - 3 detailed docs for building Tauri GUI
✅ **Identified the advantage** - Multi-device support as key differentiator

## Project Status

### What Works (70% Complete)
- ✅ Azeron HID protocol implementation (string + binary)
- ✅ Button-to-key mapping system
- ✅ Profile loading/saving (TOML format)
- ✅ Linux evdev input reading
- ✅ Linux uinput output writing
- ✅ CLI interface with 10+ commands
- ✅ Device discovery and enumeration
- ✅ Tauri v2 GUI skeleton

### What's Missing (30% Remaining)
- ❌ Macro execution engine
- ❌ Multi-device input management
- ❌ Visual keypad interface (Tauri GUI)
- ❌ Button configuration UI
- ❌ Macro editor UI
- ❌ Live button feedback
- ❌ Profile switcher UI

## Key Documents Created

1. **[docs/TAURI_GUI_PLAN.md](docs/TAURI_GUI_PLAN.md)**
   - Full implementation plan for Tauri GUI
   - Component breakdown
   - 4-phase roadmap

2. **[docs/UI_DESIGN_REFERENCE.md](docs/UI_DESIGN_REFERENCE.md)**
   - Visual design from azeron-linux
   - Color scheme, layout, components
   - Implementation details

3. **[docs/MULTI_DEVICE_STRATEGY.md](docs/MULTI_DEVICE_STRATEGY.md)**
   - Your competitive advantage
   - Architecture for multiple input devices
   - Cross-device macro system

4. **[docs/azeron-protocol-reference.md](docs/azeron-protocol-reference.md)** *(already existed)*
   - Complete HID protocol documentation

## Immediate Next Steps (Priority Order)

### Step 1: Run Your Current Tauri App
```bash
cd /home/anri/Documents/projects/dumbWASD/gui
npm run tauri dev
```
**Goal:** See what you already have working

### Step 2: Implement Macro Engine (Backend)
**File:** `crates/dumbwasd-core/src/macros/engine.rs`

```rust
// Start with this basic structure
pub struct MacroEngine {
    running: HashMap<String, JoinHandle<()>>,
    output: Arc<Mutex<UInputDevice>>,
}

impl MacroEngine {
    pub async fn execute(&mut self, macro_def: &Macro) -> Result<()> {
        let output = self.output.clone();
        let steps = macro_def.steps.clone();

        let handle = tokio::spawn(async move {
            for step in steps {
                match step {
                    MacroStep::KeyDown(key) => {
                        output.lock().await.key_down(key)?;
                    }
                    MacroStep::Delay(duration) => {
                        tokio::time::sleep(duration).await;
                    }
                    // ... etc
                }
            }
        });

        self.running.insert(macro_def.id.clone(), handle);
        Ok(())
    }
}
```

**Test it:**
```bash
cd crates/dumbwasd-core
cargo test macros::tests
```

### Step 3: Build Visual Keypad Component (Frontend)
**File:** `gui/src/components/KeypadView.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';

export class KeypadView {
    private container: HTMLElement;
    private buttons: Map<number, HTMLElement>;

    constructor(container: HTMLElement) {
        this.container = container;
        this.buttons = new Map();
        this.render();
        this.subscribeToEvents();
    }

    render() {
        // Load keypad image
        const img = document.createElement('img');
        img.src = '/assets/azeron-keypad.png';
        img.style.width = '100%';
        this.container.appendChild(img);

        // Overlay clickable button regions
        // TODO: Map button coordinates
        for (let i = 0; i < 29; i++) {
            const btn = this.createButtonOverlay(i);
            this.buttons.set(i, btn);
            this.container.appendChild(btn);
        }
    }

    createButtonOverlay(id: number) {
        const btn = document.createElement('div');
        btn.className = 'button-overlay';
        btn.dataset.buttonId = id.toString();

        // Position based on button ID
        // TODO: Get coordinates from azeron-linux
        btn.style.position = 'absolute';
        btn.style.left = `${getButtonX(id)}px`;
        btn.style.top = `${getButtonY(id)}px`;

        btn.onclick = () => this.onButtonClick(id);
        return btn;
    }

    async onButtonClick(id: number) {
        const config = await invoke('get_button_config', { buttonId: id });
        this.showConfigModal(id, config);
    }

    subscribeToEvents() {
        listen('button-press', (event) => {
            const { button_id, state } = event.payload;
            this.highlightButton(button_id, state === 1);
        });
    }

    highlightButton(id: number, active: boolean) {
        const btn = this.buttons.get(id);
        if (btn) {
            btn.classList.toggle('active', active);
        }
    }
}
```

### Step 4: Add Live Button Feedback (Backend)
**File:** `gui/src-tauri/src/main.rs`

```rust
use tauri::Manager;

#[tauri::command]
async fn start_button_monitoring(window: tauri::Window) -> Result<()> {
    // Spawn background task
    tokio::spawn(async move {
        let mut device = AzeronDevice::open().await?;

        loop {
            if let Ok(event) = device.read_event().await {
                window.emit("button-press", ButtonEvent {
                    button_id: event.code,
                    state: event.value,
                })?;
            }
        }
    });

    Ok(())
}
```

### Step 5: Build Button Config Modal (Frontend)
**File:** `gui/src/components/ButtonConfigModal.ts`

```typescript
export class ButtonConfigModal {
    show(buttonId: number, currentConfig: ButtonConfig) {
        // Create modal HTML
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h2>Configure Button ${buttonId}</h2>

                    <label>Action Type:</label>
                    <select id="action-type">
                        <option value="key">Single Key</option>
                        <option value="combo">Key Combo</option>
                        <option value="mouse">Mouse Button</option>
                        <option value="macro">Macro</option>
                    </select>

                    <div id="action-config"></div>

                    <button onclick="saveConfig()">Save</button>
                    <button onclick="closeModal()">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }
}
```

## Testing Strategy

### 1. Unit Tests (Rust)
```bash
cd crates/dumbwasd-core
cargo test
```

### 2. Integration Tests
```bash
# Test device connection
cargo run --bin dumbwasd -- device info

# Test profile loading
cargo run --bin dumbwasd -- profile load test.toml

# Test macro execution
cargo run --bin dumbwasd -- macro run my_macro
```

### 3. GUI Testing
```bash
cd gui
npm run tauri dev
```
- Click buttons and verify configuration modal opens
- Press physical Azeron buttons and verify they light up
- Configure a button and save, verify it persists

## Timeline Estimate

### Week 1: Macro Engine
- Day 1-2: Design macro data structures
- Day 3-4: Implement executor in Rust
- Day 5: Add Tauri commands
- Day 6-7: Test with real device

### Week 2: Visual Interface
- Day 1-2: Build keypad visualization
- Day 3-4: Add button overlays and click handling
- Day 5: Implement live feedback
- Day 6-7: Polish animations and styling

### Week 3: Configuration UI
- Day 1-2: Build button config modal
- Day 3-4: Add macro editor
- Day 5: Implement profile manager
- Day 6-7: Testing and bug fixes

### Week 4: Multi-Device Support
- Day 1-2: Implement device manager
- Day 3-4: Update UI for multiple devices
- Day 5: Test cross-device macros
- Day 6-7: Documentation and polish

**Total: ~4 weeks to full feature parity + multi-device advantage**

## Resources

### Running azeron-linux for Reference
```bash
/tmp/azeron-linux/output/linux-unpacked/azeron-software-v1
```

### Your Codebase
```bash
cd /home/anri/Documents/projects/dumbWASD

# Backend
cd crates/dumbwasd-core
cargo build

# CLI
cd crates/dumbwasd-cli
cargo run -- --help

# GUI
cd gui
npm run tauri dev
```

### Documentation
- HID Protocol: `docs/azeron-protocol-reference.md`
- Device Data: `docs/azeron-device-data.md`
- GUI Plan: `docs/TAURI_GUI_PLAN.md`
- UI Design: `docs/UI_DESIGN_REFERENCE.md`
- Multi-Device: `docs/MULTI_DEVICE_STRATEGY.md`

## Decision Points

### Question 1: UI Style
- **Option A:** Match azeron-linux exactly (dark purple theme)
- **Option B:** Modern gaming theme (dark with accent colors)
- **Recommendation:** Start with Option A for familiarity, can always re-theme later

### Question 2: Macro Storage
- **Option A:** Store macros inside profile files
- **Option B:** Separate macro library + references in profiles
- **Recommendation:** Option B for reusability across profiles

### Question 3: Multi-Device Priority
- **Option A:** Build full GUI first, add multi-device later
- **Option B:** Add multi-device support now, then build GUI around it
- **Recommendation:** Option A - get feature parity first, then differentiate

## Success Metrics

### MVP (Minimum Viable Product)
- [ ] App launches and connects to Azeron
- [ ] Shows visual keypad
- [ ] Buttons light up when pressed
- [ ] Can configure simple key mappings
- [ ] Can save/load profiles
- **Target: 2 weeks**

### V1.0 (Feature Parity)
- [ ] All azeron-linux features working
- [ ] Macro recording and playback
- [ ] Profile switching
- [ ] Settings panel
- **Target: 3 weeks**

### V2.0 (Differentiation)
- [ ] Multi-device input support
- [ ] Cross-device macros
- [ ] Advanced scripting
- **Target: 4 weeks**

## Getting Help

**Stuck on something?** Check these resources:

1. **Tauri Docs:** https://v2.tauri.app/
2. **evdev Rust:** https://docs.rs/evdev/
3. **hidapi Rust:** https://docs.rs/hidapi/
4. **Your own docs:** Read the markdown files in `docs/`

## Let's Go! 🚀

You now have:
- ✅ A working reference app (azeron-linux)
- ✅ A solid Rust backend (70% done)
- ✅ Clear implementation plans
- ✅ Visual assets (keypad image)
- ✅ A unique advantage (multi-device)

**Start with Step 1 above** and work through the list. You'll have a production-ready app in ~4 weeks!
