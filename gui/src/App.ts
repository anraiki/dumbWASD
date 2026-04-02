import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createDeviceSelector } from "./device-selector";
import { createButtonGrid, type ButtonGrid } from "./button-grid";
import { createLayoutEditor, type LayoutEditorHandle } from "./react-flow-editor";
import { createProfileDrawer } from "./profile-drawer";
import { createDeviceBar, type ProfileDevice } from "./device-bar";
import { showDeviceModal, type DeviceEntry } from "./device-modal";
import { showDeviceContextMenu } from "./device-context-menu";
import { showDeleteDeviceDialog } from "./device-delete-dialog";
import { showDevicePropertiesDialog } from "./device-properties-dialog";
import { showUnsavedLayoutDialog } from "./layout-unsaved-dialog";
import { createMacroStudio } from "./macro-studio";
import { createEventLog } from "./event-log";
import { createJoystickTracker } from "@devices/azeron/joystick";
import { createBindingPopover } from "./binding-popover";
import {
  getMappingTargetLabel,
  isSupportedMappingTarget,
  type MappingTarget,
} from "./input-codes";
import {
  type DeviceSvgConfig,
  type DeviceSvgHandle,
  createDeviceSvgPreview,
} from "./devices/layout";
import { G502_SVG_CONFIG, VENDOR_ID as G502_VENDOR_ID, MODEL_SUBSTRING as G502_MODEL_SUBSTRING } from "./devices/g502";
import { XBOX_SVG_CONFIG } from "./devices/xbox";
import {
  type Profile,
  type ProfileManagerHandle,
  normalizeDeviceLabel,
  createProfileManager,
} from "./profile-manager";

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
  minimum?: number;
  maximum?: number;
  flat?: number;
}

interface AzeronJoystickStateEvent {
  x: number;
  y: number;
  raw_x: number;
  raw_y: number;
  source: string;
}

interface AzeronHidReportEvent {
  length: number;
  hex: string;
  ascii?: string | null;
  parsed_source?: string | null;
}

interface MonitoringRequest {
  devicePaths: string[];
  label: string;
  useAzeronHid: boolean;
  legacyMappings: Profile["mappings"];
  suppressMappedInputs: boolean;
}

interface DeviceRegistryToml {
  path: string;
  content: string;
}

const MOUSE_BUTTON_CODES = new Set([272, 273, 274, 275, 276]);

export async function createApp(container: HTMLElement) {
  const appWindow = getCurrentWindow();

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const editable = target.closest("input, textarea, select, [contenteditable=\"true\"]");
    return editable instanceof HTMLElement;
  };

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
  const bindingPopover = createBindingPopover();

  const handleGlobalSelectAll = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "a") {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    }
  };

  document.addEventListener("keydown", handleGlobalSelectAll, true);

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
    document.removeEventListener("keydown", handleGlobalSelectAll, true);
    bindingPopover.destroy();
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

  clearLogBtn.addEventListener("click", () => {
    eventLog.innerHTML = "";
  });

  function findDeviceEntryByPath(path: string): DeviceEntry | null {
    return allDevices.find((device) => device.paths.includes(path)) ?? null;
  }

  const eventLogHandle = createEventLog(eventLog, findDeviceEntryByPath);

  listenAllDevicesToggle.addEventListener("change", async () => {
    listenAllDevices = listenAllDevicesToggle.checked;
    await syncMonitoringScope(true);
  });

  // ── State ──
  let profileManager!: ProfileManagerHandle;
  let monitoring = false;
  let buttonGrid: ButtonGrid | null = null;
  let layoutEditor: LayoutEditorHandle | null = null;
  let deviceSvgPreview: DeviceSvgHandle | null = null;
  let unlistenButtonState: (() => void) | null = null;
  let unlistenAxisState: (() => void) | null = null;
  let unlistenAzeronJoystickState: (() => void) | null = null;
  let unlistenAzeronHidReport: (() => void) | null = null;
  let isEditMode = false;
  let isMacroMode = false;
  let listenAllDevices = false;
  let monitoredPathsKey = "";
  let runtimeRemapActive = false;
  let closeDeviceContextMenu: (() => void) | null = null;
  const pressedButtons = new Set<number>();
  // Cache system devices at startup
  let allDevices: DeviceEntry[] = [];
  try {
    allDevices = await invoke<DeviceEntry[]>("list_devices");
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  function isG502XDevice(device: ProfileDevice | null): boolean {
    if (!device || device.vendor_id !== G502_VENDOR_ID) {
      return false;
    }

    const labels = [device.name, device.raw_name]
      .map((value) => normalizeDeviceLabel(value))
      .filter(Boolean);

    return labels.some((label) => label.includes(G502_MODEL_SUBSTRING));
  }

  function getDeviceSvgConfig(device: ProfileDevice | null): DeviceSvgConfig | null {
    if (!device) {
      return null;
    }

    if (isG502XDevice(device)) {
      return G502_SVG_CONFIG;
    }

    if (device.device_kind === "gamepad") {
      return XBOX_SVG_CONFIG;
    }

    return null;
  }


  function applyJoystickVectorToWorkspace() {
    const v = joystickTracker.getCurrentVector();
    if (!v) return;
    buttonGrid?.setJoystickVector(v.x, v.y);
    layoutEditor?.setJoystickVector(v.x, v.y);
    deviceSvgPreview?.setJoystickVector(v.x, v.y);
  }

  function clearSelectedButtonBindingState() {
    buttonGrid?.setSelected(null);
    deviceSvgPreview?.setSelected(null);
  }

  function closeBindingPopover() {
    bindingPopover.close();
    clearSelectedButtonBindingState();
  }

  function getLegacyButtonMapping(code: number): MappingTarget | null {
    const currentProfile = profileManager.getCurrentProfile();
    if (!currentProfile) {
      return null;
    }

    const match = currentProfile.mappings.find((mapping) =>
      mapping.from === code && isSupportedMappingTarget(mapping.to)
    );

    return match ? { ...match.to } : null;
  }

  async function emitLegacyButtonMapping(code: number, pressed: boolean) {
    const mapping = getLegacyButtonMapping(code);
    if (!mapping) {
      return;
    }

    await invoke("emit_output_target", {
      target: mapping,
      pressed,
    });
  }

  async function persistLegacyButtonMapping(code: number, nextTarget: MappingTarget | null) {
    const currentProfile = profileManager.getCurrentProfile();
    const currentProfileName = profileManager.getCurrentProfileName();
    if (!currentProfile || !currentProfileName) {
      throw new Error("Select a profile first");
    }

    const nextMappings = currentProfile.mappings.filter((mapping) => mapping.from !== code);
    if (nextTarget) {
      nextMappings.push({
        from: code,
        to: { ...nextTarget },
      });
    }

    const nextProfile: Profile = {
      ...currentProfile,
      mappings: nextMappings,
    };

    await invoke("save_profile", {
      name: currentProfileName,
      profile: nextProfile,
    });

    profileManager.updateProfile(nextProfile);
    await syncMonitoringScope(true);
  }

  function openBindingPopoverForButton(
    button: { id: number; label: string },
    element: Element,
  ) {
    if (!profileManager.getCurrentProfile() || !profileManager.getCurrentProfileName() || isEditMode || isMacroMode) {
      return;
    }

    if (bindingPopover.isOpenFor(button.id)) {
      closeBindingPopover();
      return;
    }

    const currentBinding = getLegacyButtonMapping(button.id);
    buttonGrid?.setSelected(button.id);
    deviceSvgPreview?.setSelected(button.id);
    bindingPopover.open({
      anchorEl: element,
      button: { code: button.id, label: button.label },
      currentBinding,
      onClose: clearSelectedButtonBindingState,
      onSave: async (nextBinding) => {
        await persistLegacyButtonMapping(button.id, nextBinding);
        statusEl.textContent = `${button.label} mapped to ${getMappingTargetLabel(nextBinding)}`;
      },
      onReset: async () => {
        await persistLegacyButtonMapping(button.id, null);
        statusEl.textContent = `${button.label} mapping cleared`;
      },
    });
  }

  async function showDeviceProperties(device: ProfileDevice) {
    const registryToml = await invoke<DeviceRegistryToml | null>("get_device_registry_toml", {
      vendorId: device.vendor_id,
      productId: device.product_id,
      name: device.name,
      rawName: device.raw_name ?? null,
    });

    showDevicePropertiesDialog({
      deviceName: device.name,
      registryToml,
    });
  }

  async function editDeviceLayout(device: ProfileDevice) {
    if (isMacroMode) {
      isMacroMode = false;
      macroBtn.classList.remove("active");
    }

    await profileManager.selectDevice(device);

    const currentLayout = profileManager.getCurrentLayout();
    if (!currentLayout) {
      statusEl.textContent = `No layout available to edit for ${device.name}`;
      return;
    }

    isEditMode = true;
    toggleModeBtn.textContent = "View Mode";
    renderWorkspace();
    statusEl.textContent = `Editing layout: ${currentLayout.device.name}`;
  }

  async function confirmExitEditModeIfDirty(): Promise<boolean> {
    if (!isEditMode || !layoutEditor?.hasUnsavedChanges()) {
      return true;
    }

    const layoutName = profileManager.getSelectedLayout() || profileManager.getCurrentLayout()?.device.name || "this layout";
    const choice = await showUnsavedLayoutDialog({ layoutName });

    if (choice === "cancel") {
      return false;
    }

    if (choice === "discard") {
      return true;
    }

    const saved = await layoutEditor.save();
    if (!saved) {
      statusEl.textContent = `Error saving layout: ${layoutName}`;
      return false;
    }

    return true;
  }

  function getAllMonitoredPaths(): string[] {
    return [...new Set(allDevices.flatMap((device) => device.paths))];
  }

  function shouldSuppressMappedInputs(): boolean {
    const selectedDevice = profileManager.getSelectedDevice();
    const currentProfile = profileManager.getCurrentProfile();
    if (isMacroMode || listenAllDevices || !selectedDevice || !currentProfile?.mappings.length) {
      return false;
    }

    return selectedDevice.device_kind === "mouse" || selectedDevice.device_kind === "keyboard";
  }

  function buildMonitoringRequest(): MonitoringRequest | null {
    const currentProfile = profileManager.getCurrentProfile();
    const selectedDevice = profileManager.getSelectedDevice();
    const legacyMappings = currentProfile?.mappings ?? [];
    const suppressMappedInputs = shouldSuppressMappedInputs();

    if (isMacroMode) {
      const keyboardPaths = allDevices
        .filter((device) => device.has_keyboard)
        .flatMap((device) => device.paths);

      const curatedPaths = currentProfile
        ? currentProfile.devices.flatMap((device) => {
            const entry = profileManager.findSystemEntry(device);
            return entry ? entry.paths : [];
          })
        : [];

      const devicePaths = [...new Set([...keyboardPaths, ...curatedPaths])];
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "Keyboards + curated gamepads",
        useAzeronHid: selectedDevice?.device_kind === "azeron",
        legacyMappings,
        suppressMappedInputs: false,
      };
    }

    if (listenAllDevices) {
      const devicePaths = getAllMonitoredPaths();
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "All detected devices",
        useAzeronHid: selectedDevice?.device_kind === "azeron",
        legacyMappings,
        suppressMappedInputs: false,
      };
    }

    if (!selectedDevice) return null;

    const entry = profileManager.findSystemEntry(selectedDevice);
    if (!entry) return null;

    return {
      devicePaths: entry.paths,
      label: entry.name,
      useAzeronHid: entry.is_azeron || selectedDevice.device_kind === "azeron",
      legacyMappings,
      suppressMappedInputs,
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
        runtimeRemapActive = false;
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
      await profileManager.selectProfile(profileName);
    },
    async onAdd() {
      const name = prompt("New profile name:");
      if (!name || !name.trim()) return;
      try {
        const slug = await invoke<string>("create_profile", { name: name.trim() });
        await profileManager.refreshProfileList();
        await profileManager.selectProfile(slug);
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
      await profileManager.selectDevice(device);
    },
    async onAddDevice() {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = null;
      const currentProfile = profileManager.getCurrentProfile();
      if (!currentProfile || !profileManager.getCurrentProfileName()) {
        statusEl.textContent = "Select a profile first";
        return;
      }
      showDeviceModal(allDevices, currentProfile.devices, {
        async onSelect(entry) {
          const newDevice: ProfileDevice = {
            id: entry.id,
            vendor_id: entry.vendor_id,
            product_id: entry.product_id,
            name: entry.name,
            raw_name: entry.raw_name,
            layout: "",
            device_kind: profileManager.getDeviceKind(entry),
          };
          try {
            await profileManager.addDevice(newDevice);
          } catch (e) {
            statusEl.textContent = `Error saving profile: ${e}`;
            return;
          }
          await profileManager.selectDevice(newDevice);
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
        onProperties: (targetDevice) => {
          closeDeviceContextMenu = null;
          void showDeviceProperties(targetDevice).catch((error) => {
            statusEl.textContent = `Error loading device properties: ${error}`;
          });
        },
        onEditLayout: (targetDevice) => {
          closeDeviceContextMenu = null;
          void editDeviceLayout(targetDevice)
            .catch((error) => {
              statusEl.textContent = `Error opening layout editor: ${error}`;
            });
        },
        onDelete: (targetDevice) => {
          closeDeviceContextMenu = null;
          showDeleteDeviceDialog({
            device: targetDevice,
            onConfirm: async () => {
              await profileManager.deleteDevice(targetDevice);
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
      if (value !== profileManager.getSelectedLayout()) {
        const canLeaveEditMode = await confirmExitEditModeIfDirty();
        if (!canLeaveEditMode) {
          const layoutSelect = layoutSelectorEl.querySelector<HTMLSelectElement>("select");
          if (layoutSelect) {
            layoutSelect.value = profileManager.getSelectedLayout() || "";
          }
          return;
        }
      }

      await profileManager.selectLayout(value);
    },
  });

  // ── Profile manager ──

  profileManager = createProfileManager({
    allDevices,
    statusEl,
    gridContainer,
    eventLogContainer,
    layoutSelectorEl,
    profileDrawer,
    deviceBar,
    getMonitoring: () => monitoring,
    getIsMacroMode: () => isMacroMode,
    getButtonGrid: () => buttonGrid,
    setButtonGrid: (grid) => { buttonGrid = grid; },
    getLayoutEditor: () => layoutEditor,
    destroyLayoutEditor: () => {
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
    },
    getCloseDeviceContextMenu: () => closeDeviceContextMenu,
    clearCloseDeviceContextMenu: () => { closeDeviceContextMenu = null; },
    confirmExitEditModeIfDirty,
    stopMonitoring,
    renderWorkspace,
    syncAuxPanels,
    syncMonitoringScope,
  });

  // joystickTracker (moved here — depends on profileManager)
  const joystickTracker = createJoystickTracker({
    isSelectedAzeron: () => profileManager.getSelectedDevice()?.device_kind === "azeron",
    findDeviceByPath: (path) => findDeviceEntryByPath(path),
    getSelectedDevicePaths: () => {
      const selected = profileManager.getSelectedDevice();
      const entry = selected ? profileManager.findSystemEntry(selected) : null;
      return entry?.is_azeron ? entry.paths : null;
    },
    onVectorChange: (x, y) => {
      buttonGrid?.setJoystickVector(x, y);
      layoutEditor?.setJoystickVector(x, y);
      deviceSvgPreview?.setJoystickVector(x, y);
    },
  });

  function renderViewMode() {
    const currentLayout = profileManager.getCurrentLayout();
    if (!currentLayout) return;
    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    if (layoutEditor) {
      try { layoutEditor.destroy(); } catch (e) { console.warn('Error destroying layout editor:', e); }
      layoutEditor = null;
    }

    buttonGrid?.destroy();
    gridContainer.innerHTML = "";
    buttonGrid = createButtonGrid(gridContainer, currentLayout, {
      onButtonClick(button, element) {
        openBindingPopoverForButton(button, element);
      },
    });
    buttonGrid.clearAll();
    for (const code of pressedButtons) {
      buttonGrid.setButtonState(code, true);
    }
    applyJoystickVectorToWorkspace();
  }

  function renderEditMode() {
    const currentLayout = profileManager.getCurrentLayout();
    if (!currentLayout) return;
    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    buttonGrid?.destroy();
    gridContainer.innerHTML = "";
    buttonGrid = null;
    gridContainer.style.height = "100%";

    layoutEditor = createLayoutEditor(gridContainer, currentLayout, {
      onSave: async (updatedLayout) => {
        const selectedLayout = profileManager.getSelectedLayout();
        try {
          await invoke("save_layout", { name: selectedLayout, layout: updatedLayout });
          statusEl.textContent = "Layout saved successfully!";

          if (selectedLayout) {
            await profileManager.loadLayout(selectedLayout);
          }
        } catch (e) {
          statusEl.textContent = `Error saving layout: ${e}`;
        }
      },
    });
    requestAnimationFrame(() => {
      layoutEditor?.clearAll();
      for (const code of pressedButtons) {
        layoutEditor?.setButtonState(code, true);
      }
      applyJoystickVectorToWorkspace();
    });
  }

  function renderDeviceSvgPreview() {
    deviceSvgPreview?.destroy();
    deviceSvgPreview = null;

    const svgConfig = getDeviceSvgConfig(profileManager.getSelectedDevice());
    if (!svgConfig) {
      gridContainer.innerHTML = "";
      return;
    }

    gridContainer.innerHTML = `
      <section class="device-svg-preview" aria-label="${svgConfig.previewLabel}"></section>
    `;

    const frame = gridContainer.querySelector<HTMLElement>(".device-svg-preview");
    if (!frame) {
      return;
    }

    frame.innerHTML = svgConfig.markup;

    const svg = frame.querySelector<SVGElement>("svg");
    if (!svg) {
      return;
    }

    svg.classList.add("device-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    deviceSvgPreview = createDeviceSvgPreview(svg, svgConfig, {
      onButtonClick(button, element) {
        openBindingPopoverForButton(button, element);
      },
    });
    deviceSvgPreview.clearAll();
    for (const code of pressedButtons) {
      deviceSvgPreview.setButtonState(code, true);
    }
    const currentJoystickVector = joystickTracker.getCurrentVector();
    if (currentJoystickVector) {
      deviceSvgPreview.setJoystickVector(currentJoystickVector.x, currentJoystickVector.y);
    }
  }

  function renderWorkspace() {
    closeBindingPopover();
    syncAuxPanels();

    if (isMacroMode) {
      deviceSvgPreview?.destroy();
      deviceSvgPreview = null;
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      buttonGrid?.destroy();
      buttonGrid = null;
      gridContainer.innerHTML = "";
      gridContainer.classList.add("macro-workspace-host");
      macroStudio.mount(gridContainer);
      macroStudio.setMonitoringActive(monitoring);
      return;
    }

    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    if (!profileManager.getCurrentLayout()) {
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      buttonGrid?.destroy();
      buttonGrid = null;
      renderDeviceSvgPreview();
      return;
    }

    deviceSvgPreview?.destroy();
    deviceSvgPreview = null;

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
  toggleModeBtn.addEventListener("click", async () => {
    if (isEditMode) {
      const canLeaveEditMode = await confirmExitEditModeIfDirty();
      if (!canLeaveEditMode) {
        return;
      }
    }

    isEditMode = !isEditMode;
    toggleModeBtn.textContent = isEditMode ? "View Mode" : "Edit Mode";

    if (profileManager.getCurrentLayout()) {
      renderWorkspace();
    }
  });

  macroBtn.addEventListener("click", async () => {
    if (!isMacroMode) {
      const canLeaveEditMode = await confirmExitEditModeIfDirty();
      if (!canLeaveEditMode) {
        return;
      }
    }

    isMacroMode = !isMacroMode;
    macroBtn.classList.toggle("active", isMacroMode);
    renderWorkspace();
    await syncMonitoringScope(true);
    const currentLayout = profileManager.getCurrentLayout();
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

      await invoke("start_monitoring", {
        devicePaths: request.devicePaths,
        useAzeronHid: request.useAzeronHid,
        legacyMappings: request.legacyMappings,
        suppressMappedInputs: request.suppressMappedInputs,
      });
      monitoring = true;
      runtimeRemapActive = request.suppressMappedInputs;
      monitoredPathsKey = [...request.devicePaths].sort().join("|");
      reconnectBtn.style.display = "none";
      macroStudio.setMonitoringActive(true);

      connectionIndicator.className = "connection-indicator connected";
      connectionIndicator.title = "Connected";
      statusEl.textContent = request.label;
      syncAuxPanels();
      eventLogHandle.addMonitoringLogEntry(
        `Monitoring · HID ${request.useAzeronHid ? "enabled" : "disabled"} · paths ${request.devicePaths.join(", ")}`
      );

      unlistenButtonState = await listen<ButtonStateEvent>("button-state", (event) => {
        const { code, pressed, device_path: devicePath, device_name: deviceName } = event.payload;
        const suppressPhysicalHighlight = joystickTracker.shouldTreatAsEmulated(code, pressed);
        if (pressed) {
          pressedButtons.add(code);
        } else {
          pressedButtons.delete(code);
        }
        if (!suppressPhysicalHighlight) {
          eventLogHandle.addEventLogEntry(code, pressed, devicePath, deviceName);
        }
        if (!MOUSE_BUTTON_CODES.has(code)) {
          macroStudio.handleInputEvent(code, pressed);
        }

        if (buttonGrid) {
          buttonGrid.setButtonState(code, pressed, {
            suppressPhysical: suppressPhysicalHighlight,
          });
        }
        if (layoutEditor) {
          layoutEditor.setButtonState(code, pressed, {
            suppressPhysical: suppressPhysicalHighlight,
          });
        }
        deviceSvgPreview?.setButtonState(code, pressed);

        if (!runtimeRemapActive) {
          void emitLegacyButtonMapping(code, pressed).catch((error) => {
            statusEl.textContent = `Error applying mapping: ${error}`;
          });
        }
      });

      unlistenAzeronJoystickState = await listen<AzeronJoystickStateEvent>("azeron-joystick-state", (event) => {
        joystickTracker.updateVectorFromAzeronHid(event.payload);
      });

      unlistenAzeronHidReport = await listen<AzeronHidReportEvent>("azeron-hid-report", (event) => {
        eventLogHandle.addAzeronHidReportLogEntry(event.payload);
      });

      unlistenAxisState = await listen<AxisStateEvent>("axis-state", (event) => {
        const {
          axis,
          value,
          device_path: devicePath,
          device_name: deviceName,
          minimum,
          maximum,
          flat,
        } = event.payload;
        joystickTracker.recordMotion(axis, value, devicePath, deviceName);
        joystickTracker.updateVector(axis, value, devicePath, deviceName, minimum, maximum, flat);
        eventLogHandle.addAxisLogEntry(axis, value, devicePath, deviceName, minimum, maximum, flat);
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
    runtimeRemapActive = false;
    monitoredPathsKey = "";
    connectionIndicator.className = "connection-indicator disconnected";
    connectionIndicator.title = "Disconnected";
    reconnectBtn.style.display = "none";
    buttonGrid?.clearAll();
    layoutEditor?.clearAll();
    deviceSvgPreview?.clearAll();
    pressedButtons.clear();
    joystickTracker.reset();
    macroStudio.setMonitoringActive(false);
    syncAuxPanels();

    unlistenButtonState?.();
    unlistenButtonState = null;
    unlistenAxisState?.();
    unlistenAxisState = null;
    unlistenAzeronJoystickState?.();
    unlistenAzeronJoystickState = null;
    unlistenAzeronHidReport?.();
    unlistenAzeronHidReport = null;
  }

  // ── Startup ──
  await profileManager.refreshProfileList();

  // Auto-select first profile
  try {
    const profileNames = await invoke<string[]>("list_profiles");
    if (profileNames.length > 0) {
      await profileManager.selectProfile(profileNames[0]);
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
