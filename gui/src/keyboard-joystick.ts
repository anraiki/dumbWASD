export type KeyboardJoystickDirection = "up" | "left" | "down" | "right";

export interface KeyboardJoystickState {
  up: boolean;
  left: boolean;
  down: boolean;
  right: boolean;
  analogX: number | null;
  analogY: number | null;
}

interface KeyboardJoystickPresentation {
  resolvedDirections: Record<KeyboardJoystickDirection, boolean>;
  displayText: string;
  isActive: boolean;
  axisX: number;
  axisY: number;
  magnitude: number;
  offsetX: number;
  offsetY: number;
}

interface KeyboardJoystickBindings {
  display: HTMLElement | null;
  circle: HTMLElement | null;
  puck: HTMLElement | null;
  vector: HTMLElement | null;
  axisValues: {
    x: HTMLElement | null;
    y: HTMLElement | null;
  };
  axisFills: {
    x: HTMLElement | null;
    y: HTMLElement | null;
  };
  directions: Partial<Record<KeyboardJoystickDirection, HTMLElement | null>>;
  frameId: number | null;
  pendingState: KeyboardJoystickState | null;
  lastDisplayText: string | null;
  lastActive: boolean | null;
  lastTransform: string | null;
  lastDirections: Record<KeyboardJoystickDirection, boolean | null>;
}

interface KeyboardJoystickDirectionConfig {
  direction: KeyboardJoystickDirection;
  code: number;
  label: string;
}

const MAX_PUCK_OFFSET_PX = 26;
export const KEYBOARD_JOYSTICK_IDLE_DISPLAY_TEXT = "Analog Joystick";
const ANALOG_DIRECTION_THRESHOLD = 0.24;
const ANALOG_ACTIVE_EPSILON = 0.04;

const DIRECTION_CONFIG: KeyboardJoystickDirectionConfig[] = [
  { direction: "up", code: 17, label: "W" },
  { direction: "left", code: 30, label: "A" },
  { direction: "down", code: 31, label: "S" },
  { direction: "right", code: 32, label: "D" },
];

const CODE_TO_DIRECTION = new Map<number, KeyboardJoystickDirection>(
  DIRECTION_CONFIG.map(({ code, direction }) => [code, direction])
);
const JOYSTICK_BINDINGS = new WeakMap<ParentNode, KeyboardJoystickBindings>();

export function isKeyboardJoystickDirectionCode(code: number): boolean {
  return CODE_TO_DIRECTION.has(code);
}

export function createKeyboardJoystickState(): KeyboardJoystickState {
  return {
    up: false,
    left: false,
    down: false,
    right: false,
    analogX: null,
    analogY: null,
  };
}

export function resetKeyboardJoystickState(state: KeyboardJoystickState): void {
  state.up = false;
  state.left = false;
  state.down = false;
  state.right = false;
  state.analogX = null;
  state.analogY = null;
}

export function setKeyboardJoystickDirection(
  state: KeyboardJoystickState,
  code: number,
  pressed: boolean
): boolean {
  const direction = CODE_TO_DIRECTION.get(code);
  if (!direction) {
    return false;
  }

  state[direction] = pressed;
  return true;
}

function clampAnalogValue(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function formatAnalogPercent(value: number): string {
  const percent = Math.round(clampAnalogValue(value) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export function setKeyboardJoystickAnalog(
  state: KeyboardJoystickState,
  x: number,
  y: number
): void {
  state.analogX = clampAnalogValue(x);
  state.analogY = clampAnalogValue(y);
}

export function clearKeyboardJoystickAnalog(state: KeyboardJoystickState): void {
  state.analogX = null;
  state.analogY = null;
}

function getKeyboardJoystickPresentation(state: KeyboardJoystickState): KeyboardJoystickPresentation {
  const hasAnalog = state.analogX !== null && state.analogY !== null;
  const xAxis = hasAnalog
    ? clampAnalogValue(state.analogX ?? 0)
    : Number(state.right) - Number(state.left);
  const yAxis = hasAnalog
    ? clampAnalogValue(state.analogY ?? 0)
    : Number(state.down) - Number(state.up);
  const magnitude = Math.hypot(xAxis, yAxis);
  const resolvedDirections = hasAnalog
    ? {
        up: yAxis <= -ANALOG_DIRECTION_THRESHOLD,
        left: xAxis <= -ANALOG_DIRECTION_THRESHOLD,
        down: yAxis >= ANALOG_DIRECTION_THRESHOLD,
        right: xAxis >= ANALOG_DIRECTION_THRESHOLD,
      }
    : {
        up: state.up,
        left: state.left,
        down: state.down,
        right: state.right,
      };
  const activeLabels = DIRECTION_CONFIG
    .filter(({ direction }) => resolvedDirections[direction])
    .map(({ label }) => label);
  const offsetX = xAxis * MAX_PUCK_OFFSET_PX;
  const offsetY = yAxis * MAX_PUCK_OFFSET_PX;
  const displayText = hasAnalog
    ? magnitude >= ANALOG_ACTIVE_EPSILON
      ? `X ${formatAnalogPercent(xAxis)} · Y ${formatAnalogPercent(yAxis)}`
      : KEYBOARD_JOYSTICK_IDLE_DISPLAY_TEXT
    : activeLabels.length > 0
      ? activeLabels.join(" + ")
      : KEYBOARD_JOYSTICK_IDLE_DISPLAY_TEXT;

  return {
    resolvedDirections,
    displayText,
    isActive: hasAnalog ? magnitude >= ANALOG_ACTIVE_EPSILON : activeLabels.length > 0,
    axisX: xAxis,
    axisY: yAxis,
    magnitude,
    offsetX,
    offsetY,
  };
}

function getKeyboardJoystickBindings(root: ParentNode): KeyboardJoystickBindings {
  let bindings = JOYSTICK_BINDINGS.get(root);
  if (bindings) {
    return bindings;
  }

  bindings = {
    display: root.querySelector<HTMLElement>("[data-joystick-display]"),
    circle: root.querySelector<HTMLElement>("[data-joystick-circle]"),
    puck: root.querySelector<HTMLElement>("[data-joystick-puck]"),
    vector: root.querySelector<HTMLElement>("[data-joystick-vector]"),
    axisValues: {
      x: root.querySelector<HTMLElement>("[data-joystick-axis-value=\"x\"]"),
      y: root.querySelector<HTMLElement>("[data-joystick-axis-value=\"y\"]"),
    },
    axisFills: {
      x: root.querySelector<HTMLElement>("[data-joystick-axis-fill=\"x\"]"),
      y: root.querySelector<HTMLElement>("[data-joystick-axis-fill=\"y\"]"),
    },
    directions: {},
    frameId: null,
    pendingState: null,
    lastDisplayText: null,
    lastActive: null,
    lastTransform: null,
    lastDirections: {
      up: null,
      left: null,
      down: null,
      right: null,
    },
  };

  for (const { direction } of DIRECTION_CONFIG) {
    bindings.directions[direction] = root.querySelector<HTMLElement>(`[data-joystick-dir="${direction}"]`);
  }

  JOYSTICK_BINDINGS.set(root, bindings);
  return bindings;
}

function renderKeyboardJoystickState(
  root: ParentNode,
  bindings: KeyboardJoystickBindings,
  state: KeyboardJoystickState
): void {
  const presentation = getKeyboardJoystickPresentation(state);
  const transform = `translate(-50%, -50%) translate3d(${presentation.offsetX.toFixed(1)}px, ${presentation.offsetY.toFixed(1)}px, 0)`;
  const vectorTransform = `translateY(-50%) rotate(${Math.atan2(presentation.axisY, presentation.axisX)}rad)`;
  const vectorWidth = `${(presentation.magnitude * MAX_PUCK_OFFSET_PX).toFixed(1)}px`;
  const axisXPercent = `${((presentation.axisX + 1) * 50).toFixed(1)}%`;
  const axisYPercent = `${((presentation.axisY + 1) * 50).toFixed(1)}%`;
  const axisXText = formatAnalogPercent(presentation.axisX);
  const axisYText = formatAnalogPercent(presentation.axisY);

  if (bindings.display) {
    if (bindings.lastDisplayText !== presentation.displayText) {
      bindings.display.textContent = presentation.displayText;
      bindings.lastDisplayText = presentation.displayText;
    }
    if (bindings.lastActive !== presentation.isActive) {
      bindings.display.classList.toggle("active", presentation.isActive);
    }
  }

  if (bindings.circle) {
    bindings.circle.style.setProperty("--joystick-x", presentation.axisX.toFixed(3));
    bindings.circle.style.setProperty("--joystick-y", presentation.axisY.toFixed(3));
    bindings.circle.style.setProperty("--joystick-magnitude", presentation.magnitude.toFixed(3));
  }

  if (bindings.puck) {
    if (bindings.lastTransform !== transform) {
      bindings.puck.style.transform = transform;
      bindings.lastTransform = transform;
    }
    if (bindings.lastActive !== presentation.isActive) {
      bindings.puck.classList.toggle("is-active", presentation.isActive);
    }
  }

  if (bindings.vector) {
    bindings.vector.style.transform = vectorTransform;
    bindings.vector.style.width = vectorWidth;
    bindings.vector.classList.toggle("is-active", presentation.isActive);
  }

  if (bindings.axisFills.x) {
    bindings.axisFills.x.style.width = axisXPercent;
    bindings.axisFills.x.classList.toggle("is-active", presentation.isActive);
  }
  if (bindings.axisFills.y) {
    bindings.axisFills.y.style.width = axisYPercent;
    bindings.axisFills.y.classList.toggle("is-active", presentation.isActive);
  }
  if (bindings.axisValues.x) {
    bindings.axisValues.x.textContent = axisXText;
  }
  if (bindings.axisValues.y) {
    bindings.axisValues.y.textContent = axisYText;
  }

  for (const { direction } of DIRECTION_CONFIG) {
    if (bindings.lastDirections[direction] !== presentation.resolvedDirections[direction]) {
      bindings.directions[direction]?.classList.toggle("active", presentation.resolvedDirections[direction]);
      bindings.lastDirections[direction] = presentation.resolvedDirections[direction];
    }
  }

  if (root instanceof HTMLElement) {
    if (bindings.lastActive !== presentation.isActive) {
      root.classList.toggle("active", presentation.isActive);
    }
  }

  bindings.lastActive = presentation.isActive;
}

function flushKeyboardJoystickState(root: ParentNode, bindings: KeyboardJoystickBindings): void {
  bindings.frameId = null;

  if (!bindings.pendingState) {
    return;
  }

  renderKeyboardJoystickState(root, bindings, bindings.pendingState);
  bindings.pendingState = null;
}

export function applyKeyboardJoystickState(
  root: ParentNode,
  state: KeyboardJoystickState
): void {
  const bindings = getKeyboardJoystickBindings(root);
  bindings.pendingState = state;

  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    flushKeyboardJoystickState(root, bindings);
    return;
  }

  if (bindings.frameId !== null) {
    return;
  }

  bindings.frameId = window.requestAnimationFrame(() => {
    flushKeyboardJoystickState(root, bindings);
  });
}
