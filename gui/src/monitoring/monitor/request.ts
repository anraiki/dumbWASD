import type { DeviceEntry } from "../../device-modal";
import type { ProfileManagerHandle } from "../../profile-manager";
import type { MonitoringRequest } from "./types";

/// Builds the monitoring request for the current profile/device/mode, and
/// reduces it to a comparable key. Split out of the monitor so the event
/// loop below stays about starting and stopping streams.
export interface RequestBuilderOptions {
  allDevices: DeviceEntry[];
  profileManager: ProfileManagerHandle;
  getIsMacroMode(): boolean;
  getListenAllDevices(): boolean;
}

export function createRequestBuilder(options: RequestBuilderOptions) {
  function getAllMonitoredPaths(): string[] {
    return [...new Set(options.allDevices.flatMap((device) => device.paths))];
  }

  /// Everything the backend actually receives, as one comparable string.
  ///
  /// Restarting monitoring tears down the listeners, clears every highlight
  /// and re-runs the connecting/connected sequence — visible as a flash. So
  /// the key has to cover the whole request, not just the paths, or callers
  /// are forced to pass `force` and pay that cost on every save.
  ///
  /// The mappings only matter when the backend is the one applying them;
  /// during normal monitoring the frontend reads them per event, so a
  /// binding change needs no restart at all.
  function requestKey(request: MonitoringRequest | null): string {
    if (!request) {
      return "";
    }

    return [
      [...request.devicePaths].sort().join("|"),
      request.useAzeronHid,
      request.suppressMappedInputs,
      request.suppressMappedInputs ? JSON.stringify(request.legacyMappings) : "",
    ].join("::");
  }

  function shouldSuppressMappedInputs(): boolean {
    const selectedDevice = options.profileManager.getSelectedDevice();
    const currentProfile = options.profileManager.getCurrentProfile();
    if (options.getIsMacroMode() || options.getListenAllDevices() || !selectedDevice || selectedDevice.mappings_enabled === false || !currentProfile?.mappings.length) {
      return false;
    }
    return selectedDevice.device_kind === "mouse" || selectedDevice.device_kind === "keyboard";
  }

  function buildRequest(): MonitoringRequest | null {
    const currentProfile = options.profileManager.getCurrentProfile();
    const selectedDevice = options.profileManager.getSelectedDevice();
    const selectedDeviceKey = selectedDevice?.id || (selectedDevice
      ? `${selectedDevice.vendor_id}:${selectedDevice.product_id}`
      : null);
    const legacyMappings = (currentProfile?.mappings ?? []).filter(
      (mapping) => !mapping.device || mapping.device === selectedDeviceKey,
    ) as MonitoringRequest["legacyMappings"];
    const suppressMappedInputs = shouldSuppressMappedInputs();

    if (options.getIsMacroMode()) {
      const keyboardPaths = options.allDevices
        .filter((device) => device.has_keyboard)
        .flatMap((device) => device.paths);

      const curatedPaths = currentProfile
        ? currentProfile.devices.flatMap((device) => {
            const entry = options.profileManager.findSystemEntry(device);
            return entry ? entry.paths : [];
          })
        : [];

      const devicePaths = [...new Set([...keyboardPaths, ...curatedPaths])];
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "Keyboards + curated gamepads",
        useAzeronHid: selectedDevice?.device_kind === "azeron",
        legacyMappings,
        suppressMappedInputs: false,
      };
    }

    if (options.getListenAllDevices()) {
      const devicePaths = getAllMonitoredPaths();
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "All detected devices",
        useAzeronHid: selectedDevice?.device_kind === "azeron",
        legacyMappings,
        suppressMappedInputs: false,
      };
    }

    if (!selectedDevice) return null;

    const entry = options.profileManager.findSystemEntry(selectedDevice);
    if (!entry) return null;

    return {
      devicePaths: entry.paths,
      label: entry.name,
      useAzeronHid: entry.is_azeron || selectedDevice.device_kind === "azeron",
      legacyMappings,
      suppressMappedInputs,
    };
  }

  return { buildRequest, requestKey, shouldSuppressMappedInputs, getAllMonitoredPaths };
}
