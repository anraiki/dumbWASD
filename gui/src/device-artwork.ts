import logitechG502XSvgMarkup from "./assets/logitech-g502-x.svg?raw";
import xboxSvgMarkup from "./assets/xbox.svg?raw";

function sanitizeInlineSvgMarkup(markup: string): string {
  return markup
  .replace(/<\?xml[\s\S]*?\?>\s*/i, "")
  .replace(/<!--[\s\S]*?-->\s*/g, "")
  .trim();
}

const INLINE_LOGITECH_G502_X_SVG = sanitizeInlineSvgMarkup(logitechG502XSvgMarkup);
const INLINE_XBOX_SVG = sanitizeInlineSvgMarkup(xboxSvgMarkup);

export interface DeviceArtworkConfig {
  markup: string;
  previewLabel: string;
  aliases: Map<string, Set<string>>;
  buttonCodes: Map<number, string>;
  buttonLabels: Map<number, string>;
  analogVectorKeys?: {
    left?: string;
    right?: string;
    up?: string;
    down?: string;
  };
}

const G502_ARTWORK_BUTTON_CODES = new Map<number, "LMB" | "RMB">([
  [272, "LMB"],
  [273, "RMB"],
]);
const G502_ARTWORK_BUTTON_LABELS = new Map<number, string>([
  [272, "Mouse Left"],
  [273, "Mouse Right"],
]);

const G502_ARTWORK_ALIASES = new Map<string, Set<string>>([
  ["LMB", new Set(["LMB", "BUTTON_LMB", "LEFT", "BUTTON_LEFT", "MOUSE_LEFT"])],
  ["RMB", new Set(["RMB", "BUTTON_RMB", "RIGHT", "BUTTON_RIGHT", "MOUSE_RIGHT"])],
]);

const XBOX_ARTWORK_BUTTON_CODES = new Map<number, string>([
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
]);

const XBOX_ARTWORK_BUTTON_LABELS = new Map<number, string>([
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
]);

const XBOX_ARTWORK_ALIASES = new Map<string, Set<string>>([
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

export const G502_ARTWORK_CONFIG: DeviceArtworkConfig = {
  markup: INLINE_LOGITECH_G502_X_SVG,
  previewLabel: "Logitech G502 X preview",
  aliases: G502_ARTWORK_ALIASES,
  buttonCodes: G502_ARTWORK_BUTTON_CODES,
  buttonLabels: G502_ARTWORK_BUTTON_LABELS,
};

export const XBOX_ARTWORK_CONFIG: DeviceArtworkConfig = {
  markup: INLINE_XBOX_SVG,
  previewLabel: "Xbox controller preview",
  aliases: XBOX_ARTWORK_ALIASES,
  buttonCodes: XBOX_ARTWORK_BUTTON_CODES,
  buttonLabels: XBOX_ARTWORK_BUTTON_LABELS,
  analogVectorKeys: {
    left: "LSTICK_LEFT",
    right: "LSTICK_RIGHT",
    up: "LSTICK_UP",
    down: "LSTICK_DOWN",
  },
};

export interface DeviceArtworkPreviewHandle {
  setButtonState(code: number, pressed: boolean): void;
  setJoystickVector(x: number, y: number): void;
  setSelected(code: number | null): void;
  clearAll(): void;
  destroy(): void;
}

function normalizeArtworkToken(value?: string | null): string {
  return (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createDeviceArtworkPreview(
  svg: SVGElement,
  config: DeviceArtworkConfig,
  options: {
    onButtonClick?(button: { id: number; label: string }, element: SVGElement): void;
  } = {},
): DeviceArtworkPreviewHandle {
  const reverseCodes = new Map<string, number>();
  for (const [code, key] of config.buttonCodes) {
    reverseCodes.set(key, code);
  }
  const targets = new Map<string, SVGElement[]>();
  for (const key of config.aliases.keys()) {
    targets.set(key, []);
  }
  let selectedCode: number | null = null;
  let activeAnalogKeys = new Set<string>();

  const elements = svg.querySelectorAll<SVGElement>("*");
  for (const element of elements) {
    const tokens = [
      element.getAttribute("id"),
      element.getAttribute("label"),
      element.getAttribute("inkscape:label"),
    ]
      .map((value) => normalizeArtworkToken(value))
      .filter(Boolean);

    for (const [key, names] of config.aliases) {
      if (tokens.some((token) => names.has(token))) {
        element.classList.add("device-artwork-hit-target");
        targets.get(key)!.push(element);
        const code = reverseCodes.get(key);
        const label = code ? config.buttonLabels.get(code) : null;

        if (code && label && options.onButtonClick) {
          element.classList.add("device-artwork-bindable");
          element.setAttribute("tabindex", "0");
          element.setAttribute("role", "button");
          element.setAttribute("aria-label", `Configure ${label} (${code})`);

          element.addEventListener("click", () => {
            options.onButtonClick?.({ id: code, label }, element);
          });

          element.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });

          element.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            event.preventDefault();
            options.onButtonClick?.({ id: code, label }, element);
          });
        }
      }
    }
  }

  function setTargetActive(key: string, active: boolean) {
    for (const element of targets.get(key) || []) {
      element.classList.toggle("active", active);
    }
  }

  return {
    setButtonState(code: number, pressed: boolean) {
      const key = config.buttonCodes.get(code);
      if (!key) {
        return;
      }

      setTargetActive(key, pressed);
    },
    setJoystickVector(x: number, y: number) {
      const nextAnalogKeys = new Set<string>();
      const threshold = 0.35;

      if (config.analogVectorKeys) {
        if (x <= -threshold && config.analogVectorKeys.left) {
          nextAnalogKeys.add(config.analogVectorKeys.left);
        }
        if (x >= threshold && config.analogVectorKeys.right) {
          nextAnalogKeys.add(config.analogVectorKeys.right);
        }
        if (y <= -threshold && config.analogVectorKeys.up) {
          nextAnalogKeys.add(config.analogVectorKeys.up);
        }
        if (y >= threshold && config.analogVectorKeys.down) {
          nextAnalogKeys.add(config.analogVectorKeys.down);
        }
      }

      for (const key of activeAnalogKeys) {
        if (!nextAnalogKeys.has(key)) {
          setTargetActive(key, false);
        }
      }
      for (const key of nextAnalogKeys) {
        if (!activeAnalogKeys.has(key)) {
          setTargetActive(key, true);
        }
      }

      activeAnalogKeys = nextAnalogKeys;
    },
    setSelected(code: number | null) {
      if (selectedCode !== null) {
        const selectedKey = config.buttonCodes.get(selectedCode);
        for (const element of (selectedKey && targets.get(selectedKey)) || []) {
          element.classList.remove("selected");
        }
      }

      selectedCode = code;
      if (selectedCode === null) {
        return;
      }

      const selectedKey = config.buttonCodes.get(selectedCode);
      for (const element of (selectedKey && targets.get(selectedKey)) || []) {
        element.classList.add("selected");
      }
    },
    clearAll() {
      for (const elementsForKey of targets.values()) {
        for (const element of elementsForKey) {
          element.classList.remove("active");
        }
      }
      activeAnalogKeys.clear();
    },
    destroy() {
      for (const elementsForKey of targets.values()) {
        for (const element of elementsForKey) {
          element.classList.remove(
            "active",
            "selected",
            "device-artwork-hit-target",
            "device-artwork-bindable",
          );
          element.removeAttribute("tabindex");
          element.removeAttribute("role");
          element.removeAttribute("aria-label");
        }
      }
    },
  };
}
