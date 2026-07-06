import { KEYBOARD_ROWS, type SurfaceKey } from "../macro-input-constants";
import type { MacroActionItem, MacroTimelineHandle } from "../macro-timeline";
import { escapeHtml } from "./utils";

export function renderSurfacePreview(container: HTMLElement, macroTimeline: MacroTimelineHandle) {
  const timeline = macroTimeline.getTimeline();
  const activePlaybackItemId = macroTimeline.getActivePlaybackItemId();

  const usedCodes = new Set(
    timeline.filter((item): item is MacroActionItem => item.kind === "action").map((item) => item.code)
  );
  const activeAction = timeline.find(
    (item): item is MacroActionItem => item.kind === "action" && item.id === activePlaybackItemId
  );

  container.innerHTML = `
      <div class="macro-keyboard-grid">
        ${KEYBOARD_ROWS.map((row) => `
          <div class="macro-keyboard-row">
            ${row.map((key) => renderKeyboardKey(key, usedCodes, activeAction?.code ?? null)).join("")}
          </div>
        `).join("")}
      </div>
    `;
}

function renderKeyboardKey(key: SurfaceKey, usedCodes: Set<number>, activeCode: number | null) {
  const active = key.code !== undefined && key.code === activeCode;
  const used = key.code !== undefined && usedCodes.has(key.code);
  const widthClass = key.width ? `macro-key-${key.width}` : "";
  const stateClass = active ? "active" : used ? "used" : "";
  const codeAttr = key.code !== undefined ? `data-key-code="${key.code}"` : "disabled";

  return `<button type="button" class="macro-key ${widthClass} ${stateClass}" ${codeAttr}>${escapeHtml(key.label)}</button>`;
}

export function renderPlaybackLog(container: HTMLElement, playbackLog: string[]) {
  if (playbackLog.length === 0) {
    container.innerHTML = `<div class="macro-empty">No playback activity yet.</div>`;
    return;
  }

  container.innerHTML = playbackLog
    .map((entry) => `<div class="macro-log-entry">${escapeHtml(entry)}</div>`)
    .join("");
}
