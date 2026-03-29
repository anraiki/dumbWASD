import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createDeviceSelector } from "./device-selector";
import { createButtonGrid, type ButtonGrid } from "./button-grid";
import { createLayoutEditor, type LayoutEditorHandle } from "./react-flow-editor";
import { createProfileDrawer } from "./profile-drawer";
import { createDeviceBar, type ProfileDevice, type ProfileDeviceKind } from "./device-bar";
import { showDeviceModal, type DeviceEntry } from "./device-modal";
import { showDeviceContextMenu } from "./device-context-menu";
import { showDeleteDeviceDialog } from "./device-delete-dialog";
import { showDevicePropertiesDialog } from "./device-properties-dialog";
import { showUnsavedLayoutDialog } from "./layout-unsaved-dialog";
import { createMacroStudio } from "./macro-studio";
import { isKeyboardJoystickDirectionCode } from "./keyboard-joystick";
import { createBindingPopover } from "./binding-popover";
import {
  getInputCodeLabel,
  getMappingTargetLabel,
  isSupportedMappingTarget,
  type MappingTarget,
} from "./input-codes";
import logitechG502XSvgMarkup from "./assets/logitech-g502-x.svg?raw";

const INLINE_LOGITECH_G502_X_SVG = logitechG502XSvgMarkup
  .replace(/<\?xml[\s\S]*?\?>\s*/i, "")
  .replace(/<!--[\s\S]*?-->\s*/g, "")
  .trim();
const DEVICE_ARTWORK_BUTTON_CODES = new Map<number, "LMB" | "RMB">([
  [272, "LMB"],
  [273, "RMB"],
]);
const DEVICE_ARTWORK_BUTTON_LABELS = new Map<number, string>([
  [272, "Mouse Left"],
  [273, "Mouse Right"],
]);

interface DeviceArtworkPreviewHandle {
  setButtonState(code: number, pressed: boolean): void;
  setSelected(code: number | null): void;
  clearAll(): void;
  destroy(): void;
}

interface DeviceLayout {
  device: {
    name: string;
    vendor_id: number;
    product_id: number;
    rows: number;
    cols: number;
  };
  buttons: Array<{
    id: number;
    label: string;
    row: number;
    col: number;
  }>;
}

interface ProfileMeta {
  name: string;
  device_name?: string;
}

interface Profile {
  profile: ProfileMeta;
  devices: ProfileDevice[];
  mappings: Array<{
    device?: string;
    from: number;
    to: MappingTarget;
  }>;
}

interface ButtonStateEvent {
  code: number;
  pressed: boolean;
  device_path: string;
  device_name: string;
}

interface AxisStateEvent {
  axis: number;
  value: number;
  device_path: string;
  device_name: string;
  minimum?: number;
  maximum?: number;
  flat?: number;
}

interface AzeronJoystickStateEvent {
  x: number;
  y: number;
  raw_x: number;
  raw_y: number;
  source: string;
}

interface AzeronHidReportEvent {
  length: number;
  hex: string;
  ascii?: string | null;
  parsed_source?: string | null;
}

interface MonitoringRequest {
  devicePaths: string[];
  label: string;
  useAzeronHid: boolean;
  legacyMappings: Profile["mappings"];
  suppressMappedInputs: boolean;
}

interface DeviceRegistryToml {
  path: string;
  content: string;
}

const MOUSE_BUTTON_CODES = new Set([272, 273, 274, 275, 276]);
const JOYSTICK_AXIS_CODES = new Set([0, 1]);
const JOYSTICK_ACTIVITY_WINDOW_MS = 140;
const JOYSTICK_DEFAULT_MIN = 0;
const JOYSTICK_DEFAULT_MAX = 1023;
const AZERON_JOYSTICK_CENTER = 512;
const AZERON_JOYSTICK_SPAN = 512;

export async function createApp(container: HTMLElement) {
  const appWindow = getCurrentWindow();

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const editable = target.closest("input, textarea, select, [contenteditable=\"true\"]");
    return editable instanceof HTMLElement;
  };

  container.innerHTML = `
    <div class="loading-overlay" id="loading-overlay">
      <div class="loading-spinner"></div>
      <span>Loading profiles...</span>
    </div>
    <div class="window-shell">
      <header class="titlebar" id="app-titlebar">
        <div class="titlebar-main">
          <button
            id="btn-hamburger"
            class="btn-hamburger titlebar-hamburger"
            type="button"
            title="Profiles"
            aria-label="Toggle profiles drawer"
            data-titlebar-action="drawer"
          >
            <span></span><span></span><span></span>
          </button>
          <div class="titlebar-brand">
            <span class="titlebar-mark" aria-hidden="true"></span>
            <span class="titlebar-title" id="window-title">dumbWASD</span>
          </div>
        </div>
        <div class="window-controls">
          <button
            id="btn-window-minimize"
            class="window-control"
            type="button"
            title="Minimize"
            aria-label="Minimize window"
            data-window-control="minimize"
          >
            <span class="window-control-icon minimize" aria-hidden="true"></span>
          </button>
          <button
            id="btn-window-maximize"
            class="window-control"
            type="button"
            title="Maximize"
            aria-label="Maximize window"
            data-window-control="maximize"
          >
            <span class="window-control-icon maximize" aria-hidden="true"></span>
          </button>
          <button
            id="btn-window-close"
            class="window-control window-control-close"
            type="button"
            title="Close"
            aria-label="Close window"
            data-window-control="close"
          >
            <span class="window-control-icon close" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="window-body">
        <aside class="profile-drawer" id="profile-drawer">
          <div class="drawer-header">
            <span class="drawer-title">Profiles</span>
          </div>
          <ul id="profile-list" class="profile-list">
            <li id="btn-add-profile" class="profile-item profile-add-btn">Add a Profile (+)</li>
          </ul>
        </aside>
        <div class="main-area">
          <header class="toolbar">
            <div class="selectors">
              <div id="layout-selector"></div>
            </div>
            <button id="btn-toggle-mode" class="btn">Edit Mode</button>
            <button id="btn-toggle-overlay" class="btn">Overlay</button>
            <button id="btn-toggle-macros" class="btn">Macros</button>
            <button id="btn-reconnect" class="btn" style="display: none;">Reconnect</button>
          </header>
          <main id="grid-container"></main>
          <div id="event-log-container" class="event-log-container" style="display: none;">
            <div class="event-log-header">
              <span>Event Log</span>
              <div class="event-log-controls">
                <label class="event-log-toggle" for="toggle-listen-all-devices">
                  <input id="toggle-listen-all-devices" type="checkbox" />
                  <span>All devices</span>
                </label>
                <button id="btn-clear-log" class="btn btn-small">Clear</button>
              </div>
            </div>
            <div id="event-log" class="event-log"></div>
          </div>
          <div class="device-bar" id="device-bar">
            <div id="device-chips" class="device-chips"></div>
            <button id="btn-add-device" class="btn btn-icon" title="Add Device">+</button>
          </div>
          <div class="action-bar">
            <button class="btn btn-action" disabled title="Not implemented yet">Apply to Slot</button>
            <button class="btn btn-action" disabled title="Not implemented yet">Power Off</button>
          </div>
          <footer class="status-bar">
            <span id="connection-indicator" class="connection-indicator disconnected" title="Disconnected">&#x25CF;</span>
            <span id="status">Select a profile...</span>
          </footer>
        </div>
      </div>
    </div>
  `;

  // ── DOM refs ──
  const titleBar = container.querySelector<HTMLElement>("#app-titlebar")!;
  const windowTitleEl = container.querySelector<HTMLElement>("#window-title")!;
  const minimizeWindowBtn = container.querySelector<HTMLButtonElement>("#btn-window-minimize")!;
  const maximizeWindowBtn = container.querySelector<HTMLButtonElement>("#btn-window-maximize")!;
  const closeWindowBtn = container.querySelector<HTMLButtonElement>("#btn-window-close")!;
  const reconnectBtn = container.querySelector<HTMLButtonElement>("#btn-reconnect")!;
  const toggleModeBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-mode")!;
  const gridContainer = container.querySelector<HTMLElement>("#grid-container")!;
  const statusEl = container.querySelector<HTMLElement>("#status")!;
  const connectionIndicator = container.querySelector<HTMLElement>("#connection-indicator")!;
  const eventLogContainer = container.querySelector<HTMLElement>("#event-log-container")!;
  const eventLog = container.querySelector<HTMLElement>("#event-log")!;
  const clearLogBtn = container.querySelector<HTMLButtonElement>("#btn-clear-log")!;
  const listenAllDevicesToggle = container.querySelector<HTMLInputElement>("#toggle-listen-all-devices")!;
  const actionBar = container.querySelector<HTMLElement>(".action-bar")!;

  const profileListEl = container.querySelector<HTMLUListElement>("#profile-list")!;
  const addProfileBtn = container.querySelector<HTMLElement>("#btn-add-profile")!;
  const deviceChipsEl = container.querySelector<HTMLElement>("#device-chips")!;
  const addDeviceBtn = container.querySelector<HTMLButtonElement>("#btn-add-device")!;
  const hamburgerBtn = container.querySelector<HTMLButtonElement>("#btn-hamburger")!;
  const overlayBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-overlay")!;
  const macroBtn = container.querySelector<HTMLButtonElement>("#btn-toggle-macros")!;
  const macroStudio = createMacroStudio();
  const bindingPopover = createBindingPopover();

  const handleGlobalSelectAll = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "a") {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    }
  };

  document.addEventListener("keydown", handleGlobalSelectAll, true);

  async function syncWindowChrome() {
    try {
      windowTitleEl.textContent = await appWindow.title();
      const maximized = await appWindow.isMaximized();
      maximizeWindowBtn.classList.toggle("is-maximized", maximized);
      maximizeWindowBtn.title = maximized ? "Restore" : "Maximize";
      maximizeWindowBtn.setAttribute("aria-label", maximized ? "Restore window" : "Maximize window");
    } catch (e) {
      statusEl.textContent = `Window chrome error: ${e}`;
    }
  }

  // Fire-and-forget keeps GTK dragging reliable on Linux.
  titleBar.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.detail > 1) return;
    if ((event.target as HTMLElement).closest("[data-window-control], [data-titlebar-action]")) return;
    event.preventDefault();
    void appWindow.startDragging();
  });

  titleBar.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("[data-window-control], [data-titlebar-action]")) return;
    void appWindow.toggleMaximize().then(syncWindowChrome);
  });

  minimizeWindowBtn.addEventListener("click", () => {
    void appWindow.minimize();
  });

  maximizeWindowBtn.addEventListener("click", () => {
    void appWindow.toggleMaximize().then(syncWindowChrome);
  });

  closeWindowBtn.addEventListener("click", () => {
    void appWindow.close();
  });

  const unlistenWindowResize = await appWindow.onResized(() => {
    void syncWindowChrome();
  });

  window.addEventListener("beforeunload", () => {
    unlistenWindowResize();
    document.removeEventListener("keydown", handleGlobalSelectAll, true);
    bindingPopover.destroy();
  }, { once: true });

  await syncWindowChrome();

  // ── Overlay toggle ──
  overlayBtn.addEventListener("click", async () => {
    try {
      const opened = await invoke<boolean>("toggle_overlay");
      overlayBtn.classList.toggle("active", opened);
    } catch (e) {
      statusEl.textContent = `Overlay error: ${e}`;
    }
  });

  // ── Drawer toggle ──
  let drawerOpen = false;

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
    container.classList.toggle("drawer-open", drawerOpen);
    hamburgerBtn.classList.toggle("active", drawerOpen);
  }

  hamburgerBtn.addEventListener("click", toggleDrawer);

  const REL_AXIS_NAMES: Record<number, string> = {
    0: "ABS_X",
    1: "ABS_Y",
    6: "REL_HWHEEL",
    8: "REL_WHEEL",
    11: "REL_WHEEL_HI_RES",
    12: "REL_HWHEEL_HI_RES",
  };

  clearLogBtn.addEventListener("click", () => {
    eventLog.innerHTML = "";
  });

  function findDeviceEntryByPath(path: string): DeviceEntry | null {
    return allDevices.find((device) => device.paths.includes(path)) ?? null;
  }

  function addEventLogEntry(code: number, pressed: boolean, devicePath?: string, deviceName?: string) {
    const name = getInputCodeLabel(code);
    const action = pressed ? "PRESS" : "RELEASE";
    const sourceEntry = devicePath ? findDeviceEntryByPath(devicePath) : null;
    const sourceLabel = deviceName || sourceEntry?.name || devicePath || "Unknown device";
    const entry = document.createElement("div");
    entry.className = `event-entry ${pressed ? "event-press" : "event-release"}`;
    entry.textContent = `${sourceLabel} · ${name} (${code}) ${action}`;
    if (devicePath) {
      entry.title = devicePath;
    }
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  function addAxisLogEntry(
    axis: number,
    value: number,
    devicePath?: string,
    deviceName?: string,
    minimum?: number,
    maximum?: number,
    flat?: number,
  ) {
    const name = REL_AXIS_NAMES[axis] || `REL_${axis}`;
    const sourceEntry = devicePath ? findDeviceEntryByPath(devicePath) : null;
    const sourceLabel = deviceName || sourceEntry?.name || devicePath || "Unknown device";
    const entry = document.createElement("div");
    entry.className = "event-entry event-axis";
    const hasRange = typeof minimum === "number" && typeof maximum === "number" && maximum > minimum;
    const normalized = hasRange
      ? Math.round((((value - minimum) / (maximum - minimum)) * 2 - 1) * 100)
      : null;
    const flatText = typeof flat === "number" ? ` flat ${flat}` : "";
    const rangeText = hasRange ? ` range ${minimum}..${maximum}` : "";
    const normalizedText = normalized === null ? "" : ` norm ${normalized >= 0 ? "+" : ""}${normalized}%`;
    entry.textContent = `${sourceLabel} · ${name} (${axis}) value ${value}${rangeText}${flatText}${normalizedText}`;
    if (devicePath) {
      entry.title = devicePath;
    }
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  function addAzeronHidReportLogEntry(payload: AzeronHidReportEvent) {
    if (payload.parsed_source) {
      return;
    }

    const entry = document.createElement("div");
    entry.className = "event-entry event-axis";
    entry.textContent =
      `Azeron HID · RAW report len ${payload.length}` +
      (payload.ascii ? ` ascii ${payload.ascii}` : "") +
      ` hex ${payload.hex}`;
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  function addMonitoringLogEntry(message: string) {
    const entry = document.createElement("div");
    entry.className = "event-entry event-axis";
    entry.textContent = message;
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
    while (eventLog.children.length > 100) {
      eventLog.removeChild(eventLog.firstChild!);
    }
  }

  listenAllDevicesToggle.addEventListener("change", async () => {
    listenAllDevices = listenAllDevicesToggle.checked;
    await syncMonitoringScope(true);
  });

  // ── State ──
  let currentProfileName: string | null = null;
  let currentProfile: Profile | null = null;
  let selectedDeviceInBar: ProfileDevice | null = null;
  let selectedLayout: string | null = null;
  let currentLayout: DeviceLayout | null = null;
  let monitoring = false;
  let buttonGrid: ButtonGrid | null = null;
  let layoutEditor: LayoutEditorHandle | null = null;
  let deviceArtworkPreview: DeviceArtworkPreviewHandle | null = null;
  let unlistenButtonState: (() => void) | null = null;
  let unlistenAxisState: (() => void) | null = null;
  let unlistenAzeronJoystickState: (() => void) | null = null;
  let unlistenAzeronHidReport: (() => void) | null = null;
  let isEditMode = false;
  let isMacroMode = false;
  let listenAllDevices = false;
  let monitoredPathsKey = "";
  let runtimeRemapActive = false;
  let closeDeviceContextMenu: (() => void) | null = null;
  const pressedButtons = new Set<number>();
  const joystickEmulatedDirectionCodes = new Set<number>();
  const joystickAxisValues = new Map<string, Map<number, number>>();
  const joystickAxisNormalized = new Map<string, Map<number, number>>();
  let lastJoystickMotionAt = 0;
  let currentJoystickVector: { x: number; y: number } | null = null;
  // Cache system devices at startup
  let allDevices: DeviceEntry[] = [];
  try {
    allDevices = await invoke<DeviceEntry[]>("list_devices");
  } catch (e) {
    statusEl.textContent = `Error loading devices: ${e}`;
  }

  function normalizeDeviceLabel(value?: string | null): string {
    return (value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isG502XDevice(device: ProfileDevice | null): boolean {
    if (!device || device.vendor_id !== 0x046D) {
      return false;
    }

    const labels = [device.name, device.raw_name]
      .map((value) => normalizeDeviceLabel(value))
      .filter(Boolean);

    return labels.some((label) => label.includes("g502 x"));
  }

  function normalizeArtworkToken(value?: string | null): string {
    return (value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function createDeviceArtworkPreview(
    svg: SVGElement,
    options: {
      onButtonClick?(button: { id: number; label: string }, element: SVGElement): void;
    } = {},
  ): DeviceArtworkPreviewHandle {
    const aliases = new Map<string, Set<string>>([
      ["LMB", new Set(["LMB", "BUTTON_LMB", "LEFT", "BUTTON_LEFT", "MOUSE_LEFT"])],
      ["RMB", new Set(["RMB", "BUTTON_RMB", "RIGHT", "BUTTON_RIGHT", "MOUSE_RIGHT"])],
    ]);
    const reverseCodes = new Map<string, number>();
    for (const [code, key] of DEVICE_ARTWORK_BUTTON_CODES) {
      reverseCodes.set(key, code);
    }
    const targets = new Map<string, SVGElement[]>();
    for (const key of aliases.keys()) {
      targets.set(key, []);
    }
    let selectedCode: number | null = null;

    const elements = svg.querySelectorAll<SVGElement>("*");
    for (const element of elements) {
      const tokens = [
        element.getAttribute("id"),
        element.getAttribute("label"),
        element.getAttribute("inkscape:label"),
      ]
        .map((value) => normalizeArtworkToken(value))
        .filter(Boolean);

      for (const [key, names] of aliases) {
        if (tokens.some((token) => names.has(token))) {
          element.classList.add("device-artwork-hit-target");
          targets.get(key)!.push(element);
          const code = reverseCodes.get(key);
          const label = code ? DEVICE_ARTWORK_BUTTON_LABELS.get(code) : null;

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

    return {
      setButtonState(code: number, pressed: boolean) {
        const key = DEVICE_ARTWORK_BUTTON_CODES.get(code);
        if (!key) {
          return;
        }

        for (const element of targets.get(key) || []) {
          element.classList.toggle("active", pressed);
        }
      },
      setSelected(code: number | null) {
        if (selectedCode !== null) {
          const selectedKey = DEVICE_ARTWORK_BUTTON_CODES.get(selectedCode);
          for (const element of (selectedKey && targets.get(selectedKey)) || []) {
            element.classList.remove("selected");
          }
        }

        selectedCode = code;
        if (selectedCode === null) {
          return;
        }

        const selectedKey = DEVICE_ARTWORK_BUTTON_CODES.get(selectedCode);
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

  function deviceIdentity(device: { id?: string; vendor_id: number; product_id: number }): string {
    return device.id || `${device.vendor_id}:${device.product_id}`;
  }

  function findDeviceEntry(device: {
    id?: string;
    vendor_id: number;
    product_id: number;
    name?: string;
    raw_name?: string;
  }): DeviceEntry | null {
    const identity = deviceIdentity(device);
    const exactMatch = allDevices.find((entry) => entry.id === identity);
    if (exactMatch) {
      return exactMatch;
    }

    const candidates = allDevices.filter(
      (entry) => entry.vendor_id === device.vendor_id && entry.product_id === device.product_id
    );
    if (candidates.length === 0) {
      return null;
    }

    const aliases = new Set(
      [device.name, device.raw_name]
        .map((value) => normalizeDeviceLabel(value))
        .filter(Boolean)
    );

    const namedMatches = candidates.filter((entry) => {
      const entryLabels = [entry.name, entry.raw_name, entry.id]
        .map((value) => normalizeDeviceLabel(value))
        .filter(Boolean);
      return entryLabels.some((label) => aliases.has(label));
    });

    if (namedMatches.length === 1) {
      return namedMatches[0];
    }

    return candidates.length === 1 ? candidates[0] : null;
  }

  function getProfileDeviceKind(entry: DeviceEntry | null): ProfileDeviceKind | undefined {
    if (!entry) return undefined;
    if (entry.is_azeron) return "azeron";
    if (entry.has_mouse) return "mouse";
    if (entry.has_gamepad) return "gamepad";
    if (entry.has_keyboard) return "keyboard";
    return undefined;
  }

  function isLikelyJoystickAxisSource(devicePath: string, deviceName?: string): boolean {
    const sourceEntry = findDeviceEntryByPath(devicePath);
    if (sourceEntry) {
      if (sourceEntry.is_azeron || sourceEntry.has_gamepad) {
        return true;
      }
      if (sourceEntry.has_keyboard || sourceEntry.has_mouse) {
        const selectedEntry = selectedDeviceInBar ? findDeviceEntry(selectedDeviceInBar) : null;
        if (selectedEntry?.paths.includes(devicePath) && selectedEntry.is_azeron) {
          return true;
        }
      }
    }

    const lower = (deviceName || "").toLowerCase();
    if (lower.includes("keyboard") || lower.includes("mouse")) {
      return false;
    }
    return lower.includes("gamepad") || lower.includes("joystick") || lower.includes("azeron");
  }

  function shouldUseAzeronHidJoystick(): boolean {
    return selectedDeviceInBar?.device_kind === "azeron";
  }

  function recordJoystickMotion(axis: number, value: number, devicePath: string, deviceName?: string) {
    if (!JOYSTICK_AXIS_CODES.has(axis) || !isLikelyJoystickAxisSource(devicePath, deviceName)) {
      return;
    }

    let pathAxes = joystickAxisValues.get(devicePath);
    if (!pathAxes) {
      pathAxes = new Map<number, number>();
      joystickAxisValues.set(devicePath, pathAxes);
    }

    const previous = pathAxes.get(axis);
    pathAxes.set(axis, value);

    if (previous === undefined || previous !== value) {
      lastJoystickMotionAt = Date.now();
    }
  }

  function normalizeJoystickAxisValue(value: number, minimum?: number, maximum?: number, flat?: number): number {
    const min = minimum ?? JOYSTICK_DEFAULT_MIN;
    const max = maximum ?? JOYSTICK_DEFAULT_MAX;
    if (max <= min) {
      return 0;
    }

    const center = min + (max - min) / 2;
    const span = Math.max((max - min) / 2, 1);
    const normalized = Math.max(-1, Math.min(1, (value - center) / span));
    if (!flat) {
      return normalized;
    }

    const deadzone = Math.min(Math.abs(flat / span), 0.45);
    if (Math.abs(normalized) <= deadzone) {
      return 0;
    }

    return normalized;
  }

  function normalizeAzeronJoystickValue(value: number): number {
    return Math.max(-1, Math.min(1, (value - AZERON_JOYSTICK_CENTER) / AZERON_JOYSTICK_SPAN));
  }

  function applyJoystickVectorToWorkspace() {
    if (!currentJoystickVector) {
      return;
    }

    buttonGrid?.setJoystickVector(currentJoystickVector.x, currentJoystickVector.y);
    layoutEditor?.setJoystickVector(currentJoystickVector.x, currentJoystickVector.y);
  }

  function updateJoystickVector(
    axis: number,
    value: number,
    devicePath: string,
    deviceName?: string,
    minimum?: number,
    maximum?: number,
    flat?: number,
  ) {
    if (shouldUseAzeronHidJoystick()) {
      return;
    }
    if (!JOYSTICK_AXIS_CODES.has(axis) || !isLikelyJoystickAxisSource(devicePath, deviceName)) {
      return;
    }

    let pathAxes = joystickAxisNormalized.get(devicePath);
    if (!pathAxes) {
      pathAxes = new Map<number, number>();
      joystickAxisNormalized.set(devicePath, pathAxes);
    }

    const normalized = normalizeJoystickAxisValue(value, minimum, maximum, flat);
    pathAxes.set(axis, normalized);

    currentJoystickVector = {
      x: pathAxes.get(0) ?? 0,
      y: pathAxes.get(1) ?? 0,
    };

    applyJoystickVectorToWorkspace();
  }

  function updateJoystickVectorFromAzeronHid(payload: AzeronJoystickStateEvent) {
    if (!shouldUseAzeronHidJoystick()) {
      return;
    }

    lastJoystickMotionAt = Date.now();
    currentJoystickVector = {
      x: normalizeAzeronJoystickValue(payload.x),
      y: normalizeAzeronJoystickValue(payload.y),
    };

    applyJoystickVectorToWorkspace();
  }

  function shouldTreatAsJoystickEmulated(code: number, pressed: boolean): boolean {
    if (selectedDeviceInBar?.device_kind !== "azeron" || !isKeyboardJoystickDirectionCode(code)) {
      return false;
    }

    if (pressed) {
      const isRecentJoystickMotion = (Date.now() - lastJoystickMotionAt) <= JOYSTICK_ACTIVITY_WINDOW_MS;
      if (isRecentJoystickMotion) {
        joystickEmulatedDirectionCodes.add(code);
        return true;
      }
      return false;
    }

    if (joystickEmulatedDirectionCodes.has(code)) {
      joystickEmulatedDirectionCodes.delete(code);
      return true;
    }

    return false;
  }

  function hydrateProfileDevices(devices: ProfileDevice[]): ProfileDevice[] {
    return devices.map((device) => {
      const entry = findDeviceEntry(device);
      const device_kind = device.device_kind ?? getProfileDeviceKind(entry);

      if (!entry && !device_kind) {
        return device;
      }

      return {
        ...device,
        id: device.id || entry?.id,
        raw_name: device.raw_name || entry?.raw_name,
        device_kind,
      };
    });
  }

  function isSameProfileDevice(a: ProfileDevice | null, b: ProfileDevice | null): boolean {
    if (!a || !b) return false;
    return deviceIdentity(a) === deviceIdentity(b);
  }

  function clearSelectedButtonBindingState() {
    buttonGrid?.setSelected(null);
    deviceArtworkPreview?.setSelected(null);
  }

  function closeBindingPopover() {
    bindingPopover.close();
    clearSelectedButtonBindingState();
  }

  function getLegacyButtonMapping(code: number): MappingTarget | null {
    if (!currentProfile) {
      return null;
    }

    const match = currentProfile.mappings.find((mapping) =>
      mapping.from === code && isSupportedMappingTarget(mapping.to)
    );

    return match ? { ...match.to } : null;
  }

  async function emitLegacyButtonMapping(code: number, pressed: boolean) {
    const mapping = getLegacyButtonMapping(code);
    if (!mapping) {
      return;
    }

    await invoke("emit_output_target", {
      target: mapping,
      pressed,
    });
  }

  async function persistLegacyButtonMapping(code: number, nextTarget: MappingTarget | null) {
    if (!currentProfile || !currentProfileName) {
      throw new Error("Select a profile first");
    }

    const nextMappings = currentProfile.mappings.filter((mapping) => mapping.from !== code);
    if (nextTarget) {
      nextMappings.push({
        from: code,
        to: { ...nextTarget },
      });
    }

    const nextProfile: Profile = {
      ...currentProfile,
      mappings: nextMappings,
    };

    await invoke("save_profile", {
      name: currentProfileName,
      profile: nextProfile,
    });

    currentProfile = nextProfile;
    await syncMonitoringScope(true);
  }

  function openBindingPopoverForButton(
    button: { id: number; label: string },
    element: Element,
  ) {
    if (!currentProfile || !currentProfileName || isEditMode || isMacroMode) {
      return;
    }

    if (bindingPopover.isOpenFor(button.id)) {
      closeBindingPopover();
      return;
    }

    const currentBinding = getLegacyButtonMapping(button.id);
    buttonGrid?.setSelected(button.id);
    deviceArtworkPreview?.setSelected(button.id);
    bindingPopover.open({
      anchorEl: element,
      button: { code: button.id, label: button.label },
      currentBinding,
      onClose: clearSelectedButtonBindingState,
      onSave: async (nextBinding) => {
        await persistLegacyButtonMapping(button.id, nextBinding);
        statusEl.textContent = `${button.label} mapped to ${getMappingTargetLabel(nextBinding)}`;
      },
      onReset: async () => {
        await persistLegacyButtonMapping(button.id, null);
        statusEl.textContent = `${button.label} mapping cleared`;
      },
    });
  }

  async function persistSelectedDeviceLayout(layoutName: string) {
    if (!currentProfile || !currentProfileName || !selectedDeviceInBar) {
      return;
    }

    const index = currentProfile.devices.findIndex((device) =>
      isSameProfileDevice(device, selectedDeviceInBar)
    );
    if (index < 0) return;

    const currentDevice = currentProfile.devices[index];
    if (!currentDevice || currentDevice.layout === layoutName) {
      return;
    }

    const updatedDevice = {
      ...currentDevice,
      layout: layoutName,
    };
    const nextDevices = [...currentProfile.devices];
    nextDevices[index] = updatedDevice;

    const nextProfile: Profile = {
      ...currentProfile,
      devices: nextDevices,
    };

    await invoke("save_profile", {
      name: currentProfileName,
      profile: nextProfile,
    });

    currentProfile = nextProfile;
    selectedDeviceInBar = updatedDevice;
    deviceBar.setDevices(currentProfile.devices);
    deviceBar.setSelected(selectedDeviceInBar);
  }

  async function showDeviceProperties(device: ProfileDevice) {
    const registryToml = await invoke<DeviceRegistryToml | null>("get_device_registry_toml", {
      vendorId: device.vendor_id,
      productId: device.product_id,
      name: device.name,
      rawName: device.raw_name ?? null,
    });

    showDevicePropertiesDialog({
      deviceName: device.name,
      registryToml,
    });
  }

  async function editDeviceLayout(device: ProfileDevice) {
    if (isMacroMode) {
      isMacroMode = false;
      macroBtn.classList.remove("active");
    }

    await selectDeviceFromBar(device);

    if (!currentLayout) {
      statusEl.textContent = `No layout available to edit for ${device.name}`;
      return;
    }

    isEditMode = true;
    toggleModeBtn.textContent = "View Mode";
    renderWorkspace();
    statusEl.textContent = `Editing layout: ${currentLayout.device.name}`;
  }

  async function resolveLayoutNameForDevice(device: ProfileDevice): Promise<string | null> {
    try {
      return await invoke<string | null>("resolve_layout_for_device", {
        vendorId: device.vendor_id,
        productId: device.product_id,
        name: device.name,
        rawName: device.raw_name ?? null,
      });
    } catch (e) {
      console.warn("Error resolving default layout:", e);
      return null;
    }
  }

  async function confirmExitEditModeIfDirty(): Promise<boolean> {
    if (!isEditMode || !layoutEditor?.hasUnsavedChanges()) {
      return true;
    }

    const layoutName = selectedLayout || currentLayout?.device.name || "this layout";
    const choice = await showUnsavedLayoutDialog({ layoutName });

    if (choice === "cancel") {
      return false;
    }

    if (choice === "discard") {
      return true;
    }

    const saved = await layoutEditor.save();
    if (!saved) {
      statusEl.textContent = `Error saving layout: ${layoutName}`;
      return false;
    }

    return true;
  }

  function getAllMonitoredPaths(): string[] {
    return [...new Set(allDevices.flatMap((device) => device.paths))];
  }

  function shouldSuppressMappedInputs(): boolean {
    if (isMacroMode || listenAllDevices || !selectedDeviceInBar || !currentProfile?.mappings.length) {
      return false;
    }

    return selectedDeviceInBar.device_kind === "mouse" || selectedDeviceInBar.device_kind === "keyboard";
  }

  function buildMonitoringRequest(): MonitoringRequest | null {
    const legacyMappings = currentProfile?.mappings ?? [];
    const suppressMappedInputs = shouldSuppressMappedInputs();

    if (isMacroMode) {
      const keyboardPaths = allDevices
        .filter((device) => device.has_keyboard)
        .flatMap((device) => device.paths);

      const curatedPaths = currentProfile
        ? currentProfile.devices.flatMap((device) => {
            const entry = findDeviceEntry(device);
            return entry ? entry.paths : [];
          })
        : [];

      const devicePaths = [...new Set([...keyboardPaths, ...curatedPaths])];
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "Keyboards + curated gamepads",
        useAzeronHid: selectedDeviceInBar?.device_kind === "azeron",
        legacyMappings,
        suppressMappedInputs: false,
      };
    }

    if (listenAllDevices) {
      const devicePaths = getAllMonitoredPaths();
      if (devicePaths.length === 0) return null;

      return {
        devicePaths,
        label: "All detected devices",
        useAzeronHid: selectedDeviceInBar?.device_kind === "azeron",
        legacyMappings,
        suppressMappedInputs: false,
      };
    }

    if (!selectedDeviceInBar) return null;

    const entry = findDeviceEntry(selectedDeviceInBar);
    if (!entry) return null;

    return {
      devicePaths: entry.paths,
      label: entry.name,
      useAzeronHid: entry.is_azeron || selectedDeviceInBar.device_kind === "azeron",
      legacyMappings,
      suppressMappedInputs,
    };
  }

  async function syncMonitoringScope(force = false) {
    const request = buildMonitoringRequest();
    const nextKey = request ? [...request.devicePaths].sort().join("|") : "";

    if (!request) {
      if (monitoring) {
        await stopMonitoring();
      } else {
        monitoredPathsKey = "";
        runtimeRemapActive = false;
        macroStudio.setMonitoringActive(false);
        syncAuxPanels();
      }
      return;
    }

    if (!force && monitoring && nextKey === monitoredPathsKey) {
      macroStudio.setMonitoringActive(true);
      syncAuxPanels();
      return;
    }

    if (monitoring) {
      await stopMonitoring();
    }

    await startMonitoringRequest(request);
  }

  // ── Profile Drawer ──
  const profileDrawer = createProfileDrawer(profileListEl, addProfileBtn, {
    async onSelect(profileName) {
      await selectProfile(profileName);
    },
    async onAdd() {
      const name = prompt("New profile name:");
      if (!name || !name.trim()) return;
      try {
        const slug = await invoke<string>("create_profile", { name: name.trim() });
        await refreshProfileList();
        await selectProfile(slug);
      } catch (e) {
        statusEl.textContent = `Error creating profile: ${e}`;
      }
    },
  });

  // ── Device Bar ──
  const deviceBar = createDeviceBar(deviceChipsEl, addDeviceBtn, {
    async onSelectDevice(device) {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = null;
      await selectDeviceFromBar(device);
    },
    async onAddDevice() {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = null;
      if (!currentProfile || !currentProfileName) {
        statusEl.textContent = "Select a profile first";
        return;
      }
      showDeviceModal(allDevices, currentProfile.devices, {
        async onSelect(entry) {
          // Add device to profile
          const newDevice: ProfileDevice = {
            id: entry.id,
            vendor_id: entry.vendor_id,
            product_id: entry.product_id,
            name: entry.name,
            raw_name: entry.raw_name,
            layout: "",
            device_kind: getProfileDeviceKind(entry),
          };
          currentProfile!.devices.push(newDevice);

          // Save profile
          try {
            await invoke("save_profile", {
              name: currentProfileName,
              profile: currentProfile,
            });
          } catch (e) {
            statusEl.textContent = `Error saving profile: ${e}`;
          }

          // Re-render device bar and auto-select the new device
          deviceBar.setDevices(currentProfile!.devices);
          await selectDeviceFromBar(newDevice);
        },
        onClose() {},
      });
    },
    onOpenDeviceMenu(device, position) {
      closeDeviceContextMenu?.();
      closeDeviceContextMenu = showDeviceContextMenu({
        device,
        x: position.x,
        y: position.y,
        onProperties: (targetDevice) => {
          closeDeviceContextMenu = null;
          void showDeviceProperties(targetDevice).catch((error) => {
            statusEl.textContent = `Error loading device properties: ${error}`;
          });
        },
        onEditLayout: (targetDevice) => {
          closeDeviceContextMenu = null;
          void editDeviceLayout(targetDevice)
            .catch((error) => {
              statusEl.textContent = `Error opening layout editor: ${error}`;
            });
        },
        onDelete: (targetDevice) => {
          closeDeviceContextMenu = null;
          showDeleteDeviceDialog({
            device: targetDevice,
            onConfirm: async () => {
              await deleteDeviceFromProfile(targetDevice);
            },
          });
        },
      });
    },
  });

  // ── Layout selector (stays in toolbar) ──
  const layoutSelectorEl = container.querySelector<HTMLElement>("#layout-selector")!;
  let layouts: string[] = [];
  try {
    layouts = await invoke<string[]>("list_layouts");
  } catch (e) {
    statusEl.textContent = `Error loading layouts: ${e}`;
  }

  createDeviceSelector(layoutSelectorEl, {
    label: "Layout",
    items: layouts.map((name) => ({ value: name, label: name })),
    async onChange(value) {
      if (value !== selectedLayout) {
        const canLeaveEditMode = await confirmExitEditModeIfDirty();
        if (!canLeaveEditMode) {
          const layoutSelect = layoutSelectorEl.querySelector<HTMLSelectElement>("select");
          if (layoutSelect) {
            layoutSelect.value = selectedLayout || "";
          }
          return;
        }
      }

      selectedLayout = value;
      await persistSelectedDeviceLayout(value);
      await loadLayout(value);
    },
  });

  // ── Core functions ──

  async function refreshProfileList() {
    try {
      const names = await invoke<string[]>("list_profiles");
      profileDrawer.setProfiles(names);
    } catch (e) {
      statusEl.textContent = `Error loading profiles: ${e}`;
    }
  }

  async function selectProfile(name: string) {
    closeDeviceContextMenu?.();
    closeDeviceContextMenu = null;

    const canLeaveEditMode = await confirmExitEditModeIfDirty();
    if (!canLeaveEditMode) {
      return;
    }

    // Stop any current monitoring
    if (monitoring) await stopMonitoring();

    currentProfileName = name;
    profileDrawer.setSelected(name);

    try {
      currentProfile = await invoke<Profile>("get_profile", { name });
      currentProfile.devices = hydrateProfileDevices(currentProfile.devices);
      statusEl.textContent = `Profile: ${currentProfile.profile.name}`;

      // Populate device bar
      deviceBar.setDevices(currentProfile.devices);
      selectedDeviceInBar = null;
      deviceBar.setSelected(null);

      // Clear main area
      gridContainer.innerHTML = "";
      eventLogContainer.style.display = "none";
      buttonGrid = null;
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      currentLayout = null;
      renderWorkspace();
      syncAuxPanels();

      // Auto-select first device if available
      if (currentProfile.devices.length > 0) {
        await selectDeviceFromBar(currentProfile.devices[0]);
      }
    } catch (e) {
      statusEl.textContent = `Error loading profile: ${e}`;
      currentProfile = null;
    }
  }

  async function selectDeviceFromBar(device: ProfileDevice) {
    closeDeviceContextMenu?.();
    closeDeviceContextMenu = null;

    if (!isSameProfileDevice(selectedDeviceInBar, device)) {
      const canLeaveEditMode = await confirmExitEditModeIfDirty();
      if (!canLeaveEditMode) {
        deviceBar.setSelected(selectedDeviceInBar);
        return;
      }
    }

    selectedDeviceInBar = device;
    deviceBar.setSelected(device);
    statusEl.textContent = device.name;

    const resolvedLayout = device.layout || await resolveLayoutNameForDevice(device);

    // Auto-load a curated layout first, otherwise fall back to a default match.
    if (resolvedLayout) {
      selectedLayout = resolvedLayout;
      // Update the layout selector dropdown to match
      const layoutSelect = layoutSelectorEl.querySelector<HTMLSelectElement>("select");
      if (layoutSelect) layoutSelect.value = resolvedLayout;
      await loadLayout(resolvedLayout);
    } else {
      // No curated or fallback layout available — clear the workspace.
      selectedLayout = null;
      currentLayout = null;
      const layoutSelect = layoutSelectorEl.querySelector<HTMLSelectElement>("select");
      if (layoutSelect) layoutSelect.value = "";
      renderWorkspace();
    }

    await syncMonitoringScope(true);
  }

  async function deleteDeviceFromProfile(device: ProfileDevice) {
    if (!currentProfile || !currentProfileName) {
      throw new Error("Select a profile first");
    }

    if (isSameProfileDevice(selectedDeviceInBar, device)) {
      const canLeaveEditMode = await confirmExitEditModeIfDirty();
      if (!canLeaveEditMode) {
        return;
      }
    }

    const nextDevices = currentProfile.devices.filter(
      (candidate) => !isSameProfileDevice(candidate, device)
    );

    if (nextDevices.length === currentProfile.devices.length) {
      return;
    }

    const nextProfile: Profile = {
      ...currentProfile,
      devices: nextDevices,
    };

    try {
      await invoke("save_profile", {
        name: currentProfileName,
        profile: nextProfile,
      });
    } catch (error) {
      throw new Error(`Error saving profile: ${error}`);
    }

    currentProfile = nextProfile;
    deviceBar.setDevices(currentProfile.devices);

    const deletedSelectedDevice = isSameProfileDevice(selectedDeviceInBar, device);
    if (deletedSelectedDevice) {
      selectedDeviceInBar = null;
      deviceBar.setSelected(null);

      if (currentProfile.devices.length > 0) {
        await selectDeviceFromBar(currentProfile.devices[0]);
      } else {
        currentLayout = null;
        selectedLayout = null;
        const layoutSelect = layoutSelectorEl.querySelector<HTMLSelectElement>("select");
        if (layoutSelect) layoutSelect.value = "";
        renderWorkspace();
        await syncMonitoringScope(true);
        statusEl.textContent = `${device.name} removed from ${currentProfile.profile.name}`;
      }
      return;
    }

    deviceBar.setSelected(selectedDeviceInBar);
    await syncMonitoringScope(true);
    if (!monitoring) {
      statusEl.textContent = `${device.name} removed from ${currentProfile.profile.name}`;
    }
  }

  async function loadLayout(name: string) {
    try {
      const layout = await invoke<DeviceLayout>("get_layout", { name });
      currentLayout = layout;
      renderWorkspace();

      if (!monitoring || !isMacroMode) {
        statusEl.textContent = `Layout: ${layout.device.name} (${layout.buttons.length} buttons)`;
      }
    } catch (e) {
      statusEl.textContent = `Error loading layout: ${e}`;
      buttonGrid?.destroy();
      buttonGrid = null;
      layoutEditor = null;
    }
  }

  function renderViewMode() {
    if (!currentLayout) return;
    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    if (layoutEditor) {
      try { layoutEditor.destroy(); } catch (e) { console.warn('Error destroying layout editor:', e); }
      layoutEditor = null;
    }

    buttonGrid?.destroy();
    gridContainer.innerHTML = "";
    buttonGrid = createButtonGrid(gridContainer, currentLayout, {
      onButtonClick(button, element) {
        openBindingPopoverForButton(button, element);
      },
    });
    buttonGrid.clearAll();
    for (const code of pressedButtons) {
      buttonGrid.setButtonState(code, true);
    }
    applyJoystickVectorToWorkspace();
  }

  function renderEditMode() {
    if (!currentLayout) return;
    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    buttonGrid?.destroy();
    gridContainer.innerHTML = "";
    buttonGrid = null;
    gridContainer.style.height = "100%";

    layoutEditor = createLayoutEditor(gridContainer, currentLayout, {
      onSave: async (updatedLayout) => {
        try {
          await invoke("save_layout", { name: selectedLayout, layout: updatedLayout });
          statusEl.textContent = "Layout saved successfully!";

          if (selectedLayout) {
            const reloadedLayout = await invoke<DeviceLayout>("get_layout", { name: selectedLayout });
            currentLayout = reloadedLayout;
          }
        } catch (e) {
          statusEl.textContent = `Error saving layout: ${e}`;
        }
      },
    });
    requestAnimationFrame(() => {
      layoutEditor?.clearAll();
      for (const code of pressedButtons) {
        layoutEditor?.setButtonState(code, true);
      }
      applyJoystickVectorToWorkspace();
    });
  }

  function renderDeviceArtworkPreview() {
    deviceArtworkPreview?.destroy();
    deviceArtworkPreview = null;

    if (!isG502XDevice(selectedDeviceInBar)) {
      gridContainer.innerHTML = "";
      return;
    }

    gridContainer.innerHTML = `
      <section class="device-artwork-preview" aria-label="Logitech G502 X preview">
        <div class="device-artwork-frame"></div>
      </section>
    `;

    const frame = gridContainer.querySelector<HTMLElement>(".device-artwork-frame");
    if (!frame) {
      return;
    }

    frame.innerHTML = INLINE_LOGITECH_G502_X_SVG;

    const svg = frame.querySelector<SVGElement>("svg");
    if (!svg) {
      return;
    }

    svg.classList.add("device-artwork-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    deviceArtworkPreview = createDeviceArtworkPreview(svg, {
      onButtonClick(button, element) {
        openBindingPopoverForButton(button, element);
      },
    });
    deviceArtworkPreview.clearAll();
    for (const code of pressedButtons) {
      deviceArtworkPreview.setButtonState(code, true);
    }
  }

  function renderWorkspace() {
    closeBindingPopover();
    syncAuxPanels();

    if (isMacroMode) {
      deviceArtworkPreview?.destroy();
      deviceArtworkPreview = null;
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      buttonGrid?.destroy();
      buttonGrid = null;
      gridContainer.innerHTML = "";
      gridContainer.classList.add("macro-workspace-host");
      macroStudio.mount(gridContainer);
      macroStudio.setMonitoringActive(monitoring);
      return;
    }

    gridContainer.classList.remove("macro-workspace-host");
    macroStudio.unmount();

    if (!currentLayout) {
      if (layoutEditor) {
        try { layoutEditor.destroy(); } catch (_) {}
        layoutEditor = null;
      }
      buttonGrid?.destroy();
      buttonGrid = null;
      renderDeviceArtworkPreview();
      return;
    }

    deviceArtworkPreview?.destroy();
    deviceArtworkPreview = null;

    if (isEditMode) {
      renderEditMode();
    } else {
      renderViewMode();
    }
  }

  function syncAuxPanels() {
    eventLogContainer.style.display = monitoring && !isMacroMode ? "flex" : "none";
    actionBar.style.display = isMacroMode ? "none" : "flex";
    toggleModeBtn.disabled = isMacroMode;
    listenAllDevicesToggle.disabled = isMacroMode;
  }

  // ── Toggle View/Edit mode ──
  toggleModeBtn.addEventListener("click", async () => {
    if (isEditMode) {
      const canLeaveEditMode = await confirmExitEditModeIfDirty();
      if (!canLeaveEditMode) {
        return;
      }
    }

    isEditMode = !isEditMode;
    toggleModeBtn.textContent = isEditMode ? "View Mode" : "Edit Mode";

    if (currentLayout) {
      renderWorkspace();
    }
  });

  macroBtn.addEventListener("click", async () => {
    if (!isMacroMode) {
      const canLeaveEditMode = await confirmExitEditModeIfDirty();
      if (!canLeaveEditMode) {
        return;
      }
    }

    isMacroMode = !isMacroMode;
    macroBtn.classList.toggle("active", isMacroMode);
    renderWorkspace();
    await syncMonitoringScope(true);
    statusEl.textContent = isMacroMode
      ? "Macro Studio ready. Recording listens across all connected profile keyboards/gamepads."
      : currentLayout
        ? `Layout: ${currentLayout.device.name} (${currentLayout.buttons.length} buttons)`
        : "Select a profile...";
  });

  reconnectBtn.addEventListener("click", async () => {
    await syncMonitoringScope(true);
  });

  // ── Monitoring ──

  async function startMonitoringRequest(request: MonitoringRequest) {
    try {
      connectionIndicator.className = "connection-indicator connecting";
      connectionIndicator.title = "Connecting...";
      statusEl.textContent = "Connecting...";

      await invoke("start_monitoring", {
        devicePaths: request.devicePaths,
        useAzeronHid: request.useAzeronHid,
        legacyMappings: request.legacyMappings,
        suppressMappedInputs: request.suppressMappedInputs,
      });
      monitoring = true;
      runtimeRemapActive = request.suppressMappedInputs;
      monitoredPathsKey = [...request.devicePaths].sort().join("|");
      reconnectBtn.style.display = "none";
      macroStudio.setMonitoringActive(true);

      connectionIndicator.className = "connection-indicator connected";
      connectionIndicator.title = "Connected";
      statusEl.textContent = request.label;
      syncAuxPanels();
      addMonitoringLogEntry(
        `Monitoring · HID ${request.useAzeronHid ? "enabled" : "disabled"} · paths ${request.devicePaths.join(", ")}`
      );

      unlistenButtonState = await listen<ButtonStateEvent>("button-state", (event) => {
        const { code, pressed, device_path: devicePath, device_name: deviceName } = event.payload;
        const suppressPhysicalHighlight = shouldTreatAsJoystickEmulated(code, pressed);
        if (pressed) {
          pressedButtons.add(code);
        } else {
          pressedButtons.delete(code);
        }
        if (!suppressPhysicalHighlight) {
          addEventLogEntry(code, pressed, devicePath, deviceName);
        }
        if (!MOUSE_BUTTON_CODES.has(code)) {
          macroStudio.handleInputEvent(code, pressed);
        }

        if (buttonGrid) {
          buttonGrid.setButtonState(code, pressed, {
            suppressPhysical: suppressPhysicalHighlight,
          });
        }
        if (layoutEditor) {
          layoutEditor.setButtonState(code, pressed, {
            suppressPhysical: suppressPhysicalHighlight,
          });
        }
        deviceArtworkPreview?.setButtonState(code, pressed);

        if (!runtimeRemapActive) {
          void emitLegacyButtonMapping(code, pressed).catch((error) => {
            statusEl.textContent = `Error applying mapping: ${error}`;
          });
        }
      });

      unlistenAzeronJoystickState = await listen<AzeronJoystickStateEvent>("azeron-joystick-state", (event) => {
        updateJoystickVectorFromAzeronHid(event.payload);
      });

      unlistenAzeronHidReport = await listen<AzeronHidReportEvent>("azeron-hid-report", (event) => {
        addAzeronHidReportLogEntry(event.payload);
      });

      unlistenAxisState = await listen<AxisStateEvent>("axis-state", (event) => {
        const {
          axis,
          value,
          device_path: devicePath,
          device_name: deviceName,
          minimum,
          maximum,
          flat,
        } = event.payload;
        recordJoystickMotion(axis, value, devicePath, deviceName);
        updateJoystickVector(axis, value, devicePath, deviceName, minimum, maximum, flat);
        addAxisLogEntry(axis, value, devicePath, deviceName, minimum, maximum, flat);
      });
    } catch (e) {
      connectionIndicator.className = "connection-indicator disconnected";
      connectionIndicator.title = "Disconnected";
      statusEl.textContent = `Connection error: ${e}`;
      reconnectBtn.style.display = "inline-block";
      monitoredPathsKey = "";
      macroStudio.setMonitoringActive(false);
      syncAuxPanels();
    }
  }

  async function stopMonitoring() {
    try {
      await invoke("stop_monitoring");
    } catch (_) {
      // ignore
    }

    monitoring = false;
    runtimeRemapActive = false;
    monitoredPathsKey = "";
    connectionIndicator.className = "connection-indicator disconnected";
    connectionIndicator.title = "Disconnected";
    reconnectBtn.style.display = "none";
    buttonGrid?.clearAll();
    layoutEditor?.clearAll();
    deviceArtworkPreview?.clearAll();
    pressedButtons.clear();
    joystickEmulatedDirectionCodes.clear();
    joystickAxisValues.clear();
    joystickAxisNormalized.clear();
    lastJoystickMotionAt = 0;
    currentJoystickVector = null;
    macroStudio.setMonitoringActive(false);
    syncAuxPanels();

    unlistenButtonState?.();
    unlistenButtonState = null;
    unlistenAxisState?.();
    unlistenAxisState = null;
    unlistenAzeronJoystickState?.();
    unlistenAzeronJoystickState = null;
    unlistenAzeronHidReport?.();
    unlistenAzeronHidReport = null;
  }

  // ── Startup ──
  await refreshProfileList();

  // Auto-select first profile
  try {
    const profileNames = await invoke<string[]>("list_profiles");
    if (profileNames.length > 0) {
      await selectProfile(profileNames[0]);
    }
  } catch (_) {}

  syncAuxPanels();

  // Dismiss loading overlay
  const overlay = container.querySelector<HTMLElement>("#loading-overlay");
  if (overlay) {
    overlay.classList.add("fade-out");
    overlay.addEventListener("transitionend", () => overlay.remove());
  }
}
