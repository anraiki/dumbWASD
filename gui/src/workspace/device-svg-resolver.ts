import { normalizeDeviceLabel } from "../profile-manager";
import type { ProfileDevice } from "../device-bar";
import type { DeviceSvgConfig } from "../devices/layout";
import {
  G502_SVG_CONFIG,
  VENDOR_ID as G502_VENDOR_ID,
  MODEL_SUBSTRING as G502_MODEL_SUBSTRING,
} from "../devices/g502";
import { XBOX_SVG_CONFIG } from "../devices/xbox";

function isG502XDevice(device: ProfileDevice): boolean {
  if (device.vendor_id !== G502_VENDOR_ID) return false;
  const labels = [device.name, device.raw_name].map(normalizeDeviceLabel).filter(Boolean);
  return labels.some((label) => label.includes(G502_MODEL_SUBSTRING));
}

export function resolveDeviceSvgConfig(device: ProfileDevice | null): DeviceSvgConfig | null {
  if (!device) return null;
  if (isG502XDevice(device)) return G502_SVG_CONFIG;
  if (device.device_kind === "gamepad") return XBOX_SVG_CONFIG;
  return null;
}
