import { invoke } from "@tauri-apps/api/core";
import type { DeviceEntry } from "./device-modal";

export interface StartupData {
  allDevices: DeviceEntry[];
  layouts: string[];
}

export async function loadStartupData(statusEl: HTMLElement): Promise<StartupData> {
  let allDevices: DeviceEntry[] = [];
  try {
    allDevices = await invoke<DeviceEntry[]>("list_devices");
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  let layouts: string[] = [];
  try {
    layouts = await invoke<string[]>("list_layouts");
  } catch (e) {
    statusEl.textContent = `Error loading layouts: ${e}`;
  }

  return { allDevices, layouts };
}
