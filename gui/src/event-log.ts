import { getInputCodeLabel } from "./input-codes";

const REL_AXIS_NAMES: Record<number, string> = {
  0: "REL_X",
  1: "REL_Y",
  6: "REL_HWHEEL",
  8: "REL_WHEEL",
  11: "REL_WHEEL_HI_RES",
  12: "REL_HWHEEL_HI_RES",
};

// Absolute axes carry range info (min/max from the device's absinfo);
// relative axes never do. That is how the two are told apart below.
const ABS_AXIS_NAMES: Record<number, string> = {
  0: "ABS_X",
  1: "ABS_Y",
  2: "ABS_Z",
  3: "ABS_RX",
  4: "ABS_RY",
  5: "ABS_RZ",
  16: "ABS_HAT0X",
  17: "ABS_HAT0Y",
};

const MAX_LOG_ENTRIES = 100;

function appendEntry(eventLogEl: HTMLElement, entry: HTMLDivElement) {
  eventLogEl.appendChild(entry);
  eventLogEl.scrollTop = eventLogEl.scrollHeight;
  while (eventLogEl.children.length > MAX_LOG_ENTRIES) {
    eventLogEl.removeChild(eventLogEl.firstChild!);
  }
}

export interface EventLogHandle {
  addEventLogEntry(code: number, pressed: boolean, devicePath?: string, deviceName?: string): void;
  addAxisLogEntry(
    axis: number,
    value: number,
    devicePath?: string,
    deviceName?: string,
    minimum?: number,
    maximum?: number,
    flat?: number,
  ): void;
  addAzeronHidReportLogEntry(payload: unknown): void;
  addMonitoringLogEntry(message: string): void;
}

export function createEventLog(
  eventLogEl: HTMLElement,
  findDeviceByPath: (path: string) => { name: string } | null,
): EventLogHandle {
  return {
    addEventLogEntry(code: number, pressed: boolean, devicePath?: string, deviceName?: string) {
      const name = getInputCodeLabel(code);
      const action = pressed ? "PRESS" : "RELEASE";
      const sourceEntry = devicePath ? findDeviceByPath(devicePath) : null;
      const sourceLabel = deviceName || sourceEntry?.name || devicePath || "Unknown device";
      const entry = document.createElement("div");
      entry.className = `event-entry ${pressed ? "event-press" : "event-release"}`;
      entry.textContent = `${sourceLabel} · ${name} (${code}) ${action}`;
      if (devicePath) {
        entry.title = devicePath;
      }
      appendEntry(eventLogEl, entry);
    },

    addAxisLogEntry(
      axis: number,
      value: number,
      devicePath?: string,
      deviceName?: string,
      minimum?: number,
      maximum?: number,
      flat?: number,
    ) {
      const hasRange = typeof minimum === "number" && typeof maximum === "number" && maximum > minimum;
      const name = hasRange
        ? ABS_AXIS_NAMES[axis] || `ABS_${axis}`
        : REL_AXIS_NAMES[axis] || `REL_${axis}`;
      const sourceEntry = devicePath ? findDeviceByPath(devicePath) : null;
      const sourceLabel = deviceName || sourceEntry?.name || devicePath || "Unknown device";
      const entry = document.createElement("div");
      entry.className = "event-entry event-axis";
      const normalized = hasRange
        ? Math.round((((value - minimum) / (maximum - minimum)) * 2 - 1) * 100)
        : null;
      const flatText = typeof flat === "number" ? ` flat ${flat}` : "";
      const rangeText = hasRange ? ` range ${minimum}..${maximum}` : "";
      const normalizedText = normalized === null ? "" : ` norm ${normalized >= 0 ? "+" : ""}${normalized}%`;
      entry.textContent = `${sourceLabel} · ${name} (${axis}) value ${value}${rangeText}${flatText}${normalizedText}`;
      if (devicePath) {
        entry.title = devicePath;
      }
      appendEntry(eventLogEl, entry);
    },

    addAzeronHidReportLogEntry(_payload: unknown) {
      return;
    },

    addMonitoringLogEntry(message: string) {
      const entry = document.createElement("div");
      entry.className = "event-entry event-axis";
      entry.textContent = message;
      appendEntry(eventLogEl, entry);
    },
  };
}
