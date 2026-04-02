import config from "./config.toml";

const { center: JOYSTICK_CENTER, span: JOYSTICK_SPAN, keyboard_direction_codes } =
  (config as { joystick: { center: number; span: number; keyboard_direction_codes: number[] } }).joystick;

const KEYBOARD_DIRECTION_CODES = new Set(keyboard_direction_codes);

const JOYSTICK_AXIS_CODES = new Set([0, 1]);
const JOYSTICK_ACTIVITY_WINDOW_MS = 140;
const JOYSTICK_DEFAULT_MIN = 0;
const JOYSTICK_DEFAULT_MAX = 1023;

interface DeviceInfo {
  is_azeron: boolean;
  has_gamepad: boolean;
  has_keyboard: boolean;
  has_mouse: boolean;
}

export interface JoystickTrackerHandle {
  recordMotion(axis: number, value: number, devicePath: string, deviceName?: string): void;
  updateVector(
    axis: number,
    value: number,
    devicePath: string,
    deviceName?: string,
    minimum?: number,
    maximum?: number,
    flat?: number,
  ): void;
  updateVectorFromAzeronHid(payload: { x: number; y: number }): void;
  shouldTreatAsEmulated(code: number, pressed: boolean): boolean;
  getCurrentVector(): { x: number; y: number } | null;
  reset(): void;
}

export function createJoystickTracker(options: {
  isSelectedAzeron(): boolean;
  findDeviceByPath(path: string): DeviceInfo | null;
  getSelectedDevicePaths(): string[] | null;
  onVectorChange(x: number, y: number): void;
}): JoystickTrackerHandle {
  const joystickAxisValues = new Map<string, Map<number, number>>();
  const joystickAxisNormalized = new Map<string, Map<number, number>>();
  const joystickEmulatedDirectionCodes = new Set<number>();
  let lastJoystickMotionAt = 0;
  let currentJoystickVector: { x: number; y: number } | null = null;

  function isLikelyJoystickAxisSource(devicePath: string, deviceName?: string): boolean {
    const sourceEntry = options.findDeviceByPath(devicePath);
    if (sourceEntry) {
      if (sourceEntry.is_azeron || sourceEntry.has_gamepad) {
        return true;
      }
      if (sourceEntry.has_keyboard || sourceEntry.has_mouse) {
        const selectedPaths = options.getSelectedDevicePaths();
        if (selectedPaths?.includes(devicePath)) {
          return true;
        }
      }
    }

    const lower = (deviceName || "").toLowerCase();
    if (lower.includes("keyboard") || lower.includes("mouse")) {
      return false;
    }
    return lower.includes("gamepad") || lower.includes("joystick") || lower.includes("azeron");
  }

  function normalizeJoystickAxisValue(value: number, minimum?: number, maximum?: number, flat?: number): number {
    const min = minimum ?? JOYSTICK_DEFAULT_MIN;
    const max = maximum ?? JOYSTICK_DEFAULT_MAX;
    if (max <= min) {
      return 0;
    }

    const center = min + (max - min) / 2;
    const span = Math.max((max - min) / 2, 1);
    const normalized = Math.max(-1, Math.min(1, (value - center) / span));
    if (!flat) {
      return normalized;
    }

    const deadzone = Math.min(Math.abs(flat / span), 0.45);
    if (Math.abs(normalized) <= deadzone) {
      return 0;
    }

    return normalized;
  }

  function normalizeAzeronJoystickValue(value: number): number {
    return Math.max(-1, Math.min(1, (value - JOYSTICK_CENTER) / JOYSTICK_SPAN));
  }

  return {
    recordMotion(axis: number, value: number, devicePath: string, deviceName?: string) {
      if (!JOYSTICK_AXIS_CODES.has(axis) || !isLikelyJoystickAxisSource(devicePath, deviceName)) {
        return;
      }

      let pathAxes = joystickAxisValues.get(devicePath);
      if (!pathAxes) {
        pathAxes = new Map<number, number>();
        joystickAxisValues.set(devicePath, pathAxes);
      }

      const previous = pathAxes.get(axis);
      pathAxes.set(axis, value);

      if (previous === undefined || previous !== value) {
        lastJoystickMotionAt = Date.now();
      }
    },

    updateVector(
      axis: number,
      value: number,
      devicePath: string,
      deviceName?: string,
      minimum?: number,
      maximum?: number,
      flat?: number,
    ) {
      if (options.isSelectedAzeron()) {
        return;
      }
      if (!JOYSTICK_AXIS_CODES.has(axis) || !isLikelyJoystickAxisSource(devicePath, deviceName)) {
        return;
      }

      let pathAxes = joystickAxisNormalized.get(devicePath);
      if (!pathAxes) {
        pathAxes = new Map<number, number>();
        joystickAxisNormalized.set(devicePath, pathAxes);
      }

      const normalized = normalizeJoystickAxisValue(value, minimum, maximum, flat);
      pathAxes.set(axis, normalized);

      currentJoystickVector = {
        x: pathAxes.get(0) ?? 0,
        y: pathAxes.get(1) ?? 0,
      };

      options.onVectorChange(currentJoystickVector.x, currentJoystickVector.y);
    },

    updateVectorFromAzeronHid(payload: { x: number; y: number }) {
      if (!options.isSelectedAzeron()) {
        return;
      }

      lastJoystickMotionAt = Date.now();
      currentJoystickVector = {
        x: normalizeAzeronJoystickValue(payload.x),
        y: normalizeAzeronJoystickValue(payload.y),
      };

      options.onVectorChange(currentJoystickVector.x, currentJoystickVector.y);
    },

    shouldTreatAsEmulated(code: number, pressed: boolean): boolean {
      if (!options.isSelectedAzeron() || !KEYBOARD_DIRECTION_CODES.has(code)) {
        return false;
      }

      if (pressed) {
        const isRecentJoystickMotion = (Date.now() - lastJoystickMotionAt) <= JOYSTICK_ACTIVITY_WINDOW_MS;
        if (isRecentJoystickMotion) {
          joystickEmulatedDirectionCodes.add(code);
          return true;
        }
        return false;
      }

      if (joystickEmulatedDirectionCodes.has(code)) {
        joystickEmulatedDirectionCodes.delete(code);
        return true;
      }

      return false;
    },

    getCurrentVector() {
      return currentJoystickVector;
    },

    reset() {
      joystickEmulatedDirectionCodes.clear();
      joystickAxisValues.clear();
      joystickAxisNormalized.clear();
      lastJoystickMotionAt = 0;
      currentJoystickVector = null;
    },
  };
}
