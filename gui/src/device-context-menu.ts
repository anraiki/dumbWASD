import type { ProfileDevice } from "./device-bar";

interface DeviceContextMenuOptions {
  device: ProfileDevice;
  x: number;
  y: number;
  onProperties: (device: ProfileDevice) => void;
  onEditLayout: (device: ProfileDevice) => void;
  onDelete: (device: ProfileDevice) => void;
}

export function showDeviceContextMenu(options: DeviceContextMenuOptions): () => void {
  const menu = document.createElement("div");
  menu.className = "device-context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" class="device-context-menu-item" role="menuitem">
      Properties
    </button>
    <button type="button" class="device-context-menu-item" role="menuitem">
      Edit Layout
    </button>
    <button type="button" class="device-context-menu-item danger" role="menuitem">
      Delete it
    </button>
  `;

  const [propertiesButton, editLayoutButton, deleteButton] = Array.from(
    menu.querySelectorAll<HTMLButtonElement>(".device-context-menu-item")
  );

  function close() {
    window.removeEventListener("pointerdown", handlePointerDown, true);
    window.removeEventListener("contextmenu", handleWindowContextMenu, true);
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("resize", close);
    window.removeEventListener("scroll", close, true);
    menu.remove();
  }

  function handlePointerDown(event: Event) {
    if (menu.contains(event.target as Node)) return;
    close();
  }

  function handleWindowContextMenu(event: MouseEvent) {
    if (menu.contains(event.target as Node)) {
      event.preventDefault();
      return;
    }
    close();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      close();
    }
  }

  propertiesButton?.addEventListener("click", () => {
    close();
    options.onProperties(options.device);
  });

  editLayoutButton?.addEventListener("click", () => {
    close();
    options.onEditLayout(options.device);
  });

  deleteButton.addEventListener("click", () => {
    close();
    options.onDelete(options.device);
  });

  document.body.appendChild(menu);

  const { width, height } = menu.getBoundingClientRect();
  const minInset = 8;
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  menu.style.left = `${Math.max(minInset, Math.min(options.x, maxLeft))}px`;
  menu.style.top = `${Math.max(minInset, Math.min(options.y, maxTop))}px`;

  window.addEventListener("pointerdown", handlePointerDown, true);
  window.addEventListener("contextmenu", handleWindowContextMenu, true);
  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, true);

  return close;
}
