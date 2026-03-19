export type MappingTargetType = "key" | "mouse_button" | "shortcut";

export type MappingTarget =
  | {
      type: "key" | "mouse_button";
      code: number;
    }
  | {
      type: "shortcut";
      modifiers: number[];
      key: number;
    };

export type MappingTargetOption = Extract<MappingTarget, { type: "key" | "mouse_button" }> & {
  label: string;
  group: "Keyboard" | "Mouse";
};

const KEYBOARD_CODE_LABELS: Array<[number, string]> = [
  [1, "Esc"],
  [2, "1"],
  [3, "2"],
  [4, "3"],
  [5, "4"],
  [6, "5"],
  [7, "6"],
  [8, "7"],
  [9, "8"],
  [10, "9"],
  [11, "0"],
  [12, "-"],
  [13, "="],
  [14, "Backspace"],
  [15, "Tab"],
  [16, "Q"],
  [17, "W"],
  [18, "E"],
  [19, "R"],
  [20, "T"],
  [21, "Y"],
  [22, "U"],
  [23, "I"],
  [24, "O"],
  [25, "P"],
  [26, "["],
  [27, "]"],
  [28, "Enter"],
  [29, "Left Ctrl"],
  [30, "A"],
  [31, "S"],
  [32, "D"],
  [33, "F"],
  [34, "G"],
  [35, "H"],
  [36, "J"],
  [37, "K"],
  [38, "L"],
  [39, ";"],
  [40, "'"],
  [41, "`"],
  [42, "Left Shift"],
  [43, "\\"],
  [44, "Z"],
  [45, "X"],
  [46, "C"],
  [47, "V"],
  [48, "B"],
  [49, "N"],
  [50, "M"],
  [51, ","],
  [52, "."],
  [53, "/"],
  [54, "Right Shift"],
  [56, "Left Alt"],
  [57, "Space"],
  [58, "Caps Lock"],
  [59, "F1"],
  [60, "F2"],
  [61, "F3"],
  [62, "F4"],
  [63, "F5"],
  [64, "F6"],
  [65, "F7"],
  [66, "F8"],
  [67, "F9"],
  [68, "F10"],
  [69, "Num Lock"],
  [87, "F11"],
  [88, "F12"],
  [96, "Numpad Enter"],
  [97, "Right Ctrl"],
  [100, "Right Alt"],
  [103, "Up"],
  [105, "Left"],
  [106, "Right"],
  [108, "Down"],
  [110, "Insert"],
  [111, "Delete"],
  [113, "Mute"],
  [114, "Volume Down"],
  [115, "Volume Up"],
  [125, "Left Meta"],
  [126, "Right Meta"],
];

const MOUSE_CODE_LABELS: Array<[number, string]> = [
  [272, "Mouse Left"],
  [273, "Mouse Right"],
  [274, "Mouse Middle"],
  [275, "Mouse 4"],
  [276, "Mouse 5"],
];

const INPUT_CODE_LABELS = new Map<number, string>([
  ...KEYBOARD_CODE_LABELS,
  ...MOUSE_CODE_LABELS,
]);

export const MAPPING_TARGET_OPTIONS: MappingTargetOption[] = [
  ...KEYBOARD_CODE_LABELS.map(([code, label]) => ({
    type: "key" as const,
    code,
    label,
    group: "Keyboard" as const,
  })),
  ...MOUSE_CODE_LABELS.map(([code, label]) => ({
    type: "mouse_button" as const,
    code,
    label,
    group: "Mouse" as const,
  })),
];

export function getInputCodeLabel(code: number): string {
  return INPUT_CODE_LABELS.get(code) || `Code ${code}`;
}

export function getMappingTargetLabel(target: MappingTarget | null | undefined): string {
  if (!target) {
    return "Unassigned";
  }

  if (target.type === "shortcut") {
    const parts = normalizeShortcutModifiers(target.modifiers).map((code) => getInputCodeLabel(code));
    parts.push(getInputCodeLabel(target.key));
    return parts.join(" + ");
  }

  return getInputCodeLabel(target.code);
}

export function isSupportedMappingTarget(
  target:
    | { type: string; code?: number; modifiers?: number[]; key?: number }
    | null
    | undefined,
): target is MappingTarget {
  if (!target) {
    return false;
  }

  if ((target.type === "key" || target.type === "mouse_button") && Number.isFinite(target.code)) {
    return true;
  }

  if (target.type !== "shortcut" || !Array.isArray(target.modifiers) || !Number.isFinite(target.key)) {
    return false;
  }

  return target.modifiers.every((code) => Number.isFinite(code));
}

const KEYBOARD_EVENT_CODE_TO_INPUT_CODE = new Map<string, number>([
  ["Escape", 1],
  ["Digit1", 2],
  ["Digit2", 3],
  ["Digit3", 4],
  ["Digit4", 5],
  ["Digit5", 6],
  ["Digit6", 7],
  ["Digit7", 8],
  ["Digit8", 9],
  ["Digit9", 10],
  ["Digit0", 11],
  ["Minus", 12],
  ["Equal", 13],
  ["Backspace", 14],
  ["Tab", 15],
  ["KeyQ", 16],
  ["KeyW", 17],
  ["KeyE", 18],
  ["KeyR", 19],
  ["KeyT", 20],
  ["KeyY", 21],
  ["KeyU", 22],
  ["KeyI", 23],
  ["KeyO", 24],
  ["KeyP", 25],
  ["BracketLeft", 26],
  ["BracketRight", 27],
  ["Enter", 28],
  ["ControlLeft", 29],
  ["KeyA", 30],
  ["KeyS", 31],
  ["KeyD", 32],
  ["KeyF", 33],
  ["KeyG", 34],
  ["KeyH", 35],
  ["KeyJ", 36],
  ["KeyK", 37],
  ["KeyL", 38],
  ["Semicolon", 39],
  ["Quote", 40],
  ["Backquote", 41],
  ["ShiftLeft", 42],
  ["Backslash", 43],
  ["KeyZ", 44],
  ["KeyX", 45],
  ["KeyC", 46],
  ["KeyV", 47],
  ["KeyB", 48],
  ["KeyN", 49],
  ["KeyM", 50],
  ["Comma", 51],
  ["Period", 52],
  ["Slash", 53],
  ["ShiftRight", 54],
  ["AltLeft", 56],
  ["Space", 57],
  ["CapsLock", 58],
  ["F1", 59],
  ["F2", 60],
  ["F3", 61],
  ["F4", 62],
  ["F5", 63],
  ["F6", 64],
  ["F7", 65],
  ["F8", 66],
  ["F9", 67],
  ["F10", 68],
  ["NumLock", 69],
  ["F11", 87],
  ["F12", 88],
  ["NumpadEnter", 96],
  ["ControlRight", 97],
  ["AltRight", 100],
  ["ArrowUp", 103],
  ["ArrowLeft", 105],
  ["ArrowRight", 106],
  ["ArrowDown", 108],
  ["Insert", 110],
  ["Delete", 111],
  ["AudioVolumeMute", 113],
  ["AudioVolumeDown", 114],
  ["AudioVolumeUp", 115],
  ["MetaLeft", 125],
  ["MetaRight", 126],
]);

const POINTER_BUTTON_TO_INPUT_CODE = new Map<number, number>([
  [0, 272],
  [2, 273],
  [1, 274],
  [3, 275],
  [4, 276],
]);

const MODIFIER_CODES = new Set([29, 42, 54, 56, 97, 100, 125, 126]);
const SHORTCUT_MODIFIER_ORDER = [29, 97, 42, 54, 56, 100, 125, 126];

export function getInputCodeFromKeyboardEvent(event: KeyboardEvent): number | null {
  return KEYBOARD_EVENT_CODE_TO_INPUT_CODE.get(event.code) ?? null;
}

export function getMappingTargetFromPointerButton(button: number): MappingTarget | null {
  const code = POINTER_BUTTON_TO_INPUT_CODE.get(button);
  return typeof code === "number" ? { type: "mouse_button", code } : null;
}

export function isModifierInputCode(code: number): boolean {
  return MODIFIER_CODES.has(code);
}

export function normalizeShortcutModifiers(modifiers: number[]): number[] {
  const seen = new Set<number>();

  return SHORTCUT_MODIFIER_ORDER.filter((code) => {
    if (!modifiers.includes(code) || seen.has(code)) {
      return false;
    }

    seen.add(code);
    return true;
  });
}
