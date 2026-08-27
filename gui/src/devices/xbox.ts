import xboxSvgMarkup from "@devices/xbox/layout.svg?raw";
import { STICK_CODES, STICK_LABELS } from "../stick-codes";
import type { DeviceSvgConfig } from "./layout";

function sanitizeInlineSvgMarkup(markup: string): string {
  return markup
  .replace(/<\?xml[\s\S]*?\?>\s*/i, "")
  .replace(/<!--[\s\S]*?-->\s*/g, "")
  .trim();
}

const INLINE_SVG = sanitizeInlineSvgMarkup(xboxSvgMarkup);

const BUTTON_CODES = new Map<number, string>([
  [304, "A"],
  [305, "B"],
  [307, "Y"],
  [308, "X"],
  [310, "LB"],
  [311, "RB"],
  [312, "LT"],
  [313, "RT"],
  [314, "VIEW"],
  [315, "MENU"],
  [316, "GUIDE"],
  [317, "LSTICK_PRESS"],
  [318, "RSTICK_PRESS"],
  [544, "DPAD_UP"],
  [545, "DPAD_DOWN"],
  [546, "DPAD_LEFT"],
  [547, "DPAD_RIGHT"],
  // Synthetic codes — core converts stick motion into presses on these.
  [STICK_CODES.LSTICK_UP, "LSTICK_UP"],
  [STICK_CODES.LSTICK_DOWN, "LSTICK_DOWN"],
  [STICK_CODES.LSTICK_LEFT, "LSTICK_LEFT"],
  [STICK_CODES.LSTICK_RIGHT, "LSTICK_RIGHT"],
  [STICK_CODES.RSTICK_UP, "RSTICK_UP"],
  [STICK_CODES.RSTICK_DOWN, "RSTICK_DOWN"],
  [STICK_CODES.RSTICK_LEFT, "RSTICK_LEFT"],
  [STICK_CODES.RSTICK_RIGHT, "RSTICK_RIGHT"],
]);

const BUTTON_LABELS = new Map<number, string>([
  [304, "A"],
  [305, "B"],
  [307, "Y"],
  [308, "X"],
  [310, "Left Bumper"],
  [311, "Right Bumper"],
  [312, "Left Trigger"],
  [313, "Right Trigger"],
  [314, "View"],
  [315, "Menu"],
  [316, "Guide"],
  [317, "Left Stick Press"],
  [318, "Right Stick Press"],
  [544, "D-pad Up"],
  [545, "D-pad Down"],
  [546, "D-pad Left"],
  [547, "D-pad Right"],
  [STICK_CODES.LSTICK_UP, STICK_LABELS.LSTICK_UP],
  [STICK_CODES.LSTICK_DOWN, STICK_LABELS.LSTICK_DOWN],
  [STICK_CODES.LSTICK_LEFT, STICK_LABELS.LSTICK_LEFT],
  [STICK_CODES.LSTICK_RIGHT, STICK_LABELS.LSTICK_RIGHT],
  [STICK_CODES.RSTICK_UP, STICK_LABELS.RSTICK_UP],
  [STICK_CODES.RSTICK_DOWN, STICK_LABELS.RSTICK_DOWN],
  [STICK_CODES.RSTICK_LEFT, STICK_LABELS.RSTICK_LEFT],
  [STICK_CODES.RSTICK_RIGHT, STICK_LABELS.RSTICK_RIGHT],
]);

const ALIASES = new Map<string, Set<string>>([
  ["A", new Set(["A", "BUTTON_A"])],
  ["B", new Set(["B", "BUTTON_B"])],
  ["X", new Set(["X", "BUTTON_X"])],
  ["Y", new Set(["Y", "BUTTON_Y"])],
  ["LB", new Set(["LB", "BUTTON_LB"])],
  ["RB", new Set(["RB", "BUTTON_RB"])],
  ["LT", new Set(["LT", "BUTTON_LT"])],
  ["RT", new Set(["RT", "BUTTON_RT"])],
  ["VIEW", new Set(["VIEW", "BUTTON_VIEW", "BUTTON_SELECT"])],
  ["MENU", new Set(["MENU", "BUTTON_MENU", "BUTTON_START"])],
  ["GUIDE", new Set(["GUIDE", "BUTTON_GUIDE", "BUTTON_HOME", "HOME"])],
  ["LSTICK_PRESS", new Set(["BUTTON_LSTICK_PRESS", "BUTTON_LSTICK_CENTER"])],
  ["RSTICK_PRESS", new Set(["BUTTON_RSTICK_PRESS", "BUTTON_RSTICK_CENTER"])],
  ["DPAD_UP", new Set(["BUTTON_DPAD_UP", "BUTTON_DPAD_TOP"])],
  ["DPAD_DOWN", new Set(["BUTTON_DPAD_DOWN"])],
  ["DPAD_LEFT", new Set(["BUTTON_DPAD_LEFT"])],
  ["DPAD_RIGHT", new Set(["BUTTON_DPAD_RIGHT"])],
  ["LSTICK_UP", new Set(["BUTTON_LSTICK_UP"])],
  ["LSTICK_DOWN", new Set(["BUTTON_LSTICK_DOWN"])],
  ["LSTICK_LEFT", new Set(["BUTTON_LSTICK_LEFT"])],
  ["LSTICK_RIGHT", new Set(["BUTTON_LSTICK_RIGHT"])],
  ["RSTICK_UP", new Set(["BUTTON_RSTICK_UP"])],
  ["RSTICK_DOWN", new Set(["BUTTON_RSTICK_DOWN"])],
  ["RSTICK_LEFT", new Set(["BUTTON_RSTICK_LEFT"])],
  ["RSTICK_RIGHT", new Set(["BUTTON_RSTICK_RIGHT"])],
]);

export const XBOX_SVG_CONFIG: DeviceSvgConfig = {
  markup: INLINE_SVG,
  previewLabel: "Xbox controller preview",
  aliases: ALIASES,
  buttonCodes: BUTTON_CODES,
  buttonLabels: BUTTON_LABELS,
  analogVectorKeys: {
    left: "LSTICK_LEFT",
    right: "LSTICK_RIGHT",
    up: "LSTICK_UP",
    down: "LSTICK_DOWN",
  },
  rightAnalogVectorKeys: {
    left: "RSTICK_LEFT",
    right: "RSTICK_RIGHT",
    up: "RSTICK_UP",
    down: "RSTICK_DOWN",
  },
};
