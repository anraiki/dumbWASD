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
