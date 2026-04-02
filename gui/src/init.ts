import { invoke } from "@tauri-apps/api/core";
import type { AppState } from "./store/app-state";
import type { DeviceEntry } from "./device-modal";

export async function initStore(store: AppState, statusEl: HTMLElement): Promise<void> {
  try {
    const allDevices = await invoke<DeviceEntry[]>("list_devices");
    store.setAllDevices(allDevices);
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  try {
    const layouts = await invoke<string[]>("list_layouts");
    store.setLayouts(layouts);
  } catch (e) {
    statusEl.textContent = `Error loading layouts: ${e}`;
  }
}
