import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DeviceEntry } from "../../device-modal";

/// Keeps the app's device list live.
///
/// The backend watches /dev/input and emits `devices-changed` when a node
/// appears or disappears. Without this the list was enumerated once at
/// startup, so a controller that was replugged went on looking connected
/// while its reader was gone — and a newly plugged one needed an app restart
/// to show up at all.

export interface DevicesChanged {
  added: string[];
  removed: string[];
}

export interface DeviceHotplugHandle {
  start(): Promise<void>;
  stop(): void;
  refresh(): Promise<void>;
}

export function createDeviceHotplug(options: {
  statusEl: HTMLElement;
  replaceDevices(devices: DeviceEntry[]): void;
  onRefreshed(): Promise<void> | void;
}): DeviceHotplugHandle {
  let unlisten: UnlistenFn | null = null;
  let refreshing = false;
  let queued = false;

  async function refresh(): Promise<void> {
    // Unplugging a composite device fires several times in a row; collapse
    // them so re-enumeration and the monitoring restart happen once.
    if (refreshing) {
      queued = true;
      return;
    }

    refreshing = true;
    try {
      options.replaceDevices(await invoke<DeviceEntry[]>("list_devices"));
      await options.onRefreshed();
    } catch (e) {
      options.statusEl.textContent = `Error refreshing devices: ${e}`;
    } finally {
      refreshing = false;
      if (queued) {
        queued = false;
        await refresh();
      }
    }
  }

  return {
    async start() {
      if (unlisten) return;
      unlisten = await listen<DevicesChanged>("devices-changed", () => {
        void refresh();
      });
    },

    stop() {
      unlisten?.();
      unlisten = null;
    },

    refresh,
  };
}
