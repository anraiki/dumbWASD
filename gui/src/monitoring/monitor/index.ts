import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DeviceEntry } from "../../device-modal";
import type { ProfileManagerHandle } from "../../profile-manager";
import { createRequestBuilder } from "./request";
import type {
  AzeronHidReportEvent,
  AzeronJoystickStateEvent,
  AxisStateEvent,
  ButtonStateEvent,
  MonitoringRequest,
  MonitorHandle,
} from "./types";

export type { MonitoringRequest, MonitorHandle } from "./types";

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
  let monitoredRequestKey = "";
  let unlistenButtonState: (() => void) | null = null;
  let unlistenAxisState: (() => void) | null = null;
  let unlistenAzeronJoystickState: (() => void) | null = null;
  let unlistenAzeronHidReport: (() => void) | null = null;

  const { buildRequest, requestKey } = createRequestBuilder({
    allDevices: options.allDevices,
    profileManager: options.profileManager,
    getIsMacroMode: options.getIsMacroMode,
    getListenAllDevices: options.getListenAllDevices,
  });


  async function start(request: MonitoringRequest, { quiet = false }: { quiet?: boolean } = {}) {
    try {
      if (!quiet) {
        options.connectionIndicator.className = "connection-indicator connecting";
        options.connectionIndicator.title = "Connecting...";
        options.statusEl.textContent = "Connecting...";
      }

      await invoke("start_monitoring", {
        devicePaths: request.devicePaths,
        useAzeronHid: request.useAzeronHid,
        legacyMappings: request.legacyMappings,
        suppressMappedInputs: request.suppressMappedInputs,
      });

      active = true;
      runtimeRemapActive = request.suppressMappedInputs;
      monitoredRequestKey = requestKey(request);
      options.reconnectBtn.style.display = "none";
      options.macroStudio.setMonitoringActive(true);
      options.connectionIndicator.className = "connection-indicator connected";
      options.connectionIndicator.title = "Connected";
      options.statusEl.textContent = request.label;
      options.syncAuxPanels();
      if (!quiet) {
        options.eventLogHandle.addMonitoringLogEntry(
          `Monitoring · HID ${request.useAzeronHid ? "enabled" : "disabled"} · paths ${request.devicePaths.join(", ")}`
        );
      }

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
      monitoredRequestKey = "";
      options.macroStudio.setMonitoringActive(false);
      options.syncAuxPanels();
    }
  }

  /// `quiet` re-arms the same device in place: the backend stream is still
  /// replaced, but the disconnected/connecting indicator, the status text
  /// and the highlight reset are skipped, so the swap is invisible.
  async function stop({ quiet = false }: { quiet?: boolean } = {}) {
    try {
      await invoke("stop_monitoring");
    } catch (_) {
      // ignore
    }

    active = false;
    runtimeRemapActive = false;
    monitoredRequestKey = "";

    if (!quiet) {
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
    }

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
      const nextKey = requestKey(request);

      if (!request) {
        if (active) {
          await stop();
        } else {
          monitoredRequestKey = "";
          runtimeRemapActive = false;
          options.macroStudio.setMonitoringActive(false);
          options.syncAuxPanels();
        }
        return;
      }

      if (!force && active && nextKey === monitoredRequestKey) {
        options.macroStudio.setMonitoringActive(true);
        options.syncAuxPanels();
        return;
      }

      // Same device, different mappings — the backend needs the new list,
      // but the user should not see the stream being swapped underneath a
      // save. Re-arm in place instead of a visible disconnect/reconnect.
      const samePaths =
        monitoredRequestKey.split("::")[0] === nextKey.split("::")[0];
      const quiet = active && samePaths;

      if (active) {
        await stop({ quiet });
      }

      await start(request, { quiet });
    },

    stop,
    isActive: () => active,
  };
}
