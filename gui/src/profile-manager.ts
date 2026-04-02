import { invoke } from "@tauri-apps/api/core";
import type { ProfileDevice, ProfileDeviceKind } from "./device-bar";
import type { DeviceEntry } from "./device-modal";
import type { ButtonGrid } from "./button-grid";
import type { LayoutEditorHandle } from "./react-flow-editor";
import type { MappingTarget } from "./input-codes";

// ── Types ──

export interface DeviceLayout {
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

export interface ProfileMeta {
  name: string;
  device_name?: string;
}

export interface Profile {
  profile: ProfileMeta;
  devices: ProfileDevice[];
  mappings: Array<{
    device?: string;
    from: number;
    to: MappingTarget;
  }>;
}

// ── Utilities ──

export function normalizeDeviceLabel(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function deviceIdentity(device: { id?: string; vendor_id: number; product_id: number }): string {
  return device.id || `${device.vendor_id}:${device.product_id}`;
}

function findDeviceEntry(
  device: { id?: string; vendor_id: number; product_id: number; name?: string; raw_name?: string },
  allDevices: DeviceEntry[],
): DeviceEntry | null {
  const identity = deviceIdentity(device);
  const exactMatch = allDevices.find((entry) => entry.id === identity);
  if (exactMatch) return exactMatch;

  const candidates = allDevices.filter(
    (entry) => entry.vendor_id === device.vendor_id && entry.product_id === device.product_id
  );
  if (candidates.length === 0) return null;

  const aliases = new Set(
    [device.name, device.raw_name].map((v) => normalizeDeviceLabel(v)).filter(Boolean)
  );

  const namedMatches = candidates.filter((entry) => {
    const entryLabels = [entry.name, entry.raw_name, entry.id]
      .map((v) => normalizeDeviceLabel(v))
      .filter(Boolean);
    return entryLabels.some((label) => aliases.has(label));
  });

  if (namedMatches.length === 1) return namedMatches[0];
  return candidates.length === 1 ? candidates[0] : null;
}

// ── Handle interface ──

export interface ProfileManagerHandle {
  refreshProfileList(): Promise<void>;
  selectProfile(name: string): Promise<void>;
  selectDevice(device: ProfileDevice): Promise<void>;
  addDevice(device: ProfileDevice): Promise<void>;
  deleteDevice(device: ProfileDevice): Promise<void>;
  loadLayout(name: string): Promise<void>;
  selectLayout(name: string): Promise<void>;
  persistDeviceLayout(layoutName: string): Promise<void>;

  getCurrentProfileName(): string | null;
  getCurrentProfile(): Profile | null;
  getSelectedDevice(): ProfileDevice | null;
  getCurrentLayout(): DeviceLayout | null;
  getSelectedLayout(): string | null;

  updateProfile(profile: Profile): void;
  findSystemEntry(device: ProfileDevice): DeviceEntry | null;
  getDeviceKind(entry: DeviceEntry | null): ProfileDeviceKind | undefined;
  isSameDevice(a: ProfileDevice | null, b: ProfileDevice | null): boolean;
}

// ── Factory ──

export function createProfileManager(options: {
  allDevices: DeviceEntry[];
  statusEl: HTMLElement;
  gridContainer: HTMLElement;
  eventLogContainer: HTMLElement;
  layoutSelectorEl: HTMLElement;
  profileDrawer: {
    setProfiles(names: string[]): void;
    setSelected(name: string | null): void;
  };
  deviceBar: {
    setDevices(devices: ProfileDevice[]): void;
    setSelected(device: ProfileDevice | null): void;
  };
  getMonitoring(): boolean;
  getIsMacroMode(): boolean;
  getButtonGrid(): ButtonGrid | null;
  setButtonGrid(grid: ButtonGrid | null): void;
  getLayoutEditor(): LayoutEditorHandle | null;
  destroyLayoutEditor(): void;
  getCloseDeviceContextMenu(): (() => void) | null;
  clearCloseDeviceContextMenu(): void;
  confirmExitEditModeIfDirty(): Promise<boolean>;
  stopMonitoring(): Promise<void>;
  renderWorkspace(): void;
  syncAuxPanels(): void;
  syncMonitoringScope(force?: boolean): Promise<void>;
}): ProfileManagerHandle {
  let currentProfileName: string | null = null;
  let currentProfile: Profile | null = null;
  let selectedDevice: ProfileDevice | null = null;
  let selectedLayout: string | null = null;
  let currentLayout: DeviceLayout | null = null;

  function isSameDevice(a: ProfileDevice | null, b: ProfileDevice | null): boolean {
    if (!a || !b) return false;
    return deviceIdentity(a) === deviceIdentity(b);
  }

  function getDeviceKind(entry: DeviceEntry | null): ProfileDeviceKind | undefined {
    if (!entry) return undefined;
    if (entry.is_azeron) return "azeron";
    if (entry.has_mouse) return "mouse";
    if (entry.has_gamepad) return "gamepad";
    if (entry.has_keyboard) return "keyboard";
    return undefined;
  }

  function hydrateDevices(devices: ProfileDevice[]): ProfileDevice[] {
    return devices.map((device) => {
      const entry = findDeviceEntry(device, options.allDevices);
      const device_kind = device.device_kind ?? getDeviceKind(entry);
      if (!entry && !device_kind) return device;
      return {
        ...device,
        id: device.id || entry?.id,
        raw_name: device.raw_name || entry?.raw_name,
        device_kind,
      };
    });
  }

  async function resolveLayoutForDevice(device: ProfileDevice): Promise<string | null> {
    try {
      return await invoke<string | null>("resolve_layout_for_device", {
        vendorId: device.vendor_id,
        productId: device.product_id,
        name: device.name,
        rawName: device.raw_name ?? null,
      });
    } catch (e) {
      console.warn("Error resolving default layout:", e);
      return null;
    }
  }

  async function loadLayout(name: string) {
    try {
      const layout = await invoke<DeviceLayout>("get_layout", { name });
      currentLayout = layout;
      options.renderWorkspace();
      if (!options.getMonitoring() || !options.getIsMacroMode()) {
        options.statusEl.textContent = `Layout: ${layout.device.name} (${layout.buttons.length} buttons)`;
      }
    } catch (e) {
      options.statusEl.textContent = `Error loading layout: ${e}`;
      options.getButtonGrid()?.destroy();
      options.setButtonGrid(null);
      options.destroyLayoutEditor();
    }
  }

  async function persistDeviceLayout(layoutName: string) {
    if (!currentProfile || !currentProfileName || !selectedDevice) return;

    const index = currentProfile.devices.findIndex((d) => isSameDevice(d, selectedDevice));
    if (index < 0) return;

    const currentDevice = currentProfile.devices[index];
    if (!currentDevice || currentDevice.layout === layoutName) return;

    const updatedDevice = { ...currentDevice, layout: layoutName };
    const nextDevices = [...currentProfile.devices];
    nextDevices[index] = updatedDevice;

    const nextProfile: Profile = { ...currentProfile, devices: nextDevices };
    await invoke("save_profile", { name: currentProfileName, profile: nextProfile });

    currentProfile = nextProfile;
    selectedDevice = updatedDevice;
    options.deviceBar.setDevices(currentProfile.devices);
    options.deviceBar.setSelected(selectedDevice);
  }

  async function selectDevice(device: ProfileDevice) {
    options.getCloseDeviceContextMenu()?.();
    options.clearCloseDeviceContextMenu();

    if (!isSameDevice(selectedDevice, device)) {
      const canLeave = await options.confirmExitEditModeIfDirty();
      if (!canLeave) {
        options.deviceBar.setSelected(selectedDevice);
        return;
      }
    }

    selectedDevice = device;
    options.deviceBar.setSelected(device);
    options.statusEl.textContent = device.name;

    const resolvedLayout = device.layout || await resolveLayoutForDevice(device);

    if (resolvedLayout) {
      selectedLayout = resolvedLayout;
      const layoutSelect = options.layoutSelectorEl.querySelector<HTMLSelectElement>("select");
      if (layoutSelect) layoutSelect.value = resolvedLayout;
      await loadLayout(resolvedLayout);
    } else {
      selectedLayout = null;
      currentLayout = null;
      const layoutSelect = options.layoutSelectorEl.querySelector<HTMLSelectElement>("select");
      if (layoutSelect) layoutSelect.value = "";
      options.renderWorkspace();
    }

    await options.syncMonitoringScope(true);
  }

  return {
    async refreshProfileList() {
      try {
        const names = await invoke<string[]>("list_profiles");
        options.profileDrawer.setProfiles(names);
      } catch (e) {
        options.statusEl.textContent = `Error loading profiles: ${e}`;
      }
    },

    async selectProfile(name: string) {
      options.getCloseDeviceContextMenu()?.();
      options.clearCloseDeviceContextMenu();

      const canLeave = await options.confirmExitEditModeIfDirty();
      if (!canLeave) return;

      if (options.getMonitoring()) await options.stopMonitoring();

      currentProfileName = name;
      options.profileDrawer.setSelected(name);

      try {
        currentProfile = await invoke<Profile>("get_profile", { name });
        currentProfile.devices = hydrateDevices(currentProfile.devices);
        options.statusEl.textContent = `Profile: ${currentProfile.profile.name}`;

        options.deviceBar.setDevices(currentProfile.devices);
        selectedDevice = null;
        options.deviceBar.setSelected(null);

        options.gridContainer.innerHTML = "";
        options.eventLogContainer.style.display = "none";
        options.setButtonGrid(null);
        options.destroyLayoutEditor();
        currentLayout = null;
        options.renderWorkspace();
        options.syncAuxPanels();

        if (currentProfile.devices.length > 0) {
          await selectDevice(currentProfile.devices[0]);
        }
      } catch (e) {
        options.statusEl.textContent = `Error loading profile: ${e}`;
        currentProfile = null;
      }
    },

    selectDevice,

    async addDevice(device: ProfileDevice) {
      if (!currentProfile || !currentProfileName) {
        throw new Error("Select a profile first");
      }
      currentProfile.devices.push(device);
      await invoke("save_profile", { name: currentProfileName, profile: currentProfile });
      options.deviceBar.setDevices(currentProfile.devices);
    },

    async deleteDevice(device: ProfileDevice) {
      if (!currentProfile || !currentProfileName) {
        throw new Error("Select a profile first");
      }

      if (isSameDevice(selectedDevice, device)) {
        const canLeave = await options.confirmExitEditModeIfDirty();
        if (!canLeave) return;
      }

      const nextDevices = currentProfile.devices.filter(
        (candidate) => !isSameDevice(candidate, device)
      );
      if (nextDevices.length === currentProfile.devices.length) return;

      const nextProfile: Profile = { ...currentProfile, devices: nextDevices };
      try {
        await invoke("save_profile", { name: currentProfileName, profile: nextProfile });
      } catch (error) {
        throw new Error(`Error saving profile: ${error}`);
      }

      currentProfile = nextProfile;
      options.deviceBar.setDevices(currentProfile.devices);

      if (isSameDevice(selectedDevice, device)) {
        selectedDevice = null;
        options.deviceBar.setSelected(null);

        if (currentProfile.devices.length > 0) {
          await selectDevice(currentProfile.devices[0]);
        } else {
          currentLayout = null;
          selectedLayout = null;
          const layoutSelect = options.layoutSelectorEl.querySelector<HTMLSelectElement>("select");
          if (layoutSelect) layoutSelect.value = "";
          options.renderWorkspace();
          await options.syncMonitoringScope(true);
          options.statusEl.textContent = `${device.name} removed from ${currentProfile.profile.name}`;
        }
        return;
      }

      options.deviceBar.setSelected(selectedDevice);
      await options.syncMonitoringScope(true);
      if (!options.getMonitoring()) {
        options.statusEl.textContent = `${device.name} removed from ${currentProfile.profile.name}`;
      }
    },

    loadLayout,
    persistDeviceLayout,

    async selectLayout(name: string) {
      selectedLayout = name;
      await persistDeviceLayout(name);
      await loadLayout(name);
    },

    getCurrentProfileName: () => currentProfileName,
    getCurrentProfile: () => currentProfile,
    getSelectedDevice: () => selectedDevice,
    getCurrentLayout: () => currentLayout,
    getSelectedLayout: () => selectedLayout,

    updateProfile(profile: Profile) {
      currentProfile = profile;
    },

    findSystemEntry: (device) => findDeviceEntry(device, options.allDevices),
    getDeviceKind,
    isSameDevice,
  };
}
