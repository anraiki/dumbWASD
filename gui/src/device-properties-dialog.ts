interface DeviceRegistryToml {
  path: string;
  content: string;
}

interface DevicePropertiesDialogOptions {
  deviceName: string;
  registryToml: DeviceRegistryToml | null;
  onClose?: () => void;
}

export function showDevicePropertiesDialog(options: DevicePropertiesDialogOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal device-properties-modal";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
    <span>Device Properties</span>
    <button type="button" class="btn btn-icon modal-close" aria-label="Close dialog">&times;</button>
  `;

  const body = document.createElement("div");
  body.className = "modal-body";

  const closeButton = header.querySelector<HTMLButtonElement>(".modal-close")!;

  const title = document.createElement("div");
  title.className = "device-properties-title";
  title.textContent = options.deviceName || "Unknown Device";
  body.appendChild(title);

  if (options.registryToml) {
    const path = document.createElement("div");
    path.className = "device-properties-path";
    path.textContent = options.registryToml.path;
    body.appendChild(path);

    const pre = document.createElement("pre");
    pre.className = "device-properties-pre";
    pre.textContent = options.registryToml.content;
    body.appendChild(pre);
  } else {
    const empty = document.createElement("p");
    empty.className = "text-dim";
    empty.textContent = "No registry TOML matched this device.";
    body.appendChild(empty);
  }

  function close() {
    window.removeEventListener("keydown", handleKeyDown, true);
    options.onClose?.();
    overlay.remove();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      close();
    }
  }

  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  window.addEventListener("keydown", handleKeyDown, true);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
