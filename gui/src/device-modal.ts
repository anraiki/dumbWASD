import type { ProfileDevice } from "./device-bar";

export interface DeviceEntry {
  id: string;
  paths: string[];
  name: string;
  raw_name: string;
  vendor_id: number;
  product_id: number;
  is_azeron: boolean;
  has_keyboard: boolean;
  has_gamepad: boolean;
  has_mouse: boolean;
  member_count: number;
}

export interface DeviceModalOptions {
  onSelect: (device: DeviceEntry) => void;
  onClose: () => void;
}

export function showDeviceModal(
  availableDevices: DeviceEntry[],
  alreadyCurated: ProfileDevice[],
  options: DeviceModalOptions
): void {
  function toHex(n: number): string {
    return n.toString(16).toUpperCase().padStart(4, "0");
  }

  // Filter out devices already in the profile
  const curatedKeys = new Set(
    alreadyCurated.map((d) => d.id || `${d.vendor_id}:${d.product_id}`)
  );
  const uncurated = availableDevices.filter(
    (d) => !curatedKeys.has(d.id)
  );

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
    <span>Add Device to Profile</span>
    <button class="btn btn-icon modal-close">&times;</button>
  `;

  const body = document.createElement("div");
  body.className = "modal-body";

  if (uncurated.length === 0) {
    body.innerHTML = `<p class="text-dim">No additional devices available.</p>`;
  } else {
    for (const dev of uncurated) {
      const row = document.createElement("div");
      row.className = "modal-device-row";
      const name = document.createElement("span");
      name.className = "device-name";
      name.textContent = dev.name;

      const meta = document.createElement("span");
      meta.className = "device-detail";
      meta.textContent = `${dev.id} · VID:PID ${toHex(dev.vendor_id)}:${toHex(dev.product_id)} · ${dev.paths.length} interface(s)`;

      row.appendChild(name);
      row.appendChild(meta);

      if (dev.member_count > 1) {
        const members = document.createElement("span");
        members.className = "device-detail";
        members.textContent = `${dev.member_count} grouped members`;
        row.appendChild(members);
      }

      if (dev.raw_name && dev.raw_name !== dev.name) {
        const rawName = document.createElement("span");
        rawName.className = "device-detail";
        rawName.textContent = dev.raw_name;
        row.appendChild(rawName);
      }

      row.addEventListener("click", () => {
        options.onSelect(dev);
        overlay.remove();
      });
      body.appendChild(row);
    }
  }

  function close() {
    options.onClose();
    overlay.remove();
  }

  header.querySelector(".modal-close")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
