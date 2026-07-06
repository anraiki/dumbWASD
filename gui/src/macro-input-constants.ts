export interface SurfaceKey {
  label: string;
  code?: number;
  width?: "wide" | "xl" | "space";
}

export const INPUT_NAMES: Record<number, string> = {
  1: "ESC", 2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
  12: "-", 13: "=", 14: "BACKSPACE", 15: "TAB", 16: "Q", 17: "W", 18: "E", 19: "R", 20: "T",
  21: "Y", 22: "U", 23: "I", 24: "O", 25: "P", 26: "[", 27: "]", 28: "ENTER", 29: "CTRL",
  30: "A", 31: "S", 32: "D", 33: "F", 34: "G", 35: "H", 36: "J", 37: "K", 38: "L", 39: ";",
  40: "'", 41: "`", 42: "SHIFT", 43: "\\", 44: "Z", 45: "X", 46: "C", 47: "V", 48: "B",
  49: "N", 50: "M", 51: ",", 52: ".", 53: "/", 54: "SHIFT", 56: "ALT", 57: "SPACE",
  59: "F1", 60: "F2", 61: "F3", 62: "F4", 63: "F5", 64: "F6", 65: "F7", 66: "F8", 67: "F9",
  68: "F10", 87: "F11", 88: "F12", 96: "NUMPAD_ENTER", 97: "CTRL", 100: "ALT",
  103: "UP", 105: "LEFT", 106: "RIGHT", 108: "DOWN", 110: "INSERT", 111: "DELETE", 125: "WIN",
  272: "MOUSE_LEFT", 273: "MOUSE_RIGHT", 274: "MOUSE_MIDDLE", 275: "MOUSE_4", 276: "MOUSE_5",
};

export const KEYBOARD_ROWS: SurfaceKey[][] = [
  [
    { label: "Esc", code: 1 }, { label: "F1", code: 59 }, { label: "F2", code: 60 }, { label: "F3", code: 61 },
    { label: "F4", code: 62 }, { label: "F5", code: 63 }, { label: "F6", code: 64 }, { label: "F7", code: 65 },
    { label: "F8", code: 66 }, { label: "F9", code: 67 }, { label: "F10", code: 68 }, { label: "F11", code: 87 },
    { label: "F12", code: 88 },
  ],
  [
    { label: "`", code: 41 }, { label: "1", code: 2 }, { label: "2", code: 3 }, { label: "3", code: 4 },
    { label: "4", code: 5 }, { label: "5", code: 6 }, { label: "6", code: 7 }, { label: "7", code: 8 },
    { label: "8", code: 9 }, { label: "9", code: 10 }, { label: "0", code: 11 }, { label: "-", code: 12 },
    { label: "=", code: 13 }, { label: "Bksp", code: 14, width: "wide" },
  ],
  [
    { label: "Tab", code: 15, width: "wide" }, { label: "Q", code: 16 }, { label: "W", code: 17 }, { label: "E", code: 18 },
    { label: "R", code: 19 }, { label: "T", code: 20 }, { label: "Y", code: 21 }, { label: "U", code: 22 },
    { label: "I", code: 23 }, { label: "O", code: 24 }, { label: "P", code: 25 }, { label: "[", code: 26 },
    { label: "]", code: 27 }, { label: "\\", code: 43 },
  ],
  [
    { label: "Caps" }, { label: "A", code: 30 }, { label: "S", code: 31 }, { label: "D", code: 32 },
    { label: "F", code: 33 }, { label: "G", code: 34 }, { label: "H", code: 35 }, { label: "J", code: 36 },
    { label: "K", code: 37 }, { label: "L", code: 38 }, { label: ";", code: 39 }, { label: "'", code: 40 },
    { label: "Enter", code: 28, width: "wide" },
  ],
  [
    { label: "Shift", code: 42, width: "xl" }, { label: "Z", code: 44 }, { label: "X", code: 45 }, { label: "C", code: 46 },
    { label: "V", code: 47 }, { label: "B", code: 48 }, { label: "N", code: 49 }, { label: "M", code: 50 },
    { label: ",", code: 51 }, { label: ".", code: 52 }, { label: "/", code: 53 }, { label: "Shift", code: 54, width: "xl" },
  ],
  [
    { label: "Ctrl", code: 29, width: "wide" }, { label: "Win", code: 125, width: "wide" }, { label: "Alt", code: 56, width: "wide" },
    { label: "Space", code: 57, width: "space" },
    { label: "Alt", code: 100, width: "wide" }, { label: "Fn", width: "wide" }, { label: "Ctrl", code: 97, width: "wide" },
  ],
];

export const PAD_BUTTONS = [
  [{ label: "W", code: 17 }, { label: "A", code: 30 }, { label: "D", code: 32 }],
  [{ label: "S", code: 31 }, { label: "X", code: 45 }, { label: "E", code: 18 }],
  [{ label: "Q", code: 16 }, { label: "R", code: 19 }, { label: "F", code: 33 }],
];

export const MOUSE_BUTTONS = [
  { label: "LMB", code: 272 },
  { label: "RMB", code: 273 },
  { label: "MMB", code: 274 },
  { label: "M4", code: 275 },
  { label: "M5", code: 276 },
];

export function normalizeInput(code: number): string {
  return INPUT_NAMES[code] ?? `BUTTON_${code}`;
}
