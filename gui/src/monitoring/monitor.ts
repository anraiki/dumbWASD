import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DeviceEntry } from "../device-modal";
import type { ProfileManagerHandle } from "../profile-manager";

// ── Event payload types ──

interface ButtonStateEvent {
  code: number;
  pressed: boolean;
  device_path: string;
  device_name: string;
}

interface AxisStateEvent {
  axis: number;
  value: number;
  device_path: string;
  device_name: string;
  minimum?: number;
  maximum?: number;
  flat?: number;
}

interface AzeronJoystickStateEvent {
  x: number;
  y: number;
  raw_x: number;
  raw_y: number;
  source: string;
}

interface AzeronHidReportEvent {
  length: number;
  hex: string;
  ascii?: string | null;
  parsed_source?: string | null;
}

// ── Public types ──

export interface MonitoringRequest {
  devicePaths: string[];
  label: string;
  useAzeronHid: boolean;
  legacyMappings: Array<{ device?: string; from: number; to: Record<string, unknown> }>;
  suppressMappedInputs: boolean;
}

export interface MonitorHandle {
  syncScope(force?: boolean): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
}

// ── Constants ──

const MOUSE_BUTTON_CODES = new Set([272, 273, 274, 275, 276]);

// ── Factory ──

export function createMonitor(options: {
  allDevices: DeviceEntry[];
  profileManager: ProfileManagerHandle;
  getIsMacroMode(): boolean;
  getListenAllDevices(): boolean;
  statusEl: HTMLElement;
  connectionIndicator: HTMLElement;
  reconnectBtn: HTMLElement;
  macroStudio: {
    setMonitoringActive(active: boolean): void;
    handleInputEvent(code: number, pressed: boolean): void;
  };
  joystickTracker: {
    shouldTreatAsEmulated(code: number, pressed: boolean): boolean;
    updateVectorFromAzeronHid(payload: { x: number; y: number }): void;
    recordMotion(axis: number, value: number, devicePath: string, deviceName?: string): void;
    updateVector(axis: number, value: number, devicePath: string, deviceName?: string, minimum?: number, maximum?: number, flat?: number): void;
    reset(): void;
  };
  eventLogHandle: {
    addEventLogEntry(code: number, pressed: boolean, devicePath: string, deviceName: string): void;
    addAxisLogEntry(axis: number, value: number, devicePath: string, deviceName: string, minimum?: number, maximum?: number, flat?: number): void;
    addAzeronHidReportLogEntry(payload: AzeronHidReportEvent): void;
    addMonitoringLogEntry(message: string): void;
  };
  pressedButtons: Set<number>;
  getButtonGrid(): { clearAll(): void; setButtonState(code: number, pressed: boolean, opts?: { suppressPhysical?: boolean }): void } | null;
  getLayoutEditor(): { clearAll(): void; setButtonState(code: number, pressed: boolean, opts?: { suppressPhysical?: boolean }): void } | null;
  getDeviceSvgPreview(): { clearAll(): void; setButtonState(code: number, pressed: boolean): void } | null;
  emitLegacyButtonMapping(code: number, pressed: boolean): Promise<void>;
  syncAuxPanels(): void;
}): MonitorHandle {
  let active = false;
  let runtimeRemapActive = false;
  let monitoredPathsKey = "";
  let unlistenButtonState: (() => void) | null = null;
  let unlistenAxisState: (() => void) | null = null;
  let unlistenAzeronJoystickState: (() => void) | null = null;
  let unlistenAzeronHidReport: (() => void) | null = null;

  function getAllMonitoredPaths(): string[] {
    return [...new Set(options.allDevices.flatMap((device) => device.paths))];
  }

  function shouldSuppressMappedInputs(): boolean {
    const selectedDevice = options.profileManager.getSelectedDevice();
    const currentProfile = options.profileManager.getCurrentProfile();
    if (options.getIsMacroMode() || options.getListenAllDevices() || !selectedDevice || !currentProfile?.mappings.length) {
      return false;
    }
    return selectedDevice.device_kind === "mouse" || selectedDevice.device_kind === "keyboard";
  }

  function buildRequest(): MonitoringRequest | null {
    const currentProfile = options.profileManager.getCurrentProfile();
    const selectedDevice = options.profileManager.getSelectedDevice();
    const legacyMappings = (currentProfile?.mappings ?? []) as MonitoringRequest["legacyMappings"];
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

  async function start(request: MonitoringRequest) {
    try {
      options.connectionIndicator.className = "connection-indicator connecting";
      options.connectionIndicator.title = "Connecting...";
      options.statusEl.textContent = "Connecting...";

      await invoke("start_monitoring", {
        devicePaths: request.devicePaths,
        useAzeronHid: request.useAzeronHid,
        legacyMappings: request.legacyMappings,
        suppressMappedInputs: request.suppressMappedInputs,
      });

      active = true;
      runtimeRemapActive = request.suppressMappedInputs;
      monitoredPathsKey = [...request.devicePaths].sort().join("|");
      options.reconnectBtn.style.display = "none";
      options.macroStudio.setMonitoringActive(true);
      options.connectionIndicator.className = "connection-indicator connected";
      options.connectionIndicator.title = "Connected";
      options.statusEl.textContent = request.label;
      options.syncAuxPanels();
      options.eventLogHandle.addMonitoringLogEntry(
        `Monitoring · HID ${request.useAzeronHid ? "enabled" : "disabled"} · paths ${request.devicePaths.join(", ")}`
      );

      unlistenButtonState = await listen<ButtonStateEvent>("button-state", (event) => {
        const { code, pressed, device_path: devicePath, device_name: deviceName } = event.payload;
        const suppressPhysicalHighlight = options.joystickTracker.shouldTreatAsEmulated(code, pressed);

        if (pressed) {
          options.pressedButtons.add(code);
        } else {
          options.pressedButtons.delete(code);
        }

        if (!suppressPhysicalHighlight) {
          options.eventLogHandle.addEventLogEntry(code, pressed, devicePath, deviceName);
        }

        if (!MOUSE_BUTTON_CODES.has(code)) {
          options.macroStudio.handleInputEvent(code, pressed);
        }

        options.getButtonGrid()?.setButtonState(code, pressed, { suppressPhysical: suppressPhysicalHighlight });
        options.getLayoutEditor()?.setButtonState(code, pressed, { suppressPhysical: suppressPhysicalHighlight });
        options.getDeviceSvgPreview()?.setButtonState(code, pressed);

        if (!runtimeRemapActive) {
          void options.emitLegacyButtonMapping(code, pressed).catch((error) => {
            options.statusEl.textContent = `Error applying mapping: ${error}`;
          });
        }
      });

      unlistenAzeronJoystickState = await listen<AzeronJoystickStateEvent>("azeron-joystick-state", (event) => {
        options.joystickTracker.updateVectorFromAzeronHid(event.payload);
      });

      unlistenAzeronHidReport = await listen<AzeronHidReportEvent>("azeron-hid-report", (event) => {
        options.eventLogHandle.addAzeronHidReportLogEntry(event.payload);
      });

      unlistenAxisState = await listen<AxisStateEvent>("axis-state", (event) => {
        const { axis, value, device_path: devicePath, device_name: deviceName, minimum, maximum, flat } = event.payload;
        options.joystickTracker.recordMotion(axis, value, devicePath, deviceName);
        options.joystickTracker.updateVector(axis, value, devicePath, deviceName, minimum, maximum, flat);
        options.eventLogHandle.addAxisLogEntry(axis, value, devicePath, deviceName, minimum, maximum, flat);
      });
    } catch (e) {
      options.connectionIndicator.className = "connection-indicator disconnected";
      options.connectionIndicator.title = "Disconnected";
      options.statusEl.textContent = `Connection error: ${e}`;
      options.reconnectBtn.style.display = "inline-block";
      monitoredPathsKey = "";
      options.macroStudio.setMonitoringActive(false);
      options.syncAuxPanels();
    }
  }

  async function stop() {
    try {
      await invoke("stop_monitoring");
    } catch (_) {
      // ignore
    }

    active = false;
    runtimeRemapActive = false;
    monitoredPathsKey = "";
    options.connectionIndicator.className = "connection-indicator disconnected";
    options.connectionIndicator.title = "Disconnected";
    options.reconnectBtn.style.display = "none";
    options.getButtonGrid()?.clearAll();
    options.getLayoutEditor()?.clearAll();
    options.getDeviceSvgPreview()?.clearAll();
    options.pressedButtons.clear();
    options.joystickTracker.reset();
    options.macroStudio.setMonitoringActive(false);
    options.syncAuxPanels();

    unlistenButtonState?.();
    unlistenButtonState = null;
    unlistenAxisState?.();
    unlistenAxisState = null;
    unlistenAzeronJoystickState?.();
    unlistenAzeronJoystickState = null;
    unlistenAzeronHidReport?.();
    unlistenAzeronHidReport = null;
  }

  return {
    async syncScope(force = false) {
      const request = buildRequest();
      const nextKey = request ? [...request.devicePaths].sort().join("|") : "";

      if (!request) {
        if (active) {
          await stop();
        } else {
          monitoredPathsKey = "";
          runtimeRemapActive = false;
          options.macroStudio.setMonitoringActive(false);
          options.syncAuxPanels();
        }
        return;
      }

      if (!force && active && nextKey === monitoredPathsKey) {
        options.macroStudio.setMonitoringActive(true);
        options.syncAuxPanels();
        return;
      }

      if (active) {
        await stop();
      }

      await start(request);
    },

    stop,
    isActive: () => active,
  };
}
