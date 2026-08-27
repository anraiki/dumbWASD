export interface AnalogVectorKeys {
  left?: string;
  right?: string;
  up?: string;
  down?: string;
}

export type AnalogStick = "left" | "right";

export interface DeviceSvgConfig {
  markup: string;
  previewLabel: string;
  aliases: Map<string, Set<string>>;
  buttonCodes: Map<number, string>;
  buttonLabels: Map<number, string>;
  /// Directional highlight zones for the primary (left) analog stick.
  analogVectorKeys?: AnalogVectorKeys;
  /// Directional highlight zones for the right analog stick, when the device has one.
  rightAnalogVectorKeys?: AnalogVectorKeys;
}

export interface DeviceSvgHandle {
  setButtonState(code: number, pressed: boolean): void;
  setJoystickVector(x: number, y: number, stick?: AnalogStick): void;
  setSelected(code: number | null): void;
  clearAll(): void;
  destroy(): void;
}

function normalizeSvgToken(value?: string | null): string {
  return (value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function createDeviceSvgPreview(
  svg: SVGElement,
  config: DeviceSvgConfig,
  options: {
    onButtonClick?(button: { id: number; label: string }, element: SVGElement): void;
  } = {},
): DeviceSvgHandle {
  const reverseCodes = new Map<string, number>();
  for (const [code, key] of config.buttonCodes) {
    reverseCodes.set(key, code);
  }
  const targets = new Map<string, SVGElement[]>();
  for (const key of config.aliases.keys()) {
    targets.set(key, []);
  }
  let selectedCode: number | null = null;
  const activeAnalogKeys: Record<AnalogStick, Set<string>> = {
    left: new Set(),
    right: new Set(),
  };

  const elements = svg.querySelectorAll<SVGElement>("*");
  for (const element of elements) {
    const tokens = [
      element.getAttribute("id"),
      element.getAttribute("label"),
      element.getAttribute("inkscape:label"),
    ]
      .map((value) => normalizeSvgToken(value))
      .filter(Boolean);

    for (const [key, names] of config.aliases) {
      if (tokens.some((token) => names.has(token))) {
        element.classList.add("device-svg-hit-target");
        targets.get(key)!.push(element);
        const code = reverseCodes.get(key);
        const label = code ? config.buttonLabels.get(code) : null;

        if (code && label && options.onButtonClick) {
          element.classList.add("device-svg-bindable");
          element.setAttribute("role", "button");
          element.setAttribute("aria-label", `Configure ${label} (${code})`);

          element.addEventListener("click", () => {
            options.onButtonClick?.({ id: code, label }, element);
          });

          element.addEventListener("mousedown", (event) => {
            event.preventDefault();
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
    setJoystickVector(x: number, y: number, stick: AnalogStick = "left") {
      const vectorKeys = stick === "right" ? config.rightAnalogVectorKeys : config.analogVectorKeys;
      const nextAnalogKeys = new Set<string>();
      const threshold = 0.35;

      // A direction that owns a button code is highlighted by the
      // button-state events core synthesizes for it. Driving it from the raw
      // axis vector too would let the two sources clear each other's class.
      const addKey = (key?: string) => {
        if (key && !reverseCodes.has(key)) {
          nextAnalogKeys.add(key);
        }
      };

      if (vectorKeys) {
        if (x <= -threshold) {
          addKey(vectorKeys.left);
        }
        if (x >= threshold) {
          addKey(vectorKeys.right);
        }
        if (y <= -threshold) {
          addKey(vectorKeys.up);
        }
        if (y >= threshold) {
          addKey(vectorKeys.down);
        }
      }

      const previousKeys = activeAnalogKeys[stick];
      for (const key of previousKeys) {
        if (!nextAnalogKeys.has(key)) {
          setTargetActive(key, false);
        }
      }
      for (const key of nextAnalogKeys) {
        if (!previousKeys.has(key)) {
          setTargetActive(key, true);
        }
      }

      activeAnalogKeys[stick] = nextAnalogKeys;
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
      activeAnalogKeys.left.clear();
      activeAnalogKeys.right.clear();
    },
    destroy() {
      for (const elementsForKey of targets.values()) {
        for (const element of elementsForKey) {
          element.classList.remove(
            "active",
            "selected",
            "device-svg-hit-target",
            "device-svg-bindable",
          );
          element.removeAttribute("tabindex");
          element.removeAttribute("role");
          element.removeAttribute("aria-label");
        }
      }
    },
  };
}
