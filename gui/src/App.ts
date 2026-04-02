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
import { initStore } from "./init";
import { setupWindowChrome } from "./components/app/window-chrome";
import { createDeviceBarController } from "./components/app/device-bar-controller";
import { setupModeControls, type ModeControlsHandle } from "./components/app/mode-controls";
import { mountAppShell } from "./components/app/app-shell";

export async function createApp(container: HTMLElement) {
  const appWindow = getCurrentWindow();

  const {
    titleBar, windowTitleEl, minimizeWindowBtn, maximizeWindowBtn, closeWindowBtn,
    reconnectBtn, toggleModeBtn, gridContainer, statusEl, connectionIndicator,
    eventLogContainer, eventLog, clearLogBtn, listenAllDevicesToggle, actionBar,
    profileListEl, addProfileBtn, deviceChipsEl, addDeviceBtn,
    hamburgerBtn, overlayBtn, macroBtn, layoutSelectorEl,
  } = mountAppShell(container);

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

  const state = createAppState();
  await initStore(state, statusEl);

  function findDeviceEntryByPath(path: string): DeviceEntry | null {
    return state.allDevices.find((device) => device.paths.includes(path)) ?? null;
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
    layouts: state.layouts,
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
