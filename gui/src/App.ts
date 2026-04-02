import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createProfileDrawer } from "./profile-drawer";
import { type DeviceEntry } from "./device-modal";
import { createMacroStudio } from "./macro-studio";
import { createEventLog } from "./event-log";
import { createMonitor, type MonitorHandle } from "./monitoring/monitor";
import { createJoystickTracker } from "@devices/azeron/joystick";
import { createBindingPopover } from "./binding-popover";
import { createLegacyBinder, type LegacyBinderHandle } from "./binder/legacy";
import { createBindingPopoverController, type BindingPopoverController } from "./binder/popover";
import { createWorkspace, type WorkspaceHandle } from "./workspace/workspace";
import { type ProfileManagerHandle, createProfileManager } from "./profile-manager";
import { createAppState } from "./store/app-state";
import { setupWindowChrome } from "./components/app/window-chrome";
import { createDeviceBarController } from "./components/app/device-bar-controller";
import { setupModeControls, type ModeControlsHandle } from "./components/app/mode-controls";

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
  const layoutSelectorEl = container.querySelector<HTMLElement>("#layout-selector")!;

  const macroStudio = createMacroStudio();
  const bindingPopover = createBindingPopover();

  // ── Window chrome ──
  await setupWindowChrome({
    appWindow,
    titleBar,
    windowTitleEl,
    minimizeWindowBtn,
    maximizeWindowBtn,
    closeWindowBtn,
    statusEl,
    onCleanup: () => bindingPopover.destroy(),
  });

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
  hamburgerBtn.addEventListener("click", () => {
    drawerOpen = !drawerOpen;
    container.classList.toggle("drawer-open", drawerOpen);
    hamburgerBtn.classList.toggle("active", drawerOpen);
  });

  clearLogBtn.addEventListener("click", () => { eventLog.innerHTML = ""; });

  // ── State ──
  let profileManager!: ProfileManagerHandle;
  let monitor!: MonitorHandle;
  let modeControls!: ModeControlsHandle;
  let legacyBinder!: LegacyBinderHandle;
  let bindingController!: BindingPopoverController;
  let workspace!: WorkspaceHandle;

  let allDevices: DeviceEntry[] = [];
  try {
    allDevices = await invoke<DeviceEntry[]>("list_devices");
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  const state = createAppState(allDevices);

  function findDeviceEntryByPath(path: string): DeviceEntry | null {
    return allDevices.find((device) => device.paths.includes(path)) ?? null;
  }

  const eventLogHandle = createEventLog(eventLog, findDeviceEntryByPath);

  listenAllDevicesToggle.addEventListener("change", async () => {
    state.setListenAllDevices(listenAllDevicesToggle.checked);
    await monitor.syncScope(true);
  });

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
  const deviceBar = createDeviceBarController({
    deviceChipsEl,
    addDeviceBtn,
    statusEl,
    toggleModeBtn,
    macroBtn,
    allDevices: state.allDevices,
    getProfileManager: () => profileManager,
    getWorkspace: () => workspace,
    getIsMacroMode: state.getIsMacroMode,
    setIsMacroMode: state.setIsMacroMode,
    setIsEditMode: state.setIsEditMode,
    getCloseDeviceContextMenu: state.getCloseDeviceContextMenu,
    setCloseDeviceContextMenu: state.setCloseDeviceContextMenu,
  });

  // ── Layout layouts list ──
  let layouts: string[] = [];
  try {
    layouts = await invoke<string[]>("list_layouts");
  } catch (e) {
    statusEl.textContent = `Error loading layouts: ${e}`;
  }

  // ── Profile manager ──
  profileManager = createProfileManager({
    allDevices: state.allDevices,
    statusEl,
    gridContainer,
    eventLogContainer,
    layoutSelectorEl,
    profileDrawer,
    deviceBar,
    getMonitoring: () => monitor.isActive(),
    getIsMacroMode: state.getIsMacroMode,
    getButtonGrid: state.getButtonGrid,
    setButtonGrid: state.setButtonGrid,
    getLayoutEditor: state.getLayoutEditor,
    destroyLayoutEditor: state.destroyLayoutEditor,
    getCloseDeviceContextMenu: state.getCloseDeviceContextMenu,
    clearCloseDeviceContextMenu: () => state.setCloseDeviceContextMenu(null),
    confirmExitEditModeIfDirty: () => modeControls.confirmExitEditModeIfDirty(),
    stopMonitoring: () => monitor.stop(),
    renderWorkspace: () => workspace.render(),
    syncAuxPanels: () => workspace.syncAuxPanels(),
    syncMonitoringScope: (force) => monitor.syncScope(force),
  });

  legacyBinder = createLegacyBinder({
    profileManager,
    onProfileUpdate: (profile) => profileManager.updateProfile(profile),
    syncMonitoringScope: () => monitor.syncScope(true),
  });

  // joystickTracker (depends on profileManager)
  const joystickTracker = createJoystickTracker({
    isSelectedAzeron: () => profileManager.getSelectedDevice()?.device_kind === "azeron",
    findDeviceByPath: (path) => findDeviceEntryByPath(path),
    getSelectedDevicePaths: () => {
      const selected = profileManager.getSelectedDevice();
      const entry = selected ? profileManager.findSystemEntry(selected) : null;
      return entry?.is_azeron ? entry.paths : null;
    },
    onVectorChange: (x, y) => {
      state.getButtonGrid()?.setJoystickVector(x, y);
      state.getLayoutEditor()?.setJoystickVector(x, y);
      state.getDeviceSvgPreview()?.setJoystickVector(x, y);
    },
  });

  monitor = createMonitor({
    allDevices: state.allDevices,
    profileManager,
    getIsMacroMode: state.getIsMacroMode,
    getListenAllDevices: state.getListenAllDevices,
    statusEl,
    connectionIndicator,
    reconnectBtn,
    macroStudio,
    joystickTracker,
    eventLogHandle,
    pressedButtons: state.pressedButtons,
    getButtonGrid: state.getButtonGrid,
    getLayoutEditor: state.getLayoutEditor,
    getDeviceSvgPreview: state.getDeviceSvgPreview,
    emitLegacyButtonMapping: (code, pressed) => legacyBinder.emit(code, pressed),
    syncAuxPanels: () => workspace.syncAuxPanels(),
  });

  bindingController = createBindingPopoverController({
    popover: bindingPopover,
    legacyBinder,
    statusEl,
    getIsEditMode: state.getIsEditMode,
    getIsMacroMode: state.getIsMacroMode,
    getHasProfile: () => !!profileManager.getCurrentProfile() && !!profileManager.getCurrentProfileName(),
    onSelectionChange: (code) => {
      state.getButtonGrid()?.setSelected(code);
      state.getDeviceSvgPreview()?.setSelected(code);
    },
  });

  workspace = createWorkspace({
    gridContainer,
    statusEl,
    actionBar,
    eventLogContainer,
    toggleModeBtn,
    listenAllDevicesToggle,
    getIsEditMode: state.getIsEditMode,
    getIsMacroMode: state.getIsMacroMode,
    getButtonGrid: state.getButtonGrid,
    setButtonGrid: state.setButtonGrid,
    getLayoutEditor: state.getLayoutEditor,
    setLayoutEditor: state.setLayoutEditor,
    getDeviceSvgPreview: state.getDeviceSvgPreview,
    setDeviceSvgPreview: state.setDeviceSvgPreview,
    pressedButtons: state.pressedButtons,
    macroStudio,
    getIsMonitoringActive: () => monitor.isActive(),
    profileManager,
    joystickTracker,
    bindingController,
  });

  modeControls = setupModeControls({
    toggleModeBtn,
    macroBtn,
    reconnectBtn,
    layoutSelectorEl,
    layouts,
    statusEl,
    getIsEditMode: state.getIsEditMode,
    setIsEditMode: state.setIsEditMode,
    getIsMacroMode: state.getIsMacroMode,
    setIsMacroMode: state.setIsMacroMode,
    getLayoutEditor: state.getLayoutEditor,
    profileManager,
    workspace,
    monitor,
  });

  // ── Startup ──
  await profileManager.refreshProfileList();

  try {
    const profileNames = await invoke<string[]>("list_profiles");
    if (profileNames.length > 0) {
      await profileManager.selectProfile(profileNames[0]);
    }
  } catch (_) {}

  workspace.syncAuxPanels();

  const overlay = container.querySelector<HTMLElement>("#loading-overlay");
  if (overlay) {
    overlay.classList.add("fade-out");
    overlay.addEventListener("transitionend", () => overlay.remove());
  }
}
