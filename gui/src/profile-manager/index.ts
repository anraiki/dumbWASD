import { invoke } from "@tauri-apps/api/core";
import type { ProfileDevice, ProfileDeviceKind } from "../device-bar";
import type { DeviceEntry } from "../device-modal";
import type { ButtonGrid } from "../button-grid";
import type { LayoutEditorHandle } from "../react-flow-editor";
import type { MappingTarget } from "../input-codes";
import {
  getSavedSelectedDeviceId,
  setSavedSelectedDeviceId,
} from "./selected-device-storage";
import {
  deviceIdentity,
  findDeviceEntry,
  normalizeDeviceLabel,
} from "./device-matching";

// Re-exported so importers of "./profile-manager" keep working unchanged.
export { normalizeDeviceLabel };

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
    /** Claims exclusive use of the output while held; absent means false. */
    exclusive?: boolean;
    /** Latches on first press and off on the next; absent means false. */
    toggle?: boolean;
  }>;
}

// ── Utilities ──


// ── Handle interface ──

export interface ProfileManagerHandle {
  refreshProfileList(): Promise<void>;
  selectProfile(name: string): Promise<void>;
  selectDevice(device: ProfileDevice): Promise<void>;
  addDevice(device: ProfileDevice): Promise<void>;
  deleteDevice(device: ProfileDevice): Promise<void>;
  setDeviceMappingsEnabled(device: ProfileDevice, enabled: boolean): Promise<void>;
  loadLayout(name: string): Promise<void>;
  selectLayout(name: string): Promise<void>;
  persistDeviceLayout(layoutName: string): Promise<void>;

  getCurrentProfileName(): string | null;
  getCurrentProfile(): Profile | null;
  getSelectedDevice(): ProfileDevice | null;
  getCurrentLayout(): DeviceLayout | null;
  getSelectedLayout(): string | null;

  updateProfile(profile: Profile): void;
  /// Re-resolve every device in the loaded profile against the current
  /// system list, after a hotplug changed what is plugged in. Touches
  /// in-memory state and the device bar only — never writes the profile.
  refreshDeviceState(): void;
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
  onSelectedDeviceChange(): void;
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
      if (!entry && !device_kind) {
        return {
          ...device,
          active: false,
        };
      }

      return {
        ...device,
        id: entry?.id ?? device.id,
        vendor_id: entry?.vendor_id ?? device.vendor_id,
        product_id: entry?.product_id ?? device.product_id,
        name: entry?.name ?? device.name,
        raw_name: entry?.raw_name ?? device.raw_name,
        device_kind,
        active: !!entry,
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
    options.onSelectedDeviceChange();
    if (currentProfileName) {
      setSavedSelectedDeviceId(currentProfileName, deviceIdentity(device));
    }
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
        options.onSelectedDeviceChange();

        options.gridContainer.innerHTML = "";
        options.eventLogContainer.style.display = "none";
        options.setButtonGrid(null);
        options.destroyLayoutEditor();
        currentLayout = null;
        options.renderWorkspace();
        options.syncAuxPanels();

        if (currentProfile.devices.length > 0) {
          const savedDeviceId = getSavedSelectedDeviceId(name);
          const restoredDevice = currentProfile.devices.find(
            (device) => deviceIdentity(device) === savedDeviceId
          );
          await selectDevice(restoredDevice ?? currentProfile.devices[0]);
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
          if (currentProfileName) {
            setSavedSelectedDeviceId(currentProfileName, null);
          }
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

    async setDeviceMappingsEnabled(device: ProfileDevice, enabled: boolean) {
      if (!currentProfile || !currentProfileName) {
        throw new Error("Select a profile first");
      }

      const index = currentProfile.devices.findIndex((candidate) => isSameDevice(candidate, device));
      if (index < 0) return;

      const updatedDevice = { ...currentProfile.devices[index], mappings_enabled: enabled };
      const nextDevices = [...currentProfile.devices];
      nextDevices[index] = updatedDevice;
      const nextProfile = { ...currentProfile, devices: nextDevices };

      await invoke("save_profile", { name: currentProfileName, profile: nextProfile });
      currentProfile = nextProfile;
      if (isSameDevice(selectedDevice, device)) selectedDevice = updatedDevice;
      options.deviceBar.setDevices(nextDevices);
      options.deviceBar.setSelected(selectedDevice);
      options.onSelectedDeviceChange();
      // Re-arming releases held or toggled outputs before changing behavior.
      await options.syncMonitoringScope(true);
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

    refreshDeviceState() {
      if (!currentProfile) return;

      currentProfile.devices = hydrateDevices(currentProfile.devices);
      options.deviceBar.setDevices(currentProfile.devices);

      if (!selectedDevice) return;
      // Keep the selection pointed at the refreshed record so its
      // connected/offline state is the one the bar renders.
      selectedDevice =
        currentProfile.devices.find((device) => isSameDevice(device, selectedDevice)) ??
        selectedDevice;
      options.deviceBar.setSelected(selectedDevice);
    },

    findSystemEntry: (device) => findDeviceEntry(device, options.allDevices),
    getDeviceKind,
    isSameDevice,
  };
}
