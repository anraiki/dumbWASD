import type { getCurrentWindow } from "@tauri-apps/api/window";

type AppWindow = ReturnType<typeof getCurrentWindow>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const editable = target.closest("input, textarea, select, [contenteditable=\"true\"]");
  return editable instanceof HTMLElement;
}

const RESIZE_DIRECTIONS = [
  "North",
  "South",
  "East",
  "West",
  "NorthEast",
  "NorthWest",
  "SouthEast",
  "SouthWest",
] as const;

// With decorations disabled the window manager provides no resize borders,
// so the frameless window needs its own edge/corner grips.
function setupResizeGrips(appWindow: AppWindow) {
  for (const direction of RESIZE_DIRECTIONS) {
    const grip = document.createElement("div");
    grip.className = "window-resize-grip";
    grip.dataset.direction = direction;
    grip.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      void appWindow.startResizeDragging(direction);
    });
    document.body.appendChild(grip);
  }
}

export async function setupWindowChrome(options: {
  appWindow: AppWindow;
  titleBar: HTMLElement;
  windowTitleEl: HTMLElement;
  minimizeWindowBtn: HTMLButtonElement;
  maximizeWindowBtn: HTMLButtonElement;
  closeWindowBtn: HTMLButtonElement;
  statusEl: HTMLElement;
  onCleanup(): void;
}): Promise<void> {
  const { appWindow } = options;

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
      options.windowTitleEl.textContent = await appWindow.title();
      const maximized = await appWindow.isMaximized();
      document.body.classList.toggle("window-is-maximized", maximized);
      options.maximizeWindowBtn.classList.toggle("is-maximized", maximized);
      options.maximizeWindowBtn.title = maximized ? "Restore" : "Maximize";
      options.maximizeWindowBtn.setAttribute("aria-label", maximized ? "Restore window" : "Maximize window");
    } catch (e) {
      options.statusEl.textContent = `Window chrome error: ${e}`;
    }
  }

  options.titleBar.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.detail > 1) return;
    if ((event.target as HTMLElement).closest("[data-window-control], [data-titlebar-action]")) return;
    event.preventDefault();
    void appWindow.startDragging();
  });

  options.titleBar.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("[data-window-control], [data-titlebar-action]")) return;
    void appWindow.toggleMaximize().then(syncWindowChrome);
  });

  options.minimizeWindowBtn.addEventListener("click", () => void appWindow.minimize());
  options.maximizeWindowBtn.addEventListener("click", () => void appWindow.toggleMaximize().then(syncWindowChrome));
  options.closeWindowBtn.addEventListener("click", () => void appWindow.close());

  setupResizeGrips(appWindow);

  const unlistenWindowResize = await appWindow.onResized(() => void syncWindowChrome());

  window.addEventListener("beforeunload", () => {
    unlistenWindowResize();
    document.removeEventListener("keydown", handleGlobalSelectAll, true);
    options.onCleanup();
  }, { once: true });

  await syncWindowChrome();
}
