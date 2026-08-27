import type { DeviceEntry } from "../device-modal";
import type { ProfileDeviceKind } from "../device-bar";

/// Matching a device recorded in a profile against what is plugged in now.
///
/// Identity is deliberately layered: the stored id first, then VID:PID
/// narrowed by name, then vendor + capability. A device can come back
/// under a different driver or transport, so the looser rungs are what
/// keep bindings attached to it.

export function normalizeDeviceLabel(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function deviceIdentity(device: { id?: string; vendor_id: number; product_id: number }): string {
  return device.id || `${device.vendor_id}:${device.product_id}`;
}

export function entrySupportsDeviceKind(
  entry: DeviceEntry,
  deviceKind?: ProfileDeviceKind,
): boolean {
  switch (deviceKind) {
    case "azeron":
      return entry.is_azeron;
    case "mouse":
      return entry.has_mouse;
    case "gamepad":
      return entry.has_gamepad;
    case "keyboard":
      return entry.has_keyboard;
    default:
      return true;
  }
}

export function collectDeviceAliases(
  device: { id?: string; name?: string; raw_name?: string },
): Set<string> {
  return new Set(
    [device.id, device.name, device.raw_name]
      .map((value) => normalizeDeviceLabel(value))
      .filter(Boolean)
  );
}

export function entryMatchesAliases(entry: DeviceEntry, aliases: Set<string>): boolean {
  if (aliases.size === 0) {
    return false;
  }

  const entryLabels = [entry.name, entry.raw_name, entry.id]
    .map((value) => normalizeDeviceLabel(value))
    .filter(Boolean);

  return entryLabels.some((label) => aliases.has(label));
}

export function findDeviceEntry(
  device: {
    id?: string;
    vendor_id: number;
    product_id: number;
    name?: string;
    raw_name?: string;
    device_kind?: ProfileDeviceKind;
  },
  allDevices: DeviceEntry[],
): DeviceEntry | null {
  const identity = deviceIdentity(device);
  const exactMatch = allDevices.find((entry) => entry.id === identity);
  if (exactMatch) return exactMatch;

  const aliases = collectDeviceAliases(device);
  const candidates = allDevices.filter(
    (entry) => entry.vendor_id === device.vendor_id && entry.product_id === device.product_id
  );
  const namedMatches = candidates.filter((entry) => entryMatchesAliases(entry, aliases));

  if (namedMatches.length === 1) return namedMatches[0];
  if (candidates.length === 1) return candidates[0];

  const vendorKindCandidates = allDevices.filter(
    (entry) => entry.vendor_id === device.vendor_id && entrySupportsDeviceKind(entry, device.device_kind)
  );
  const vendorKindNameMatches = vendorKindCandidates.filter((entry) => entryMatchesAliases(entry, aliases));
  if (vendorKindNameMatches.length === 1) return vendorKindNameMatches[0];

  return null;
}
