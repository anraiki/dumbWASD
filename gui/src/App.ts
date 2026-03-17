import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createDeviceSelector } from "./device-selector";
import { createButtonGrid, type ButtonGrid } from "./button-grid";
import { createLayoutEditor } from "./react-flow-editor";
import { createProfileDrawer } from "./profile-drawer";
import { createDeviceBar, type ProfileDevice, type ProfileDeviceKind } from "./device-bar";
import { showDeviceModal, type DeviceEntry } from "./device-modal";
import { showDeviceContextMenu } from "./device-context-menu";
import { showDeleteDeviceDialog } from "./device-delete-dialog";
import { createMacroStudio } from "./macro-studio";

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

interface ProfileMeta {
  name: string;
  device_name?: string;
}

interface Profile {
  profile: ProfileMeta;
  devices: ProfileDevice[];
  mappings: Array<{
    device?: string;
    from: number;
    to: { type: string; code: number };
  }>;
}

interface ButtonStateEvent {
  code: number;
  pressed: boolean;
  device_path: string;
  device_name: string;
}

interface AxisStateEvent {
  axis: number;
  value: number;
  device_path: string;
  device_name: string;
}

interface MonitoringRequest {
  devicePaths: string[];
  label: string;
}

const MOUSE_BUTTON_CODES = new Set([272, 273, 274, 275, 276]);

export async function createApp(container: HTMLElement) {
  const appWindow = getCurrentWindow();

  container.innerHTML = `
    <div class="loading-overlay" id="loading-overlay">
      <div class="loading-spinner"></div>
      <span>Loading profiles...</span>
    </div>
    <div class="window-shell">
      <header class="titlebar" id="app-titlebar">
        <div class="titlebar-main">
          <button
            id="btn-hamburger"
            class="btn-hamburger titlebar-hamburger"
            type="button"
            title="Profiles"
            aria-label="Toggle profiles drawer"
            data-titlebar-action="drawer"
          >
            <span></span><span></span><span></span>
          </button>
          <div class="titlebar-brand">
            <span class="titlebar-mark" aria-hidden="true"></span>
            <span class="titlebar-title" id="window-title">dumbWASD</span>
          </div>
        </div>
        <div class="window-controls">
          <button
            id="btn-window-minimize"
            class="window-control"
            type="button"
            title="Minimize"
            aria-label="Minimize window"
            data-window-control="minimize"
          >
            <span class="window-control-icon minimize" aria-hidden="true"></span>
          </button>
          <button
            id="btn-window-maximize"
            class="window-control"
            type="button"
            title="Maximize"
            aria-label="Maximize window"
            data-window-control="maximize"
          >
            <span class="window-control-icon maximize" aria-hidden="true"></span>
          </button>
          <button
            id="btn-window-close"
            class="window-control window-control-close"
            type="button"
            title="Close"
            aria-label="Close window"
            data-window-control="close"
          >
            <span class="window-control-icon close" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="window-body">
        <aside class="profile-drawer" id="profile-drawer">
          <div class="drawer-header">
            <span class="drawer-title">Profiles</span>
          </div>
          <ul id="profile-list" class="profile-list">
            <li id="btn-add-profile" class="profile-item profile-add-btn">Add a Profile (+)</li>
          </ul>
        </aside>
        <div class="main-area">
          <header class="toolbar">
            <div class="selectors">
              <div id="layout-selector"></div>
            </div>
            <button id="btn-toggle-mode" class="btn">Edit Mode</button>
            <button id="btn-toggle-overlay" class="btn">Overlay</button>
            <button id="btn-toggle-macros" class="btn">Macros</button>
            <button id="btn-reconnect" class="btn" style="display: none;">Reconnect</button>
          </header>
          <main id="grid-container"></main>
          <div id="event-log-container" class="event-log-container" style="display: none;">
            <div class="event-log-header">
              <span>Event Log</span>
              <div class="event-log-controls">
                <label class="event-log-toggle" for="toggle-listen-all-devices">
                  <input id="toggle-listen-all-devices" type="checkbox" />
                  <span>All devices</span>
                </label>
                <button id="btn-clear-log" class="btn btn-small">Clear</button>
              </div>
            </div>
            <div id="event-log" class="event-log"></div>
          </div>
          <div class="device-bar" id="device-bar">
            <div id="device-chips" class="device-chips"></div>
            <button id="btn-add-device" class="btn btn-icon" title="Add Device">+</button>
          </div>
          <div class="action-bar">
            <button class="btn btn-action" disabled title="Not implemented yet">Apply to Slot</button>
            <button class="btn btn-action" disabled title="Not implemented yet">Power Off</button>
          </div>
          <footer class="status-bar">
            <span id="connection-indicator" class="connection-indicator disconnected" title="Disconnected">&#x25CF;</span>
            <span id="status">Select a profile...</span>
          </footer>
        </div>
      </div>
    </div>
  `;

  // ── DOM refs ──
  const titleBar = container.querySelector<HTMLElement>("#app-titlebar")!;
  const windowTitleEl = container.querySelector<HTMLElement>("#window-title")!;
  const minimizeWindowBtn = container.querySelector<HTMLButtonElement>("#btn-window-minimize")!;
  const maximizeWindowBtn = container.querySelector<HTMLButtonElement>("#btn-window-maximize")!;
  const closeWindowBtn = container.querySelector<HTMLButtonElement>("#btn-window-close")!;
  const reconnectBtn = container.querySelector<HTMLButtonElement>("#btn-reconnect")!;
  const toggleModeBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-mode")!;
  const gridContainer = container.querySelector<HTMLElement>("#grid-container")!;
  const statusEl = container.querySelector<HTMLElement>("#status")!;
  const connectionIndicator = container.querySelector<HTMLElement>("#connection-indicator")!;
  const eventLogContainer = container.querySelector<HTMLElement>("#event-log-container")!;
  const eventLog = container.querySelector<HTMLElement>("#event-log")!;
  const clearLogBtn = container.querySelector<HTMLButtonElement>("#btn-clear-log")!;
  const listenAllDevicesToggle = container.querySelector<HTMLInputElement>("#toggle-listen-all-devices")!;
  const actionBar = container.querySelector<HTMLElement>(".action-bar")!;

  const profileListEl = container.querySelector<HTMLUListElement>("#profile-list")!;
  const addProfileBtn = container.querySelector<HTMLElement>("#btn-add-profile")!;
  const deviceChipsEl = container.querySelector<HTMLElement>("#device-chips")!;
  const addDeviceBtn = container.querySelector<HTMLButtonElement>("#btn-add-device")!;
  const hamburgerBtn = container.querySelector<HTMLButtonElement>("#btn-hamburger")!;
  const overlayBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-overlay")!;
  const macroBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-macros")!;
  const macroStudio = createMacroStudio();

  async function syncWindowChrome() {
    try {
      windowTitleEl.textContent = await appWindow.title();
      const maximized = await appWindow.isMaximized();
      maximizeWindowBtn.classList.toggle("is-maximized", maximized);
      maximizeWindowBtn.title = maximized ? "Restore" : "Maximize";
      maximizeWindowBtn.setAttribute("aria-label", maximized ? "Restore window" : "Maximize window");
    } catch (e) {
      statusEl.textContent = `Window chrome error: ${e}`;
    }
  }

  // Fire-and-forget keeps GTK dragging reliable on Linux.
  titleBar.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.detail > 1) return;
    if ((event.target as HTMLElement).closest("[data-window-control], [data-titlebar-action]")) return;
    event.preventDefault();
    void appWindow.startDragging();
  });

  titleBar.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("[data-window-control], [data-titlebar-action]")) return;
    void appWindow.toggleMaximize().then(syncWindowChrome);
  });

  minimizeWindowBtn.addEventListener("click", () => {
    void appWindow.minimize();
  });

  maximizeWindowBtn.addEventListener("click", () => {
    void appWindow.toggleMaximize().then(syncWindowChrome);
  });

  closeWindowBtn.addEventListener("click", () => {
    void appWindow.close();
  });

  const unlistenWindowResize = await appWindow.onResized(() => {
    void syncWindowChrome();
  });

  window.addEventListener("beforeunload", () => {
    unlistenWindowResize();
  }, { once: true });

  await syncWindowChrome();

  // ── Overlay toggle ──
  overlayBtn.addEventListener("click", async () => {
    try {
      const opened = await invoke<boolean>("toggle_overlay");
      overlayBtn.classList.toggle("active", opened);
    } catch (e) {
      statusEl.textContent = `Overlay error: ${e}`;
    }
  });

  // ── Drawer toggle ──
  let drawerOpen = false;

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
    container.classList.toggle("drawer-open", drawerOpen);
    hamburgerBtn.classList.toggle("active", drawerOpen);
  }

  hamburgerBtn.addEventListener("click", toggleDrawer);

  // ── Evdev key names ──
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

  const REL_AXIS_NAMES: Record<number, string> = {
    0: "REL_X",
    1: "REL_Y",
    6: "REL_HWHEEL",
    8: "REL_WHEEL",
    11: "REL_WHEEL_HI_RES",
    12: "REL_HWHEEL_HI_RES",
  };
  const IGNORED_LOG_AXES = new Set([0, 1]);

  clearLogBtn.addEventListener("click", () => {
    eventLog.innerHTML = "";
  });

  function findDeviceEntryByPath(path: string): DeviceEntry | null {
    return allDevices.find((device) => device.paths.includes(path)) ?? null;
  }

  function addEventLogEntry(code: number, pressed: boolean, devicePath?: string, deviceName?: string) {
    const name = EVDEV_NAMES[code] || `?`;
    const action = pressed ? "PRESS" : "RELEASE";
    const sourceEntry = devicePath ? findDeviceEntryByPath(devicePath) : null;
    const sourceLabel = deviceName || sourceEntry?.name || devicePath || "Unknown device";
    const entry = document.createElement("div");
    entry.className = `event-entry ${pressed ? "event-press" : "event-release"}`;
    entry.textContent = `${sourceLabel} · ${name} (${code}) ${action}`;
    if (devicePath) {
      entry.title = devicePath;
    }
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  function addAxisLogEntry(axis: number, value: number, devicePath?: string, deviceName?: string) {
    const name = REL_AXIS_NAMES[axis] || `REL_${axis}`;
    const sourceEntry = devicePath ? findDeviceEntryByPath(devicePath) : null;
    const sourceLabel = deviceName || sourceEntry?.name || devicePath || "Unknown device";
    const entry = document.createElement("div");
    entry.className = "event-entry event-axis";
    entry.textContent = `${sourceLabel} · ${name} (${axis}) value ${value}`;
    if (devicePath) {
      entry.title = devicePath;
    }
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  listenAllDevicesToggle.addEventListener("change", async () => {
    listenAllDevices = listenAllDevicesToggle.checked;
    await syncMonitoringScope(true);
  });

  // ── State ──
  let currentProfileName: string | null = null;
  let currentProfile: Profile | null = null;
  let selectedDeviceInBar: ProfileDevice | null = null;
  let selectedLayout: string | null = null;
  let currentLayout: DeviceLayout | null = null;
  let monitoring = false;
  let buttonGrid: ButtonGrid | null = null;
  let layoutEditor: any = null;
  let unlistenButtonState: (() => void) | null = null;
  let unlistenAxisState: (() => void) | null = null;
  let isEditMode = false;
  let isMacroMode = false;
  let listenAllDevices = false;
  let monitoredPathsKey = "";
  let closeDeviceContextMenu: (() => void) | null = null;

  // Cache system devices at startup
  let allDevices: DeviceEntry[] = [];
  try {
    allDevices = await invoke<DeviceEntry[]>("list_devices");
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  // Find a system DeviceEntry by VID:PID
  function findDeviceEntry(vid: number, pid: number): DeviceEntry | null {
    return allDevices.find(d => d.vendor_id === vid && d.product_id === pid) ?? null;
  }

  function getProfileDeviceKind(entry: DeviceEntry | null): ProfileDeviceKind | undefined {
    if (!entry) return undefined;
    if (entry.is_azeron) return "azeron";
    if (entry.has_mouse) return "mouse";
    if (entry.has_gamepad) return "gamepad";
    if (entry.has_keyboard) return "keyboard";
    return undefined;
  }

  function hydrateProfileDevices(devices: ProfileDevice[]): ProfileDevice[] {
    return devices.map((device) => {
      if (device.device_kind) return device;
      const device_kind = getProfileDeviceKind(
        findDeviceEntry(device.vendor_id, device.product_id)
      );
      return device_kind ? { ...device, device_kind } : device;
    });
  }

  function isSameProfileDevice(a: ProfileDevice | null, b: ProfileDevice | null): boolean {
    if (!a || !b) return false;
    return a.vendor_id === b.vendor_id && a.product_id === b.product_id;
  }

  function getAllMonitoredPaths(): string[] {
    return [...new Set(allDevices.flatMap((device) => device.paths))];
  }

  function buildMonitoringRequest(): MonitoringRequest | null {
    if (isMacroMode) {
      const keyboardPaths = allDevices
        .filter((device) => device.has_keyboard)
        .flatMap((device) => device.paths);

      const curatedPaths = currentProfile
        ? currentProfile.devices.flatMap((device) => {
            const entry = findDeviceEntry(device.vendor_id, device.product_id);
            return entry ? entry.paths : [];
          })
        : [];

      const devicePaths = [...new Set([...keyboardPaths, ...curatedPaths])];
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "Keyboards + curated gamepads",
      };
    }

    if (listenAllDevices) {
      const devicePaths = getAllMonitoredPaths();
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "All detected devices",
      };
    }

    if (!selectedDeviceInBar) return null;

    const entry = findDeviceEntry(selectedDeviceInBar.vendor_id, selectedDeviceInBar.product_id);
    if (!entry) return null;

    return {
      devicePaths: entry.paths,
      label: entry.name,
    };
  }

  async function syncMonitoringScope(force = false) {
    const request = buildMonitoringRequest();
    const nextKey = request ? [...request.devicePaths].sort().join("|") : "";

    if (!request) {
      if (monitoring) {
        await stopMonitoring();
      } else {
        monitoredPathsKey = "";
        macroStudio.setMonitoringActive(false);
        syncAuxPanels();
      }
      return;
    }

    if (!force && monitoring && nextKey === monitoredPathsKey) {
      macroStudio.setMonitoringActive(true);
      syncAuxPanels();
      return;
    }

    if (monitoring) {
      await stopMonitoring();
    }

    await startMonitoringRequest(request);
  }

  // ── Profile Drawer ──
  const profileDrawer = createProfileDrawer(profileListEl, addProfileBtn, {
    async onSelect(profileName) {
      await selectProfile(profileName);
    },
    async onAdd() {
      const name = prompt("New profile name:");
      if (!name || !name.trim()) return;
      try {
        const slug = await invoke<string>("create_profile", { name: name.trim() });
        await refreshProfileList();
        await selectProfile(slug);
      } catch (e) {
        statusEl.textContent = `Error creating profile: ${e}`;
      }
    },
  });

  // ── Device Bar ──
  const deviceBar = createDeviceBar(deviceChipsEl, addDeviceBtn, {
    async onSelectDevice(device) {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = null;
      await selectDeviceFromBar(device);
    },
    async onAddDevice() {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = null;
      if (!currentProfile || !currentProfileName) {
        statusEl.textContent = "Select a profile first";
        return;
      }
      showDeviceModal(allDevices, currentProfile.devices, {
        async onSelect(entry) {
          // Add device to profile
          const newDevice: ProfileDevice = {
            vendor_id: entry.vendor_id,
            product_id: entry.product_id,
            name: entry.name,
            layout: "",
            device_kind: getProfileDeviceKind(entry),
          };
          currentProfile!.devices.push(newDevice);

          // Save profile
          try {
            await invoke("save_profile", {
              name: currentProfileName,
              profile: currentProfile,
            });
          } catch (e) {
            statusEl.textContent = `Error saving profile: ${e}`;
          }

          // Re-render device bar and auto-select the new device
          deviceBar.setDevices(currentProfile!.devices);
          await selectDeviceFromBar(newDevice);
        },
        onClose() {},
      });
    },
    onOpenDeviceMenu(device, position) {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = showDeviceContextMenu({
        device,
        x: position.x,
        y: position.y,
        onDelete: (targetDevice) => {
          closeDeviceContextMenu = null;
          showDeleteDeviceDialog({
            device: targetDevice,
            onConfirm: async () => {
              await deleteDeviceFromProfile(targetDevice);
            },
          });
        },
      });
    },
  });

  // ── Layout selector (stays in toolbar) ──
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
    },
  });

  // ── Core functions ──

  async function refreshProfileList() {
    try {
      const names = await invoke<string[]>("list_profiles");
      profileDrawer.setProfiles(names);
    } catch (e) {
      statusEl.textContent = `Error loading profiles: ${e}`;
    }
  }

  async function selectProfile(name: string) {
    closeDeviceContextMenu?.();
    closeDeviceContextMenu = null;

    // Stop any current monitoring
    if (monitoring) await stopMonitoring();

    currentProfileName = name;
    profileDrawer.setSelected(name);

    try {
      currentProfile = await invoke<Profile>("get_profile", { name });
      currentProfile.devices = hydrateProfileDevices(currentProfile.devices);
      statusEl.textContent = `Profile: ${currentProfile.profile.name}`;

      // Populate device bar
      deviceBar.setDevices(currentProfile.devices);
      selectedDeviceInBar = null;
      deviceBar.setSelected(null);

      // Clear main area
      gridContainer.innerHTML = "";
      eventLogContainer.style.display = "none";
      buttonGrid = null;
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      currentLayout = null;
      renderWorkspace();
      syncAuxPanels();

      // Auto-select first device if available
      if (currentProfile.devices.length > 0) {
        await selectDeviceFromBar(currentProfile.devices[0]);
      }
    } catch (e) {
      statusEl.textContent = `Error loading profile: ${e}`;
      currentProfile = null;
    }
  }

  async function selectDeviceFromBar(device: ProfileDevice) {
    closeDeviceContextMenu?.();
    closeDeviceContextMenu = null;
    selectedDeviceInBar = device;
    deviceBar.setSelected(device);
    statusEl.textContent = device.name;

    // Auto-load layout if the profile specifies one
    if (device.layout) {
      selectedLayout = device.layout;
      // Update the layout selector dropdown to match
      const layoutSelect = layoutSelectorEl.querySelector("select");
      if (layoutSelect) layoutSelect.value = device.layout;
      await loadLayout(device.layout);
    } else {
      // No layout specified — clear the grid
      currentLayout = null;
      renderWorkspace();
    }

    await syncMonitoringScope(true);
  }

  async function deleteDeviceFromProfile(device: ProfileDevice) {
    if (!currentProfile || !currentProfileName) {
      throw new Error("Select a profile first");
    }

    const nextDevices = currentProfile.devices.filter(
      (candidate) => !isSameProfileDevice(candidate, device)
    );

    if (nextDevices.length === currentProfile.devices.length) {
      return;
    }

    const nextProfile: Profile = {
      ...currentProfile,
      devices: nextDevices,
    };

    try {
      await invoke("save_profile", {
        name: currentProfileName,
        profile: nextProfile,
      });
    } catch (error) {
      throw new Error(`Error saving profile: ${error}`);
    }

    currentProfile = nextProfile;
    deviceBar.setDevices(currentProfile.devices);

    const deletedSelectedDevice = isSameProfileDevice(selectedDeviceInBar, device);
    if (deletedSelectedDevice) {
      selectedDeviceInBar = null;
      deviceBar.setSelected(null);

      if (currentProfile.devices.length > 0) {
        await selectDeviceFromBar(currentProfile.devices[0]);
      } else {
        currentLayout = null;
        selectedLayout = null;
        const layoutSelect = layoutSelectorEl.querySelector<HTMLSelectElement>("select");
        if (layoutSelect) layoutSelect.value = "";
        renderWorkspace();
        await syncMonitoringScope(true);
        statusEl.textContent = `${device.name} removed from ${currentProfile.profile.name}`;
      }
      return;
    }

    deviceBar.setSelected(selectedDeviceInBar);
    await syncMonitoringScope(true);
    if (!monitoring) {
      statusEl.textContent = `${device.name} removed from ${currentProfile.profile.name}`;
    }
  }

  async function loadLayout(name: string) {
    try {
      const layout = await invoke<DeviceLayout>("get_layout", { name });
      currentLayout = layout;
      renderWorkspace();

      if (!monitoring || !isMacroMode) {
        statusEl.textContent = `Layout: ${layout.device.name} (${layout.buttons.length} buttons)`;
      }
    } catch (e) {
      statusEl.textContent = `Error loading layout: ${e}`;
      buttonGrid = null;
      layoutEditor = null;
    }
  }

  function renderViewMode() {
    if (!currentLayout) return;
    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    if (layoutEditor) {
      try { layoutEditor.destroy(); } catch (e) { console.warn('Error destroying layout editor:', e); }
      layoutEditor = null;
    }

    gridContainer.innerHTML = "";
    buttonGrid = createButtonGrid(gridContainer, currentLayout);
  }

  function renderEditMode() {
    if (!currentLayout) return;
    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    gridContainer.innerHTML = "";
    buttonGrid = null;
    gridContainer.style.height = "100%";

    layoutEditor = createLayoutEditor(gridContainer, currentLayout, {
      onSave: async (updatedLayout) => {
        try {
          await invoke("save_layout", { name: selectedLayout, layout: updatedLayout });
          statusEl.textContent = "Layout saved successfully!";

          if (selectedLayout) {
            const reloadedLayout = await invoke<DeviceLayout>("get_layout", { name: selectedLayout });
            currentLayout = reloadedLayout;
          }
        } catch (e) {
          statusEl.textContent = `Error saving layout: ${e}`;
        }
      },
    });
  }

  function renderWorkspace() {
    syncAuxPanels();

    if (isMacroMode) {
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      buttonGrid = null;
      gridContainer.innerHTML = "";
      gridContainer.classList.add("macro-workspace-host");
      macroStudio.mount(gridContainer);
      macroStudio.setMonitoringActive(monitoring);
      return;
    }

    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    if (!currentLayout) {
      gridContainer.innerHTML = "";
      return;
    }

    if (isEditMode) {
      renderEditMode();
    } else {
      renderViewMode();
    }
  }

  function syncAuxPanels() {
    eventLogContainer.style.display = monitoring && !isMacroMode ? "flex" : "none";
    actionBar.style.display = isMacroMode ? "none" : "flex";
    toggleModeBtn.disabled = isMacroMode;
    listenAllDevicesToggle.disabled = isMacroMode;
  }

  // ── Toggle View/Edit mode ──
  toggleModeBtn.addEventListener("click", () => {
    isEditMode = !isEditMode;
    toggleModeBtn.textContent = isEditMode ? "View Mode" : "Edit Mode";

    if (currentLayout) {
      renderWorkspace();
    }
  });

  macroBtn.addEventListener("click", async () => {
    isMacroMode = !isMacroMode;
    macroBtn.classList.toggle("active", isMacroMode);
    renderWorkspace();
    await syncMonitoringScope(true);
    statusEl.textContent = isMacroMode
      ? "Macro Studio ready. Recording listens across all connected profile keyboards/gamepads."
      : currentLayout
        ? `Layout: ${currentLayout.device.name} (${currentLayout.buttons.length} buttons)`
        : "Select a profile...";
  });

  reconnectBtn.addEventListener("click", async () => {
    await syncMonitoringScope(true);
  });

  // ── Monitoring ──

  async function startMonitoringRequest(request: MonitoringRequest) {
    try {
      connectionIndicator.className = "connection-indicator connecting";
      connectionIndicator.title = "Connecting...";
      statusEl.textContent = "Connecting...";

      await invoke("start_monitoring", { devicePaths: request.devicePaths });
      monitoring = true;
      monitoredPathsKey = [...request.devicePaths].sort().join("|");
      reconnectBtn.style.display = "none";
      macroStudio.setMonitoringActive(true);

      connectionIndicator.className = "connection-indicator connected";
      connectionIndicator.title = "Connected";
      statusEl.textContent = request.label;
      syncAuxPanels();

      unlistenButtonState = await listen<ButtonStateEvent>("button-state", (event) => {
        const { code, pressed, device_path: devicePath, device_name: deviceName } = event.payload;
        addEventLogEntry(code, pressed, devicePath, deviceName);
        if (!MOUSE_BUTTON_CODES.has(code)) {
          macroStudio.handleInputEvent(code, pressed);
        }

        if (buttonGrid) {
          buttonGrid.setButtonState(code, pressed);
        }
        if (layoutEditor) {
          layoutEditor.setButtonState(code, pressed);
        }
      });

      unlistenAxisState = await listen<AxisStateEvent>("axis-state", (event) => {
        const { axis, value, device_path: devicePath, device_name: deviceName } = event.payload;
        if (IGNORED_LOG_AXES.has(axis)) {
          return;
        }
        addAxisLogEntry(axis, value, devicePath, deviceName);
      });
    } catch (e) {
      connectionIndicator.className = "connection-indicator disconnected";
      connectionIndicator.title = "Disconnected";
      statusEl.textContent = `Connection error: ${e}`;
      reconnectBtn.style.display = "inline-block";
      monitoredPathsKey = "";
      macroStudio.setMonitoringActive(false);
      syncAuxPanels();
    }
  }

  async function stopMonitoring() {
    try {
      await invoke("stop_monitoring");
    } catch (_) {
      // ignore
    }

    monitoring = false;
    monitoredPathsKey = "";
    connectionIndicator.className = "connection-indicator disconnected";
    connectionIndicator.title = "Disconnected";
    reconnectBtn.style.display = "none";
    buttonGrid?.clearAll();
    macroStudio.setMonitoringActive(false);
    syncAuxPanels();

    unlistenButtonState?.();
    unlistenButtonState = null;
    unlistenAxisState?.();
    unlistenAxisState = null;
  }

  // ── Startup ──
  await refreshProfileList();

  // Auto-select first profile
  try {
    const profileNames = await invoke<string[]>("list_profiles");
    if (profileNames.length > 0) {
      await selectProfile(profileNames[0]);
    }
  } catch (_) {}

  syncAuxPanels();

  // Dismiss loading overlay
  const overlay = container.querySelector<HTMLElement>("#loading-overlay");
  if (overlay) {
    overlay.classList.add("fade-out");
    overlay.addEventListener("transitionend", () => overlay.remove());
  }
}
