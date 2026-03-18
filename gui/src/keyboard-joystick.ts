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
  offsetX: number;
  offsetY: number;
}

interface KeyboardJoystickBindings {
  display: HTMLElement | null;
  puck: HTMLElement | null;
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
const IDLE_DISPLAY_TEXT = "Keyboard Joystick";
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

  return {
    resolvedDirections,
    displayText: activeLabels.length > 0 ? activeLabels.join(" + ") : IDLE_DISPLAY_TEXT,
    isActive: hasAnalog ? magnitude >= ANALOG_ACTIVE_EPSILON : activeLabels.length > 0,
    offsetX,
    offsetY,
  };
}

export function buildKeyboardJoystickMarkup(label: string): string {
  return `
    <div class="joystick-display" data-joystick-display>${IDLE_DISPLAY_TEXT}</div>
    <div class="joystick-circle">
      <div class="joystick-puck" data-joystick-puck></div>
      <span class="joystick-dir joystick-w" data-joystick-dir="up">W</span>
      <span class="joystick-dir joystick-a" data-joystick-dir="left">A</span>
      <span class="joystick-dir joystick-s" data-joystick-dir="down">S</span>
      <span class="joystick-dir joystick-d" data-joystick-dir="right">D</span>
    </div>
    <div class="joystick-label-bottom">${label}</div>
  `;
}

function getKeyboardJoystickBindings(root: ParentNode): KeyboardJoystickBindings {
  let bindings = JOYSTICK_BINDINGS.get(root);
  if (bindings) {
    return bindings;
  }

  bindings = {
    display: root.querySelector<HTMLElement>("[data-joystick-display]"),
    puck: root.querySelector<HTMLElement>("[data-joystick-puck]"),
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

  if (bindings.display) {
    if (bindings.lastDisplayText !== presentation.displayText) {
      bindings.display.textContent = presentation.displayText;
      bindings.lastDisplayText = presentation.displayText;
    }
    if (bindings.lastActive !== presentation.isActive) {
      bindings.display.classList.toggle("active", presentation.isActive);
    }
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
