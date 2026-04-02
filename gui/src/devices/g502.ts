import logitechG502XSvgMarkup from "../assets/logitech-g502-x.svg?raw";
import type { DeviceArtworkConfig } from "./artwork";

export const VENDOR_ID = 0x046D; // Logitech
export const MODEL_SUBSTRING = "g502 x";

function sanitizeInlineSvgMarkup(markup: string): string {
  return markup
  .replace(/<\?xml[\s\S]*?\?>\s*/i, "")
  .replace(/<!--[\s\S]*?-->\s*/g, "")
  .trim();
}

const INLINE_SVG = sanitizeInlineSvgMarkup(logitechG502XSvgMarkup);

const BUTTON_CODES = new Map<number, "LMB" | "RMB">([
  [272, "LMB"],
  [273, "RMB"],
]);

const BUTTON_LABELS = new Map<number, string>([
  [272, "Mouse Left"],
  [273, "Mouse Right"],
]);

const ALIASES = new Map<string, Set<string>>([
  ["LMB", new Set(["LMB", "BUTTON_LMB", "LEFT", "BUTTON_LEFT", "MOUSE_LEFT"])],
  ["RMB", new Set(["RMB", "BUTTON_RMB", "RIGHT", "BUTTON_RIGHT", "MOUSE_RIGHT"])],
]);

export const G502_ARTWORK_CONFIG: DeviceArtworkConfig = {
  markup: INLINE_SVG,
  previewLabel: "Logitech G502 X preview",
  aliases: ALIASES,
  buttonCodes: BUTTON_CODES,
  buttonLabels: BUTTON_LABELS,
};
