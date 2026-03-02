import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createDeviceSelector } from "./device-selector";
import { createButtonGrid, type ButtonGrid } from "./button-grid";
import { createLayoutEditor } from "./react-flow-editor";

interface DeviceEntry {
  paths: string[];
  name: string;
  vendor_id: number;
  product_id: number;
  is_azeron: boolean;
}

interface DeviceLayout {
  device: {
    name: string;
    vendor_id: number;
    product_id: number;
    rows: number;
    cols: number;
  };
  buttons: Array<{
    id: number;
    label: string;
    row: number;
    col: number;
  }>;
}

interface ButtonStateEvent {
  code: number;
  pressed: boolean;
}

export async function createApp(container: HTMLElement) {
  container.innerHTML = `
    <header class="toolbar">
      <h1>dumbWASD</h1>
      <div class="selectors">
        <div id="device-selector"></div>
        <div id="layout-selector"></div>
      </div>
      <button id="btn-toggle-mode" class="btn">Edit Mode</button>
    </header>
    <main id="grid-container"></main>
    <div id="event-log-container" class="event-log-container" style="display: none;">
      <div class="event-log-header">
        <span>Event Log</span>
        <button id="btn-clear-log" class="btn btn-small">Clear</button>
      </div>
      <div id="event-log" class="event-log"></div>
    </div>
    <footer class="status-bar">
      <span id="connection-indicator" class="connection-indicator disconnected" title="Disconnected">●</span>
      <span id="status">Connecting...</span>
      <button id="btn-reconnect" class="btn" style="display: none;">Reconnect</button>
    </footer>
  `;

  const reconnectBtn = container.querySelector<HTMLButtonElement>("#btn-reconnect")!;
  const toggleModeBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-mode")!;
  const gridContainer = container.querySelector<HTMLElement>("#grid-container")!;
  const statusEl = container.querySelector<HTMLElement>("#status")!;
  const connectionIndicator = container.querySelector<HTMLElement>("#connection-indicator")!;
  const eventLogContainer = container.querySelector<HTMLElement>("#event-log-container")!;
  const eventLog = container.querySelector<HTMLElement>("#event-log")!;
  const clearLogBtn = container.querySelector<HTMLButtonElement>("#btn-clear-log")!;

  // Common evdev key code names for display
  const EVDEV_NAMES: Record<number, string> = {
    1:"ESC",2:"1",3:"2",4:"3",5:"4",6:"5",7:"6",8:"7",9:"8",10:"9",11:"0",
    12:"-",13:"=",14:"BACKSPACE",15:"TAB",16:"Q",17:"W",18:"E",19:"R",20:"T",
    21:"Y",22:"U",23:"I",24:"O",25:"P",26:"[",27:"]",28:"ENTER",29:"L_CTRL",
    30:"A",31:"S",32:"D",33:"F",34:"G",35:"H",36:"J",37:"K",38:"L",39:";",
    40:"'",41:"`",42:"L_SHIFT",43:"\\",44:"Z",45:"X",46:"C",47:"V",48:"B",
    49:"N",50:"M",51:",",52:".",53:"/",54:"R_SHIFT",56:"L_ALT",57:"SPACE",
    58:"CAPSLOCK",59:"F1",60:"F2",61:"F3",62:"F4",63:"F5",64:"F6",65:"F7",
    66:"F8",67:"F9",68:"F10",69:"NUMLOCK",87:"F11",88:"F12",96:"NUMPAD_ENTER",
    97:"R_CTRL",100:"R_ALT",103:"UP",105:"LEFT",106:"RIGHT",108:"DOWN",
    110:"INSERT",111:"DELETE",113:"MUTE",114:"VOL_DOWN",115:"VOL_UP",
    272:"MOUSE_L",273:"MOUSE_R",274:"MOUSE_M",275:"MOUSE_4",276:"MOUSE_5",
  };

  clearLogBtn.addEventListener("click", () => {
    eventLog.innerHTML = "";
  });

  function addEventLogEntry(code: number, pressed: boolean) {
    const name = EVDEV_NAMES[code] || `?`;
    const action = pressed ? "PRESS" : "RELEASE";
    const entry = document.createElement("div");
    entry.className = `event-entry ${pressed ? "event-press" : "event-release"}`;
    entry.textContent = `${name} (${code}) ${action}`;
    eventLog.appendChild(entry);
    // Keep scrolled to bottom
    eventLog.scrollTop = eventLog.scrollHeight;
    // Limit to 100 entries
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  let selectedDevice: DeviceEntry | null = null;
  let selectedLayout: string | null = null;
  let currentLayout: DeviceLayout | null = null;
  let monitoring = false;
  let buttonGrid: ButtonGrid | null = null;
  let layoutEditor: any = null;
  let unlisten: (() => void) | null = null;
  let isEditMode = false;

  // Load devices
  const deviceSelectorEl = container.querySelector<HTMLElement>("#device-selector")!;
  let devices: DeviceEntry[] = [];
  try {
    devices = await invoke<DeviceEntry[]>("list_devices");
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  createDeviceSelector(deviceSelectorEl, {
    label: "Device",
    items: devices.map((d, i) => ({
      value: String(i),
      label: `${d.name}${d.is_azeron ? " [Azeron]" : ""}`,
      detail: `${d.paths.length} interface(s)`,
    })),
    async onChange(value) {
      selectedDevice = devices[Number(value)] ?? null;
      if (selectedDevice) {
        statusEl.textContent = `Device: ${selectedDevice.name}`;
      }

      // If already monitoring, restart with new device
      if (monitoring) {
        await stopMonitoring();
      }

      // Auto-start monitoring whenever a device is selected
      await startMonitoring();
    },
  });

  // Auto-select first Azeron device if available
  const firstAzeronIdx = devices.findIndex(d => d.is_azeron);
  if (firstAzeronIdx >= 0 && deviceSelectorEl) {
    const select = deviceSelectorEl.querySelector('select');
    if (select) {
      select.value = String(firstAzeronIdx);
      selectedDevice = devices[firstAzeronIdx];
      statusEl.textContent = `Auto-selected: ${selectedDevice.name}`;
      // Auto-start monitoring immediately
      await startMonitoring();
    }
  }

  // Load layouts
  const layoutSelectorEl = container.querySelector<HTMLElement>("#layout-selector")!;
  let layouts: string[] = [];
  try {
    layouts = await invoke<string[]>("list_layouts");
  } catch (e) {
    statusEl.textContent = `Error loading layouts: ${e}`;
  }

  createDeviceSelector(layoutSelectorEl, {
    label: "Layout",
    items: layouts.map((name) => ({ value: name, label: name })),
    async onChange(value) {
      selectedLayout = value;
      await loadLayout(value);

      // If already monitoring, restart with new layout
      if (monitoring) {
        await stopMonitoring();
      }

      // Auto-start monitoring if device is already selected
      if (selectedDevice) {
        await startMonitoring();
      }
    },
  });

  // Auto-select first layout if available
  if (layouts.length > 0) {
    const select = layoutSelectorEl.querySelector('select');
    if (select) {
      const defaultLayout = layouts.find(l => l.includes('azeron') || l.includes('cyborg')) || layouts[0];
      select.value = defaultLayout;
      selectedLayout = defaultLayout;
      await loadLayout(defaultLayout);
    }
  }

  async function loadLayout(name: string) {
    try {
      const layout = await invoke<DeviceLayout>("get_layout", { name });
      currentLayout = layout;

      if (isEditMode) {
        renderEditMode();
      } else {
        renderViewMode();
      }

      statusEl.textContent = `Layout: ${layout.device.name} (${layout.buttons.length} buttons)`;
    } catch (e) {
      statusEl.textContent = `Error loading layout: ${e}`;
      buttonGrid = null;
      layoutEditor = null;
    }
  }

  function renderViewMode() {
    if (!currentLayout) return;

    // Destroy editor first before clearing container
    if (layoutEditor) {
      try {
        layoutEditor.destroy();
      } catch (e) {
        console.warn('Error destroying layout editor:', e);
      }
      layoutEditor = null;
    }

    // Clear container
    gridContainer.innerHTML = "";

    // Create grid view
    buttonGrid = createButtonGrid(gridContainer, currentLayout);
  }

  function renderEditMode() {
    if (!currentLayout) return;

    // Clear container
    gridContainer.innerHTML = "";
    buttonGrid = null;

    // Set full height for React Flow
    gridContainer.style.height = "100%";

    // Create React Flow editor
    layoutEditor = createLayoutEditor(gridContainer, currentLayout, {
      onSave: async (updatedLayout) => {
        console.log('[App.ts] ========== onSave CALLBACK INVOKED ==========');
        console.log('[App.ts] selectedLayout:', selectedLayout);
        console.log('[App.ts] updatedLayout device name:', updatedLayout.device.name);
        console.log('[App.ts] updatedLayout layout_type:', updatedLayout.device.layout_type);
        console.log('[App.ts] updatedLayout button count:', updatedLayout.buttons.length);

        try {
          console.log('[App.ts] Invoking save_layout command...');
          const result = await invoke("save_layout", {
            name: selectedLayout,
            layout: updatedLayout
          });
          console.log('[App.ts] save_layout returned:', result);
          statusEl.textContent = "Layout saved successfully!";

          // Reload the layout from disk to get the saved version
          if (selectedLayout) {
            console.log('[App.ts] Reloading layout from disk...');
            const reloadedLayout = await invoke<DeviceLayout>("get_layout", { name: selectedLayout });
            currentLayout = reloadedLayout;
            console.log('[App.ts] Layout reloaded');
          }
        } catch (e) {
          console.error('[App.ts] Error saving layout:', e);
          statusEl.textContent = `Error saving layout: ${e}`;
        }
      },
    });
  }

  // Toggle between View and Edit modes
  toggleModeBtn.addEventListener("click", () => {
    isEditMode = !isEditMode;
    toggleModeBtn.textContent = isEditMode ? "View Mode" : "Edit Mode";

    if (currentLayout) {
      if (isEditMode) {
        renderEditMode();
      } else {
        renderViewMode();
      }
    }
  });

  reconnectBtn.addEventListener("click", async () => {
    // Reconnect: stop and restart monitoring
    if (monitoring) {
      await stopMonitoring();
    }
    if (selectedDevice) {
      await startMonitoring();
    }
  });

  async function startMonitoring() {
    if (!selectedDevice) return;

    try {
      connectionIndicator.className = "connection-indicator connecting";
      connectionIndicator.title = "Connecting...";
      statusEl.textContent = "Connecting...";

      await invoke("start_monitoring", { devicePaths: selectedDevice.paths });
      monitoring = true;
      reconnectBtn.style.display = "none";

      connectionIndicator.className = "connection-indicator connected";
      connectionIndicator.title = "Connected";
      statusEl.textContent = `Monitoring ${selectedDevice.name} (${selectedDevice.paths.length} interface${selectedDevice.paths.length > 1 ? "s" : ""})`;

      // Show event log
      eventLogContainer.style.display = "flex";

      unlisten = await listen<ButtonStateEvent>("button-state", (event) => {
        const { code, pressed } = event.payload;

        // Always log to the event panel
        addEventLogEntry(code, pressed);

        // Update grid view if active
        if (buttonGrid) {
          buttonGrid.setButtonState(code, pressed);
        }

        // Update React Flow editor if active
        if (layoutEditor) {
          layoutEditor.setButtonState(code, pressed);
        }
      });
    } catch (e) {
      connectionIndicator.className = "connection-indicator disconnected";
      connectionIndicator.title = "Disconnected";
      statusEl.textContent = `Connection error: ${e}`;
      reconnectBtn.style.display = "inline-block";
    }
  }

  async function stopMonitoring() {
    try {
      await invoke("stop_monitoring");
    } catch (_) {
      // ignore
    }

    monitoring = false;
    connectionIndicator.className = "connection-indicator disconnected";
    connectionIndicator.title = "Disconnected";
    statusEl.textContent = "Disconnected";
    reconnectBtn.style.display = "inline-block";
    eventLogContainer.style.display = "none";
    buttonGrid?.clearAll();

    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  }
}
