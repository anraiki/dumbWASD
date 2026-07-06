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
