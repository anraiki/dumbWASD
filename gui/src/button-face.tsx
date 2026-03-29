import { KEYBOARD_JOYSTICK_IDLE_DISPLAY_TEXT } from "./keyboard-joystick";

export interface ButtonFaceData {
  id: number;
  label: string;
  is_joystick?: boolean;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tagName: K,
  options: {
    className?: string;
    textContent?: string;
  } = {},
) {
  const element = documentRef.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.textContent !== undefined) {
    element.textContent = options.textContent;
  }

  return element;
}

function buildKeyboardJoystickFace(documentRef: Document, label: string): HTMLElement[] {
  const display = createElement(documentRef, "div", {
    className: "joystick-display",
    textContent: KEYBOARD_JOYSTICK_IDLE_DISPLAY_TEXT,
  });
  display.dataset.joystickDisplay = "";

  const circle = createElement(documentRef, "div", {
    className: "joystick-circle",
  });
  circle.dataset.joystickCircle = "";

  const crosshairVertical = createElement(documentRef, "span", {
    className: "joystick-crosshair joystick-crosshair-vertical",
  });
  const crosshairHorizontal = createElement(documentRef, "span", {
    className: "joystick-crosshair joystick-crosshair-horizontal",
  });
  const deadzone = createElement(documentRef, "span", {
    className: "joystick-deadzone",
  });
  const vector = createElement(documentRef, "span", {
    className: "joystick-vector",
  });
  vector.dataset.joystickVector = "";
  circle.append(crosshairVertical, crosshairHorizontal, deadzone, vector);

  const puck = createElement(documentRef, "div", {
    className: "joystick-puck",
  });
  puck.dataset.joystickPuck = "";
  circle.appendChild(puck);

  const directions: Array<{ className: string; direction: string; label: string }> = [
    { className: "joystick-dir joystick-w", direction: "up", label: "Y-" },
    { className: "joystick-dir joystick-a", direction: "left", label: "X-" },
    { className: "joystick-dir joystick-s", direction: "down", label: "Y+" },
    { className: "joystick-dir joystick-d", direction: "right", label: "X+" },
  ];

  for (const direction of directions) {
    const el = createElement(documentRef, "span", {
      className: direction.className,
      textContent: direction.label,
    });
    el.dataset.joystickDir = direction.direction;
    circle.appendChild(el);
  }

  const bottomLabel = createElement(documentRef, "div", {
    className: "joystick-label-bottom",
    textContent: label,
  });

  const axisReadout = createElement(documentRef, "div", {
    className: "joystick-axis-readout",
  });

  for (const axis of ["x", "y"] as const) {
    const row = createElement(documentRef, "div", {
      className: "joystick-axis-row",
    });
    const axisLabel = createElement(documentRef, "span", {
      className: "joystick-axis-label",
      textContent: axis.toUpperCase(),
    });
    const axisTrack = createElement(documentRef, "span", {
      className: "joystick-axis-track",
    });
    const axisFill = createElement(documentRef, "span", {
      className: "joystick-axis-fill",
    });
    axisFill.dataset.joystickAxisFill = axis;
    axisTrack.appendChild(axisFill);

    const axisValue = createElement(documentRef, "span", {
      className: "joystick-axis-value",
      textContent: "+0%",
    });
    axisValue.dataset.joystickAxisValue = axis;

    row.append(axisLabel, axisTrack, axisValue);
    axisReadout.appendChild(row);
  }

  return [display, circle, axisReadout, bottomLabel];
}

export function mountButtonFace(root: HTMLElement, data: ButtonFaceData): void {
  const documentRef = root.ownerDocument;
  const elements = data.is_joystick
    ? buildKeyboardJoystickFace(documentRef, data.label)
    : [
        createElement(documentRef, "div", {
          className: "button-label",
          textContent: data.label,
        }),
      ];

  elements.push(
    createElement(documentRef, "div", {
      className: "button-id",
      textContent: `#${data.id}`,
    }),
  );

  root.replaceChildren(...elements);
}
