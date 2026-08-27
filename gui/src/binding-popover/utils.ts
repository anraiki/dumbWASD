export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

/// A label + toggle switch on one row, with optional inline controls
/// (a number input, say) sitting between them.
///
/// The switch is a real checkbox so it stays keyboard- and
/// screen-reader-operable; the track is only its visual skin. The label uses
/// `for` rather than wrapping, so inline controls next to it stay clickable
/// without toggling the switch.
export function renderSwitchRow(params: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  inputClass: string;
  aside?: string;
}): string {
  const disabled = params.disabled ? "disabled" : "";

  return `<div class="binding-popover-switch-row">
      <label class="binding-popover-switch-label" for="${params.id}">${escapeHtml(params.label)}</label>
      <div class="binding-popover-switch-controls">
        ${params.aside ?? ""}
        <span class="binding-popover-switch">
          <input
            type="checkbox"
            id="${params.id}"
            class="${params.inputClass}"
            ${params.checked ? "checked" : ""}
            ${disabled}
          />
          <span class="binding-popover-switch-track" aria-hidden="true"></span>
        </span>
      </div>
    </div>`;
}

export function getNoneBadgeMarkup() {
  return `
      <span class="binding-popover-none">
        <svg class="binding-popover-none-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.5 2.5" />
        </svg>
        <span>None</span>
      </span>
    `;
}

export function getDisplayMarkup(label: string) {
  if (label === "None") {
    return getNoneBadgeMarkup();
  }

  return escapeHtml(label);
}
