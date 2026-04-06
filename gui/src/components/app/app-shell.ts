export interface AppShellRefs {
  titleBar: HTMLElement;
  windowTitleEl: HTMLElement;
  minimizeWindowBtn: HTMLButtonElement;
  maximizeWindowBtn: HTMLButtonElement;
  closeWindowBtn: HTMLButtonElement;
  reconnectBtn: HTMLButtonElement;
  toggleModeBtn: HTMLButtonElement;
  gridContainer: HTMLElement;
  statusEl: HTMLElement;
  connectionIndicator: HTMLElement;
  eventLogContainer: HTMLElement;
  eventLog: HTMLElement;
  clearLogBtn: HTMLButtonElement;
  listenAllDevicesToggle: HTMLInputElement;
  actionBar: HTMLElement;
  profileListEl: HTMLUListElement;
  addProfileBtn: HTMLElement;
  deviceChipsEl: HTMLElement;
  addDeviceBtn: HTMLButtonElement;
  hamburgerBtn: HTMLButtonElement;
  overlayBtn: HTMLButtonElement;
  macroBtn: HTMLButtonElement;
  layoutSelectorEl: HTMLElement;
}

export function mountAppShell(container: HTMLElement): AppShellRefs {
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

  const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;

  return {
    titleBar:             q("#app-titlebar"),
    windowTitleEl:        q("#window-title"),
    minimizeWindowBtn:    q<HTMLButtonElement>("#btn-window-minimize"),
    maximizeWindowBtn:    q<HTMLButtonElement>("#btn-window-maximize"),
    closeWindowBtn:       q<HTMLButtonElement>("#btn-window-close"),
    reconnectBtn:         q<HTMLButtonElement>("#btn-reconnect"),
    toggleModeBtn:        q<HTMLButtonElement>("#btn-toggle-mode"),
    gridContainer:        q("#grid-container"),
    statusEl:             q("#status"),
    connectionIndicator:  q("#connection-indicator"),
    eventLogContainer:    q("#event-log-container"),
    eventLog:             q("#event-log"),
    clearLogBtn:          q<HTMLButtonElement>("#btn-clear-log"),
    listenAllDevicesToggle: q<HTMLInputElement>("#toggle-listen-all-devices"),
    actionBar:            q(".action-bar"),
    profileListEl:        q<HTMLUListElement>("#profile-list"),
    addProfileBtn:        q("#btn-add-profile"),
    deviceChipsEl:        q("#device-chips"),
    addDeviceBtn:         q<HTMLButtonElement>("#btn-add-device"),
    hamburgerBtn:         q<HTMLButtonElement>("#btn-hamburger"),
    overlayBtn:           q<HTMLButtonElement>("#btn-toggle-overlay"),
    macroBtn:             q<HTMLButtonElement>("#btn-toggle-macros"),
    layoutSelectorEl:     q("#layout-selector"),
  };
}
