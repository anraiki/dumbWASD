import type { ProfileDevice } from "./device-bar";

interface DeleteDeviceDialogOptions {
  device: ProfileDevice;
  onConfirm: (device: ProfileDevice) => Promise<void> | void;
  onClose?: () => void;
}

export function showDeleteDeviceDialog(options: DeleteDeviceDialogOptions): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal modal-danger";

  const header = document.createElement("div");
  header.className = "modal-header";
  header.innerHTML = `
    <span>Delete Device</span>
    <button type="button" class="btn btn-icon modal-close" aria-label="Close dialog">&times;</button>
  `;

  const body = document.createElement("div");
  body.className = "modal-body modal-danger-body";
  body.innerHTML = `
    <div class="device-delete-copy">
      <p class="device-delete-title">Remove ${escapeHtml(options.device.name || "this device")} from this profile?</p>
      <p class="device-delete-text">
        This only removes the device from the current profile. You can add it back later with the + button.
      </p>
    </div>
    <label class="device-delete-slider-block" for="device-delete-slider">
      <span class="device-delete-slider-label">Slide to 100% to enable deletion</span>
      <div class="device-delete-slider-status">
        <span>Hold to confirm</span>
        <span class="device-delete-slider-value">0%</span>
      </div>
    </label>
    <input
      id="device-delete-slider"
      class="device-delete-slider"
      type="range"
      min="0"
      max="100"
      step="1"
      value="0"
    />
    <p class="device-delete-error" hidden></p>
    <div class="device-delete-actions">
      <button type="button" class="btn btn-action device-delete-cancel">Cancel</button>
      <button type="button" class="btn device-delete-confirm" disabled>Delete Device</button>
    </div>
  `;

  const closeButton = header.querySelector<HTMLButtonElement>(".modal-close")!;
  const slider = body.querySelector<HTMLInputElement>(".device-delete-slider")!;
  const sliderValue = body.querySelector<HTMLElement>(".device-delete-slider-value")!;
  const errorText = body.querySelector<HTMLElement>(".device-delete-error")!;
  const cancelButton = body.querySelector<HTMLButtonElement>(".device-delete-cancel")!;
  const confirmButton = body.querySelector<HTMLButtonElement>(".device-delete-confirm")!;
  let submitting = false;
  let backdropPressStarted = false;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
    }
  };

  function cleanup() {
    window.removeEventListener("keydown", handleKeyDown, true);
  }

  function syncSlider() {
    const value = Number(slider.value);
    sliderValue.textContent = `${value}%`;
    slider.style.setProperty("--slider-progress", `${value}%`);
    confirmButton.disabled = value < 100 || submitting;
  }

  function close() {
    if (submitting) return;
    cleanup();
    options.onClose?.();
    overlay.remove();
  }

  async function confirmDelete() {
    if (submitting || Number(slider.value) < 100) return;
    submitting = true;
    errorText.hidden = true;
    slider.disabled = true;
    cancelButton.disabled = true;
    closeButton.disabled = true;
    syncSlider();

    try {
      await options.onConfirm(options.device);
      cleanup();
      overlay.remove();
    } catch (error) {
      submitting = false;
      slider.disabled = false;
      cancelButton.disabled = false;
      closeButton.disabled = false;
      errorText.textContent = error instanceof Error ? error.message : String(error);
      errorText.hidden = false;
      syncSlider();
    }
  }

  slider.addEventListener("input", syncSlider);
  slider.addEventListener("change", syncSlider);
  closeButton.addEventListener("click", close);
  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => {
    void confirmDelete();
  });
  overlay.addEventListener("pointerdown", (event) => {
    backdropPressStarted = event.target === overlay;
  });
  overlay.addEventListener("pointercancel", () => {
    backdropPressStarted = false;
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && backdropPressStarted) {
      close();
    }
    backdropPressStarted = false;
  });
  window.addEventListener("keydown", handleKeyDown, true);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  syncSlider();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
