/// Remembers which device was last selected per profile, in localStorage.
/// Split out of the profile manager so the manager stays about profiles.

const SELECTED_DEVICE_STORAGE_KEY = "dumbwasd:selected-device-by-profile";

function loadSelectedDeviceMap(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SELECTED_DEVICE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

function saveSelectedDeviceMap(value: Record<string, string>) {
  try {
    window.localStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures and continue with in-memory state.
  }
}

export function getSavedSelectedDeviceId(profileName: string): string | null {
  const selectedByProfile = loadSelectedDeviceMap();
  return selectedByProfile[profileName] ?? null;
}

export function setSavedSelectedDeviceId(profileName: string, deviceId: string | null) {
  const selectedByProfile = loadSelectedDeviceMap();
  if (deviceId) {
    selectedByProfile[profileName] = deviceId;
  } else {
    delete selectedByProfile[profileName];
  }
  saveSelectedDeviceMap(selectedByProfile);
}
