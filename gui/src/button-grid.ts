import {
  applyKeyboardJoystickState,
  buildKeyboardJoystickMarkup,
  createKeyboardJoystickState,
  resetKeyboardJoystickState,
  setKeyboardJoystickAnalog,
  setKeyboardJoystickDirection,
} from "./keyboard-joystick";

interface DeviceLayout {
  device: {
    name: string;
    rows?: number;
    cols?: number;
    layout_type?: string;
  };
  buttons: Array<{
    id: number;
    label: string;
    row?: number;
    col?: number;
    x?: number;
    y?: number;
    is_joystick?: boolean;
    colspan?: number;
    rowspan?: number;
  }>;
}

export interface ButtonGrid {
  setButtonState(
    code: number,
    pressed: boolean,
    options?: {
      suppressPhysical?: boolean;
    }
  ): void;
  clearAll(): void;
  setJoystickVector(x: number, y: number): void;
  /** Returns true if the code matched a known button in the layout. */
  hasButton(code: number): boolean;
  destroy(): void;
}

function getButtonSize(btn: DeviceLayout["buttons"][number]) {
  const width = 70 * (btn.colspan || 1);
  const height = 90 * (btn.rowspan || 1);
  return { width, height };
}

export function createButtonGrid(
  container: HTMLElement,
  layout: DeviceLayout
): ButtonGrid {
  container.innerHTML = "";

  console.log("Creating button grid with layout:", layout.device.name, "Buttons:", layout.buttons.length);

  const buttonElements = new Map<number, HTMLElement>();
  const joystickElements: HTMLElement[] = [];
  const joystickState = createKeyboardJoystickState();
  const isCustomLayout = layout.device.layout_type === "custom";
  let resizeObserver: ResizeObserver | null = null;

  if (isCustomLayout) {
    // Custom absolute positioning layout
    console.log("Using custom layout, creating", layout.buttons.length, "buttons");

    // Calculate bounding box of all buttons to find the optimal container size
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const btn of layout.buttons) {
      const x = btn.x ?? 0;
      const y = btn.y ?? 0;
      const { width, height } = getButtonSize(btn);

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    }

    // Add padding around the buttons
    const padding = 20;
    const containerWidth = maxX - minX + padding * 2;
    const containerHeight = maxY - minY + padding * 2;

    console.log("Custom layout bounding box:", { minX, minY, maxX, maxY });
    console.log("Container size:", { width: containerWidth, height: containerHeight });

    const viewport = document.createElement("div");
    viewport.className = "button-grid-custom-viewport";

    const grid = document.createElement("div");
    grid.className = "button-grid-custom";
    grid.style.position = "relative";
    grid.style.width = `${containerWidth}px`;
    grid.style.height = `${containerHeight}px`;
    grid.style.transformOrigin = "top left";

    for (const btn of layout.buttons) {
      const el = document.createElement("div");
      el.className = btn.is_joystick ? "button joystick" : "button";
      el.dataset.code = String(btn.id);
      el.style.position = "absolute";
      const { width, height } = getButtonSize(btn);
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      // Offset positions by minX/minY and add padding to normalize to container coordinates
      el.style.left = `${(btn.x ?? 0) - minX + padding}px`;
      el.style.top = `${(btn.y ?? 0) - minY + padding}px`;

      if (btn.is_joystick) {
        el.innerHTML = buildKeyboardJoystickMarkup(btn.label);
        joystickElements.push(el);
        applyKeyboardJoystickState(el, joystickState);
      } else {
        el.innerHTML = `
          <div class="button-label">${btn.label}</div>
          <div class="button-id">#${btn.id}</div>
        `;
      }

      buttonElements.set(btn.id, el);
      grid.appendChild(el);
    }

    viewport.appendChild(grid);
    container.appendChild(viewport);

    const updateScale = () => {
      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;

      if (!availableWidth || !availableHeight) {
        return;
      }

      const scale = Math.min(
        1,
        availableWidth / containerWidth,
        availableHeight / containerHeight,
      );

      viewport.style.width = `${Math.floor(containerWidth * scale)}px`;
      viewport.style.height = `${Math.floor(containerHeight * scale)}px`;
      grid.style.transform = `scale(${scale})`;
    };

    resizeObserver = new ResizeObserver(() => {
      updateScale();
    });
    resizeObserver.observe(container);
    requestAnimationFrame(updateScale);
  } else {
    // Legacy grid-based layout
    // Use the device-specified rows/cols if available, otherwise calculate from button positions
    const useRows = layout.device.rows || 0;
    const useCols = layout.device.cols || 0;

    let minRow = Infinity, maxRow = -Infinity;
    let minCol = Infinity, maxCol = -Infinity;

    for (const btn of layout.buttons) {
      minRow = Math.min(minRow, btn.row!);
      maxRow = Math.max(maxRow, btn.row!);
      minCol = Math.min(minCol, btn.col!);
      maxCol = Math.max(maxCol, btn.col!);
    }

    const actualRows = useRows || (maxRow - minRow + 1);
    const actualCols = useCols || (maxCol - minCol + 1);

    const grid = document.createElement("div");
    grid.className = "button-grid";
    grid.style.gridTemplateRows = `repeat(${actualRows}, 1fr)`;
    grid.style.gridTemplateColumns = `repeat(${actualCols}, 1fr)`;

    for (const btn of layout.buttons) {
      const el = document.createElement("div");
      el.className = btn.is_joystick ? "button joystick" : "button";
      el.dataset.code = String(btn.id);

      const rowStart = btn.row! - minRow + 1;
      const colStart = btn.col! - minCol + 1;
      const rowSpan = btn.rowspan || 1;
      const colSpan = btn.colspan || 1;

      el.style.gridRow = `${rowStart} / span ${rowSpan}`;
      el.style.gridColumn = `${colStart} / span ${colSpan}`;

      if (btn.is_joystick) {
        el.innerHTML = buildKeyboardJoystickMarkup(btn.label);
        joystickElements.push(el);
        applyKeyboardJoystickState(el, joystickState);
      } else {
        el.innerHTML = `
          <div class="button-label">${btn.label}</div>
          <div class="button-id">#${btn.id}</div>
        `;
      }

      buttonElements.set(btn.id, el);
      grid.appendChild(el);
    }

    container.appendChild(grid);
  }

  return {
    setButtonState(code: number, pressed: boolean, options?: { suppressPhysical?: boolean }) {
      const el = buttonElements.get(code);
      if (el && !options?.suppressPhysical) {
        el.classList.toggle("active", pressed);
      } else if (el && options?.suppressPhysical) {
        el.classList.remove("active");
      }

      if (setKeyboardJoystickDirection(joystickState, code, pressed)) {
        for (const joystickEl of joystickElements) {
          applyKeyboardJoystickState(joystickEl, joystickState);
        }
      }
    },
    clearAll() {
      for (const el of buttonElements.values()) {
        el.classList.remove("active");
      }
      resetKeyboardJoystickState(joystickState);
      for (const joystickEl of joystickElements) {
        applyKeyboardJoystickState(joystickEl, joystickState);
      }
    },
    setJoystickVector(x: number, y: number) {
      setKeyboardJoystickAnalog(joystickState, x, y);
      for (const joystickEl of joystickElements) {
        applyKeyboardJoystickState(joystickEl, joystickState);
      }
    },
    hasButton(code: number) {
      return buttonElements.has(code);
    },
    destroy() {
      resizeObserver?.disconnect();
    },
  };
}
