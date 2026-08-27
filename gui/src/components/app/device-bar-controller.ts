import { invoke } from "@tauri-apps/api/core";
import { createDeviceBar, type ProfileDevice } from "../../device-bar";
import { showDeviceModal, type DeviceEntry } from "../../device-modal";
import { showDeviceContextMenu } from "../../device-context-menu";
import { showDeleteDeviceDialog } from "../../device-delete-dialog";
import { showDevicePropertiesDialog } from "../../device-properties-dialog";
import type { ProfileManagerHandle } from "../../profile-manager";
import type { WorkspaceHandle } from "../../workspace/workspace";

interface DeviceRegistryToml {
  path: string;
  content: string;
}

export function createDeviceBarController(options: {
  deviceChipsEl: HTMLElement;
  addDeviceBtn: HTMLButtonElement;
  statusEl: HTMLElement;
  toggleModeBtn: HTMLButtonElement;
  macroBtn: HTMLButtonElement;
  allDevices: DeviceEntry[];
  getProfileManager(): ProfileManagerHandle;
  getWorkspace(): WorkspaceHandle;
  getIsMacroMode(): boolean;
  setIsMacroMode(val: boolean): void;
  setIsEditMode(val: boolean): void;
  getCloseDeviceContextMenu(): (() => void) | null;
  setCloseDeviceContextMenu(fn: (() => void) | null): void;
}) {
  async function showDeviceProperties(device: ProfileDevice) {
    const registryToml = await invoke<DeviceRegistryToml | null>("get_device_registry_toml", {
      vendorId: device.vendor_id,
      productId: device.product_id,
      name: device.name,
      rawName: device.raw_name ?? null,
    });
    showDevicePropertiesDialog({ deviceName: device.name, registryToml });
  }

  async function editDeviceLayout(device: ProfileDevice) {
    if (options.getIsMacroMode()) {
      options.setIsMacroMode(false);
      options.macroBtn.classList.remove("active");
    }

    await options.getProfileManager().selectDevice(device);

    const currentLayout = options.getProfileManager().getCurrentLayout();
    if (!currentLayout) {
      options.statusEl.textContent = `No layout available to edit for ${device.name}`;
      return;
    }

    options.setIsEditMode(true);
    options.toggleModeBtn.textContent = "View Mode";
    options.getWorkspace().render();
    options.statusEl.textContent = `Editing layout: ${currentLayout.device.name}`;
  }

  return createDeviceBar(options.deviceChipsEl, options.addDeviceBtn, {
    async onSelectDevice(device) {
      options.getCloseDeviceContextMenu()?.();
      options.setCloseDeviceContextMenu(null);
      await options.getProfileManager().selectDevice(device);
    },
    async onToggleMappings(device, enabled) {
      try {
        await options.getProfileManager().setDeviceMappingsEnabled(device, enabled);
        options.statusEl.textContent = `${device.name} mappings ${enabled ? "enabled" : "disabled"}`;
      } catch (error) {
        options.statusEl.textContent = `Error updating device mappings: ${error}`;
        throw error;
      }
    },
    async onAddDevice() {
      options.getCloseDeviceContextMenu()?.();
      options.setCloseDeviceContextMenu(null);
      const currentProfile = options.getProfileManager().getCurrentProfile();
      if (!currentProfile || !options.getProfileManager().getCurrentProfileName()) {
        options.statusEl.textContent = "Select a profile first";
        return;
      }
      showDeviceModal(options.allDevices, currentProfile.devices, {
        async onSelect(entry) {
          const newDevice: ProfileDevice = {
            id: entry.id,
            vendor_id: entry.vendor_id,
            product_id: entry.product_id,
            name: entry.name,
            raw_name: entry.raw_name,
            layout: "",
            device_kind: options.getProfileManager().getDeviceKind(entry),
          };
          try {
            await options.getProfileManager().addDevice(newDevice);
          } catch (e) {
            options.statusEl.textContent = `Error saving profile: ${e}`;
            return;
          }
          await options.getProfileManager().selectDevice(newDevice);
        },
        onClose() {},
      });
    },
    onOpenDeviceMenu(device, position) {
      options.getCloseDeviceContextMenu()?.();
      options.setCloseDeviceContextMenu(showDeviceContextMenu({
        device,
        x: position.x,
        y: position.y,
        onProperties: (targetDevice) => {
          options.setCloseDeviceContextMenu(null);
          void showDeviceProperties(targetDevice).catch((error) => {
            options.statusEl.textContent = `Error loading device properties: ${error}`;
          });
        },
        onEditLayout: (targetDevice) => {
          options.setCloseDeviceContextMenu(null);
          void editDeviceLayout(targetDevice).catch((error) => {
            options.statusEl.textContent = `Error opening layout editor: ${error}`;
          });
        },
        onDelete: (targetDevice) => {
          options.setCloseDeviceContextMenu(null);
          showDeleteDeviceDialog({
            device: targetDevice,
            onConfirm: async () => {
              await options.getProfileManager().deleteDevice(targetDevice);
            },
          });
        },
      }));
    },
  });
}
