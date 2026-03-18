type UnsavedLayoutChoice = "save" | "discard" | "cancel";

interface UnsavedLayoutDialogOptions {
  layoutName: string;
}

export function showUnsavedLayoutDialog(
  options: UnsavedLayoutDialogOptions,
): Promise<UnsavedLayoutChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal layout-unsaved-modal";

    const header = document.createElement("div");
    header.className = "modal-header";
    header.innerHTML = `
      <span>Unsaved Layout Changes</span>
      <button type="button" class="btn btn-icon modal-close" aria-label="Close dialog">&times;</button>
    `;

    const body = document.createElement("div");
    body.className = "modal-body layout-unsaved-body";
    body.innerHTML = `
      <div class="layout-unsaved-copy">
        <p class="layout-unsaved-title">Save changes to ${escapeHtml(options.layoutName || "this layout")} before leaving edit mode?</p>
        <p class="layout-unsaved-text">
          Your button positions have changed. Save them now, discard them, or stay in edit mode.
        </p>
      </div>
      <div class="layout-unsaved-actions">
        <button type="button" class="btn btn-action layout-unsaved-cancel">Cancel</button>
        <button type="button" class="btn layout-unsaved-discard">Discard Changes</button>
        <button type="button" class="btn layout-unsaved-save">Save Changes</button>
      </div>
    `;

    const closeButton = header.querySelector<HTMLButtonElement>(".modal-close")!;
    const cancelButton = body.querySelector<HTMLButtonElement>(".layout-unsaved-cancel")!;
    const discardButton = body.querySelector<HTMLButtonElement>(".layout-unsaved-discard")!;
    const saveButton = body.querySelector<HTMLButtonElement>(".layout-unsaved-save")!;
    let backdropPressStarted = false;

    const cleanup = () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      overlay.remove();
    };

    const finish = (choice: UnsavedLayoutChoice) => {
      cleanup();
      resolve(choice);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        finish("cancel");
      }
    };

    closeButton.addEventListener("click", () => finish("cancel"));
    cancelButton.addEventListener("click", () => finish("cancel"));
    discardButton.addEventListener("click", () => finish("discard"));
    saveButton.addEventListener("click", () => finish("save"));

    overlay.addEventListener("pointerdown", (event) => {
      backdropPressStarted = event.target === overlay;
    });
    overlay.addEventListener("pointercancel", () => {
      backdropPressStarted = false;
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && backdropPressStarted) {
        finish("cancel");
      }
      backdropPressStarted = false;
    });

    window.addEventListener("keydown", handleKeyDown, true);
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    saveButton.focus();
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
