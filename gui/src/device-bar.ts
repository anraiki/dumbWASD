import padXboxIcon from "./assets/pad-xbox.svg";
import azeronIcon from "./assets/azeron.svg";
import mouseGamingIcon from "./assets/mouse-gaming.svg?no-inline";

const AZERON_VID = 5840;

export type ProfileDeviceKind = "azeron" | "mouse" | "gamepad" | "keyboard";

export interface ProfileDevice {
  id?: string;
  vendor_id: number;
  product_id: number;
  name: string;
  raw_name?: string;
  layout: string;
  device_kind?: ProfileDeviceKind;
  active?: boolean;
}

export interface DeviceBarOptions {
  onSelectDevice: (device: ProfileDevice) => void;
  onAddDevice: () => void;
  onOpenDeviceMenu: (device: ProfileDevice, position: { x: number; y: number }) => void;
}

export interface DeviceBar {
  setDevices(devices: ProfileDevice[]): void;
  setSelected(device: ProfileDevice | null): void;
  setActive(deviceId: string, active: boolean): void;
}

export function createDeviceBar(
  chipsContainer: HTMLElement,
  addBtn: HTMLButtonElement,
  options: DeviceBarOptions
): DeviceBar {
  let devices: ProfileDevice[] = [];
  let selected: ProfileDevice | null = null;

  function identity(dev: ProfileDevice | null): string {
    if (!dev) return "";
    return dev.id || `${dev.vendor_id}:${dev.product_id}`;
  }

  function isSame(a: ProfileDevice | null, b: ProfileDevice | null): boolean {
    if (!a || !b) return false;
    return identity(a) === identity(b);
  }

  function toHex(n: number): string {
    return n.toString(16).toUpperCase().padStart(4, "0");
  }

  function inferDeviceKind(dev: ProfileDevice): ProfileDeviceKind {
    if (dev.device_kind) return dev.device_kind;
    if (dev.vendor_id === AZERON_VID) return "azeron";
    return "gamepad";
  }

  function getDeviceIcon(dev: ProfileDevice): string {
    switch (inferDeviceKind(dev)) {
      case "azeron":
        return azeronIcon;
      case "mouse":
        return mouseGamingIcon;
      case "gamepad":
      case "keyboard":
      default:
        return padXboxIcon;
    }
  }

  function render() {
    chipsContainer.innerHTML = "";
    for (const dev of devices) {
      const chip = document.createElement("div");
      const isSelected = isSame(dev, selected);
      const isActive = dev.active !== false;
      const classes = ["device-chip"];
      if (isSelected) classes.push("selected");
      if (!isActive) classes.push("inactive");
      chip.className = classes.join(" ");
      const vid = toHex(dev.vendor_id);
      const pid = toHex(dev.product_id);
      const status = isActive ? "Connected" : "Offline";
      const icon = getDeviceIcon(dev);
      chip.innerHTML = `
        <span class="device-chip-icon" style="mask-image:url(${icon});-webkit-mask-image:url(${icon})"></span>
        <span class="device-chip-status-dot"></span>
        <div class="device-chip-tooltip">
          <span class="device-chip-name">${dev.name || "Unknown Device"}</span>
          <span class="device-chip-id">${dev.id ? `${dev.id} · ` : ""}VID:PID: ${vid}:${pid}</span>
          <span class="device-chip-status">${status}</span>
        </div>`;
      chip.addEventListener("click", () => options.onSelectDevice(dev));
      chip.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        options.onOpenDeviceMenu(dev, {
          x: event.clientX,
          y: event.clientY,
        });
      });
      chipsContainer.appendChild(chip);
    }
  }

  addBtn.addEventListener("click", () => options.onAddDevice());

  function updateSelection() {
    const chips = chipsContainer.querySelectorAll<HTMLElement>(".device-chip");
    chips.forEach((chip, i) => {
      const dev = devices[i];
      if (!dev) return;
      chip.classList.toggle("selected", isSame(dev, selected));
    });
  }

  return {
    setDevices(devs: ProfileDevice[]) {
      devices = devs;
      render();
    },
    setSelected(dev: ProfileDevice | null) {
      selected = dev;
      updateSelection();
    },
    setActive(deviceId: string, active: boolean) {
      const dev = devices.find(
        (d) => identity(d) === deviceId
      );
      if (dev) {
        dev.active = active;
        render();
      }
    },
  };
}
