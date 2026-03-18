export type MappingTargetType = "key" | "mouse_button";

export interface MappingTarget {
  type: MappingTargetType;
  code: number;
}

export interface MappingTargetOption extends MappingTarget {
  label: string;
  group: "Keyboard" | "Mouse";
}

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

  return getInputCodeLabel(target.code);
}

export function isSupportedMappingTarget(
  target: { type: string; code: number } | null | undefined,
): target is MappingTarget {
  if (!target) {
    return false;
  }

  return (target.type === "key" || target.type === "mouse_button")
    && Number.isFinite(target.code);
}
