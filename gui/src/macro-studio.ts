import { invoke } from "@tauri-apps/api/core";
import {
  createMacroTimelineFlow,
  type MacroFlowItem,
} from "./macro-flow-prototype";
import {
  createMacroTimeline,
  type MacroTimelineHandle,
  type MacroActionItem,
  type MacroTimelineItem,
} from "./macro-timeline";
import {
  normalizeInput,
  KEYBOARD_ROWS,
  PAD_BUTTONS,
  MOUSE_BUTTONS,
  type SurfaceKey,
} from "./macro-input-constants";

type TriggerMode = "hold" | "execute";
type ActiveTab = "visual" | "code";

interface TimelineRenderChip {
  key: string;
  itemId?: number;
  kind: "action" | "wait" | "meta";
  label: string;
  secondary?: string;
  width: number;
  draggable: boolean;
  waitValue?: number;
}

interface MacroStudioRefs {
  leadInInput: HTMLInputElement;
  iterationsInput: HTMLInputElement;
  pauseInput: HTMLInputElement;
  holdModeBtn: HTMLButtonElement;
  executeModeBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  removePausesBtn: HTMLButtonElement;
  scriptTestBtn: HTMLButtonElement;
  visualTabBtn: HTMLButtonElement;
  codeTabBtn: HTMLButtonElement;
  logBtn: HTMLButtonElement;
  visualPanel: HTMLElement;
  codePanel: HTMLElement;
  flowHost: HTMLElement;
  codeEditor: HTMLTextAreaElement;
  copyCodeBtn: HTMLButtonElement;
  resetCodeBtn: HTMLButtonElement;
  codeStatus: HTMLElement;
  playbackModal: HTMLElement;
  playbackModalCloseBtn: HTMLButtonElement;
  playbackLog: HTMLElement;
  surfacePreview: HTMLElement;
}

export interface MacroStudio {
  mount(container: HTMLElement): void;
  unmount(): void;
  handleInputEvent(code: number, pressed: boolean): void;
  setMonitoringActive(active: boolean): void;
}

interface MacroTimelineFlowApi {
  setState(state: { items: MacroFlowItem[]; selectedItemIds: number[] }): void;
  destroy(): void;
}

export function createMacroStudio(): MacroStudio {
  let host: HTMLElement | null = null;
  let refs: MacroStudioRefs | null = null;
  let leadInMs = 0;
  let iterations = 1;
  let pauseBetweenIterationsMs = 0;
  let triggerMode: TriggerMode = "execute";
  let activeTab: ActiveTab = "visual";
  let monitoringActive = false;
  let codeDraft = "";
  let codeDirty = false;
  let codeStatus = "Generated from macro builder";
  let selectedItemIds = new Set<number>();
  let playbackLogOpen = false;
  let scriptTestRunning = false;
  let timelineFlow: MacroTimelineFlowApi | null = null;

  let macroTimeline: MacroTimelineHandle | null = null;

  function mount(container: HTMLElement) {
    host = container;
    host.innerHTML = `
      <div class="macro-sequencer">
        <section class="macro-command-bar macro-card">
          <div class="macro-mode-switch">
            <button id="macro-mode-hold" class="macro-mode-btn" type="button">Hold until release</button>
            <button id="macro-mode-execute" class="macro-mode-btn active" type="button">Execute at once</button>
          </div>

          <label class="macro-field macro-field-compact">
            <span>Lead-in</span>
            <input id="macro-lead-in" type="number" min="0" step="10" value="${leadInMs}" />
          </label>

          <label class="macro-field macro-field-compact">
            <span>Iterations</span>
            <input id="macro-iterations" type="number" min="1" step="1" value="${iterations}" />
          </label>

          <label class="macro-field macro-field-compact">
            <span>Pause between loops</span>
            <input id="macro-pause" type="number" min="0" step="10" value="${pauseBetweenIterationsMs}" />
          </label>

          <div class="macro-command-actions">
            <button id="macro-script-test-btn" class="btn btn-action macro-script-test-btn" type="button">
              Run 10s A Test
            </button>
            <button
              id="macro-record-btn"
              class="macro-icon-btn macro-record-btn"
              type="button"
              title="Start recording"
              aria-label="Start recording"
            >
              <span class="macro-record-glyph" aria-hidden="true"></span>
              <span class="sr-only">Start recording</span>
            </button>
            <button
              id="macro-play-btn"
              class="macro-icon-btn"
              type="button"
              title="Test run"
              aria-label="Test run"
            >
              ${toolbarIcon("play")}
              <span class="sr-only">Test run</span>
            </button>
            <button
              id="macro-remove-pauses-btn"
              class="macro-icon-btn"
              type="button"
              title="Remove all pauses"
              aria-label="Remove all pauses"
            >
              ${toolbarIcon("remove-pauses")}
              <span class="sr-only">Remove all pauses</span>
            </button>
            <button
              id="macro-clear-btn"
              class="macro-icon-btn"
              type="button"
              title="Clear macro"
              aria-label="Clear macro"
            >
              ${toolbarIcon("clear")}
              <span class="sr-only">Clear macro</span>
            </button>
          </div>
        </section>

        <div class="macro-tab-strip">
          <button id="macro-tab-visual" class="macro-tab-btn active" type="button">Visual Builder</button>
          <button id="macro-tab-code" class="macro-tab-btn" type="button">Code View</button>
          <button id="macro-tab-log" class="macro-tab-btn macro-tab-utility" type="button">Playback Log</button>
        </div>

        <div id="macro-visual-panel" class="macro-tab-panel active">
          <section class="macro-timeline-card macro-card">
            <div id="macro-timeline-flow" class="macro-timeline-flow"></div>
          </section>

          <div class="macro-stage-grid">
            <div id="macro-surface-preview" class="macro-surface-preview"></div>
          </div>
        </div>

        <div id="macro-code-panel" class="macro-tab-panel">
          <section class="macro-card macro-code-card">
            <div class="macro-section-header">
              <div>
                <h3>Shareable Code View</h3>
                <p>The code mirrors the builder timeline: press down, wait, press up.</p>
              </div>
              <div class="macro-code-actions">
                <button id="macro-reset-code" class="btn btn-action" type="button">Reset from Builder</button>
                <button id="macro-copy-code" class="btn btn-action" type="button">Copy Code</button>
              </div>
            </div>
            <textarea id="macro-code-editor" class="macro-code-editor" spellcheck="false"></textarea>
            <div class="macro-code-footer">
              <span id="macro-code-status">Generated from macro builder</span>
            </div>
          </section>
        </div>

        <div id="macro-playback-modal" class="macro-playback-modal">
          <div class="macro-playback-dialog macro-card">
            <div class="macro-section-header">
              <div>
                <h3>Playback Log</h3>
                <p>Safe UI test run. No real input is fired yet.</p>
              </div>
              <button id="macro-playback-close" class="macro-playback-close" type="button">Close</button>
            </div>
            <div id="macro-playback-log" class="macro-playback-log"></div>
          </div>
        </div>
      </div>
    `;

    refs = {
      leadInInput: host.querySelector<HTMLInputElement>("#macro-lead-in")!,
      iterationsInput: host.querySelector<HTMLInputElement>("#macro-iterations")!,
      pauseInput: host.querySelector<HTMLInputElement>("#macro-pause")!,
      holdModeBtn: host.querySelector<HTMLButtonElement>("#macro-mode-hold")!,
      executeModeBtn: host.querySelector<HTMLButtonElement>("#macro-mode-execute")!,
      recordBtn: host.querySelector<HTMLButtonElement>("#macro-record-btn")!,
      clearBtn: host.querySelector<HTMLButtonElement>("#macro-clear-btn")!,
      playBtn: host.querySelector<HTMLButtonElement>("#macro-play-btn")!,
      removePausesBtn: host.querySelector<HTMLButtonElement>("#macro-remove-pauses-btn")!,
      scriptTestBtn: host.querySelector<HTMLButtonElement>("#macro-script-test-btn")!,
      visualTabBtn: host.querySelector<HTMLButtonElement>("#macro-tab-visual")!,
      codeTabBtn: host.querySelector<HTMLButtonElement>("#macro-tab-code")!,
      logBtn: host.querySelector<HTMLButtonElement>("#macro-tab-log")!,
      visualPanel: host.querySelector<HTMLElement>("#macro-visual-panel")!,
      codePanel: host.querySelector<HTMLElement>("#macro-code-panel")!,
      flowHost: host.querySelector<HTMLElement>("#macro-timeline-flow")!,
      codeEditor: host.querySelector<HTMLTextAreaElement>("#macro-code-editor")!,
      copyCodeBtn: host.querySelector<HTMLButtonElement>("#macro-copy-code")!,
      resetCodeBtn: host.querySelector<HTMLButtonElement>("#macro-reset-code")!,
      codeStatus: host.querySelector<HTMLElement>("#macro-code-status")!,
      playbackModal: host.querySelector<HTMLElement>("#macro-playback-modal")!,
      playbackModalCloseBtn: host.querySelector<HTMLButtonElement>("#macro-playback-close")!,
      playbackLog: host.querySelector<HTMLElement>("#macro-playback-log")!,
      surfacePreview: host.querySelector<HTMLElement>("#macro-surface-preview")!,
    };

    macroTimeline = createMacroTimeline({
      getIsMonitoringActive: () => monitoringActive,
      normalizeInput,
      onRecorded: () => {
        codeDirty = false;
        codeStatus = "Generated from macro builder";
      },
      onUpdate: refresh,
    });

    codeDraft = generateScript();
    codeStatus = "Generated from macro builder";
    timelineFlow = createMacroTimelineFlow(refs.flowHost, {
      onWaitChange: (itemId, value) => {
        const timeline = macroTimeline!.getTimeline();
        const item = timeline.find((entry) => entry.id === itemId);
        if (!item || item.kind !== "wait") return;
        item.durationMs = Math.max(0, Math.round(value));
        codeDirty = false;
        codeStatus = "Generated from macro builder";
        refresh();
      },
      onRemove: (itemId) => {
        macroTimeline!.setTimeline(macroTimeline!.getTimeline().filter((item) => item.id !== itemId));
        selectedItemIds.delete(itemId);
        codeDirty = false;
        codeStatus = "Generated from macro builder";
        refresh();
      },
      onOrderChange: (orderedItemIds) => {
        const timeline = macroTimeline!.getTimeline();
        if (orderedItemIds.length !== timeline.length) return;

        const itemById = new Map(timeline.map((item) => [item.id, item]));
        const nextTimeline = orderedItemIds
          .map((itemId) => itemById.get(itemId))
          .filter((item): item is MacroTimelineItem => item !== undefined);

        if (nextTimeline.length !== timeline.length) return;
        if (nextTimeline.every((item, index) => item.id === timeline[index]?.id)) return;

        macroTimeline!.setTimeline(nextTimeline);
        codeDirty = false;
        codeStatus = "Generated from macro builder";
        refresh();
      },
      onSelectionChange: (nextSelectedItemIds) => {
        selectedItemIds = new Set(
          nextSelectedItemIds.filter((itemId) => macroTimeline!.getTimeline().some((item) => item.id === itemId))
        );
        refresh();
      },
    });

    refs.leadInInput.addEventListener("input", () => {
      leadInMs = clampNumber(refs?.leadInInput.value, 0, 0);
      refresh();
    });

    refs.iterationsInput.addEventListener("input", () => {
      iterations = clampNumber(refs?.iterationsInput.value, 1, 1);
      refresh();
    });

    refs.pauseInput.addEventListener("input", () => {
      pauseBetweenIterationsMs = clampNumber(refs?.pauseInput.value, 0, 0);
      refresh();
    });

    refs.holdModeBtn.addEventListener("click", () => {
      triggerMode = "hold";
      refresh();
    });

    refs.executeModeBtn.addEventListener("click", () => {
      triggerMode = "execute";
      refresh();
    });

    refs.recordBtn.addEventListener("click", () => {
      if (macroTimeline!.isRecording()) {
        macroTimeline!.stopRecording("Recording stopped.");
        return;
      }
      macroTimeline!.startRecording();
    });

    refs.clearBtn.addEventListener("click", () => {
      if (macroTimeline!.getTimeline().length === 0 && macroTimeline!.getPlaybackLog().length === 0) return;
      if (!window.confirm("Clear the entire macro timeline and playback log?")) return;

      macroTimeline!.stopPlayback("Timeline cleared.");
      macroTimeline!.setTimeline([]);
      selectedItemIds = new Set();
      codeDirty = false;
      codeStatus = "Generated from macro builder";
      refresh();
    });

    refs.playBtn.addEventListener("click", () => {
      if (macroTimeline!.isPlaybackRunning()) {
        macroTimeline!.stopPlayback("Test playback stopped.");
        return;
      }
      macroTimeline!.startPlayback({ leadInMs, iterations, pauseBetweenIterationsMs });
    });

    refs.removePausesBtn.addEventListener("click", () => {
      if (macroTimeline!.isRecording() || macroTimeline!.isPlaybackRunning()) return;

      const timeline = macroTimeline!.getTimeline();
      const waitCount = timeline.filter((item) => item.kind === "wait").length;
      if (waitCount === 0) return;

      const nextTimeline = timeline.filter((item) => item.kind !== "wait");
      macroTimeline!.setTimeline(nextTimeline);
      selectedItemIds = new Set(
        [...selectedItemIds].filter((itemId) => nextTimeline.some((item) => item.id === itemId))
      );
      codeDirty = false;
      codeStatus = "Generated from macro builder";
      macroTimeline!.appendLog(`Removed ${waitCount} pause${waitCount === 1 ? "" : "s"}.`);
      refresh();
    });

    refs.scriptTestBtn.addEventListener("click", async () => {
      if (scriptTestRunning || macroTimeline!.isRecording() || macroTimeline!.isPlaybackRunning()) return;

      scriptTestRunning = true;
      macroTimeline!.appendLog("Running hardcoded 10s A hold test.");
      refresh();

      try {
        await invoke("run_test_macro");
        macroTimeline!.appendLog("Hardcoded 10s A hold test completed.");
        window.alert("done");
      } catch (error) {
        macroTimeline!.appendLog(`Hardcoded 10s A hold test failed: ${String(error)}`);
        window.alert(`Script test failed: ${String(error)}`);
      } finally {
        scriptTestRunning = false;
        refresh();
      }
    });

    refs.visualTabBtn.addEventListener("click", () => {
      activeTab = "visual";
      refresh();
    });

    refs.codeTabBtn.addEventListener("click", () => {
      activeTab = "code";
      refresh();
    });

    refs.logBtn.addEventListener("click", () => {
      playbackLogOpen = true;
      refresh();
    });

    refs.playbackModalCloseBtn.addEventListener("click", () => {
      playbackLogOpen = false;
      refresh();
    });

    refs.playbackModal.addEventListener("click", (event) => {
      if (event.target === refs?.playbackModal) {
        playbackLogOpen = false;
        refresh();
      }
    });

    refs.codeEditor.addEventListener("input", () => {
      codeDraft = refs?.codeEditor.value ?? "";
      codeDirty = true;
      codeStatus = "Manual edits ready to share";
      refresh();
    });

    refs.resetCodeBtn.addEventListener("click", () => {
      codeDirty = false;
      codeDraft = generateScript();
      codeStatus = "Code reset from macro builder";
      refresh();
    });

    refs.copyCodeBtn.addEventListener("click", async () => {
      try {
        await copyToClipboard(refs?.codeEditor.value ?? codeDraft);
        codeStatus = "Code copied to clipboard";
      } catch {
        codeStatus = "Clipboard copy failed";
      }
      refresh();
    });

    refresh();
  }

  function unmount() {
    macroTimeline?.stopPlayback();
    timelineFlow?.destroy();
    timelineFlow = null;
    if (host) host.innerHTML = "";
    host = null;
    refs = null;
  }

  function setMonitoringActive(active: boolean) {
    monitoringActive = active;
    if (!active && macroTimeline?.isRecording()) {
      macroTimeline.stopRecording("Recording stopped because the device feed ended.");
      return;
    }
    refresh();
  }

  function handleInputEvent(code: number, pressed: boolean) {
    macroTimeline?.handleInputEvent(code, pressed);
  }

  function refresh() {
    if (!refs || !macroTimeline) return;

    const timeline = macroTimeline.getTimeline();
    const recording = macroTimeline.isRecording();
    const playbackRunning = macroTimeline.isPlaybackRunning();
    const playbackLog = macroTimeline.getPlaybackLog();

    const generatedScript = generateScript();

    refs.leadInInput.value = String(leadInMs);
    refs.iterationsInput.value = String(iterations);
    refs.pauseInput.value = String(pauseBetweenIterationsMs);

    refs.holdModeBtn.classList.toggle("active", triggerMode === "hold");
    refs.executeModeBtn.classList.toggle("active", triggerMode === "execute");

    refs.recordBtn.classList.toggle("recording", recording);
    refs.recordBtn.disabled = playbackRunning || (!monitoringActive && !recording);
    refs.recordBtn.title = recording ? "Stop recording" : "Start recording";
    refs.recordBtn.setAttribute("aria-label", recording ? "Stop recording" : "Start recording");

    refs.clearBtn.disabled = timeline.length === 0 && playbackLog.length === 0;
    refs.clearBtn.title = "Clear macro";
    refs.clearBtn.setAttribute("aria-label", "Clear macro");

    refs.playBtn.innerHTML = `
      ${toolbarIcon(playbackRunning ? "stop" : "play")}
      <span class="sr-only">${playbackRunning ? "Stop test run" : "Test run"}</span>
    `;
    refs.playBtn.classList.toggle("active", playbackRunning);
    refs.playBtn.disabled = (!playbackRunning && timeline.length === 0) || recording;
    refs.playBtn.title = playbackRunning ? "Stop test run" : "Test run";
    refs.playBtn.setAttribute("aria-label", playbackRunning ? "Stop test run" : "Test run");

    refs.removePausesBtn.disabled = playbackRunning || recording || !timeline.some((item) => item.kind === "wait");
    refs.removePausesBtn.title = "Remove all pauses";
    refs.removePausesBtn.setAttribute("aria-label", "Remove all pauses");

    refs.scriptTestBtn.disabled = scriptTestRunning || recording || playbackRunning;
    refs.scriptTestBtn.textContent = scriptTestRunning ? "Running 10s A Test..." : "Run 10s A Test";

    refs.visualTabBtn.classList.toggle("active", activeTab === "visual");
    refs.codeTabBtn.classList.toggle("active", activeTab === "code");
    refs.logBtn.classList.toggle("active", playbackLogOpen);
    refs.visualPanel.classList.toggle("active", activeTab === "visual");
    refs.codePanel.classList.toggle("active", activeTab === "code");
    refs.playbackModal.classList.toggle("active", playbackLogOpen);

    if (!codeDirty) {
      codeDraft = generatedScript;
    }
    refs.codeEditor.value = codeDraft;
    refs.codeStatus.textContent = codeStatus;

    renderFlowTimeline();
    renderSurfacePreview();
    renderPlaybackLog();
  }

  function renderFlowTimeline() {
    if (!timelineFlow || !macroTimeline) return;
    const timeline = macroTimeline.getTimeline();
    const activePlaybackItemId = macroTimeline.getActivePlaybackItemId();
    const playbackRunning = macroTimeline.isPlaybackRunning();
    const chips = buildTimelineRenderChips(timeline, playbackRunning);
    const items: MacroFlowItem[] = chips.map((chip) => ({
      key: chip.key,
      itemId: chip.itemId,
      kind: chip.kind,
      label: chip.label,
      secondary: chip.secondary,
      waitValue: chip.waitValue,
      width: chip.width,
      active: chip.itemId !== undefined && chip.itemId === activePlaybackItemId,
      draggable: chip.draggable,
    }));
    timelineFlow.setState({ items, selectedItemIds: [...selectedItemIds] });
  }

  function buildTimelineRenderChips(
    timeline: MacroTimelineItem[],
    playbackRunning: boolean,
  ): TimelineRenderChip[] {
    const chips: TimelineRenderChip[] = [];

    if (leadInMs > 0) {
      chips.push({
        key: "lead-in",
        kind: "meta",
        label: "Lead-in",
        secondary: `${leadInMs} ms`,
        width: 132,
        draggable: false,
      });
    }

    for (const item of timeline) {
      if (item.kind === "wait") {
        chips.push({
          key: `wait-${item.id}`,
          itemId: item.id,
          kind: "wait",
          label: "Wait",
          width: 128,
          draggable: !playbackRunning,
          waitValue: item.durationMs,
        });
      } else {
        chips.push({
          key: `action-${item.id}`,
          itemId: item.id,
          kind: "action",
          label: item.input,
          secondary: item.direction === "down" ? "Down" : "Up",
          width: 96,
          draggable: !playbackRunning,
        });
      }
    }

    if (iterations > 1) {
      chips.push({
        key: "loop",
        kind: "meta",
        label: "Loop",
        secondary: `${iterations}x`,
        width: 110,
        draggable: false,
      });
    }

    return chips;
  }

  function renderSurfacePreview() {
    if (!refs || !macroTimeline) return;

    const timeline = macroTimeline.getTimeline();
    const activePlaybackItemId = macroTimeline.getActivePlaybackItemId();

    const usedCodes = new Set(
      timeline.filter((item): item is MacroActionItem => item.kind === "action").map((item) => item.code)
    );
    const activeAction = timeline.find(
      (item): item is MacroActionItem => item.kind === "action" && item.id === activePlaybackItemId
    );

    refs.surfacePreview.innerHTML = `
      <div class="macro-surface-layout">
        <aside class="macro-pad-panel">
          ${PAD_BUTTONS.map((group) => `
            <div class="macro-pad-row">
              ${group.map((button) => renderSurfaceButton(button.label, button.code, usedCodes, activeAction?.code ?? null)).join("")}
            </div>
          `).join("")}
        </aside>

        <div class="macro-keyboard-panel">
          <div class="macro-keyboard-grid">
            ${KEYBOARD_ROWS.map((row) => `
              <div class="macro-keyboard-row">
                ${row.map((key) => renderKeyboardKey(key, usedCodes, activeAction?.code ?? null)).join("")}
              </div>
            `).join("")}
          </div>
        </div>

        <aside class="macro-mouse-panel">
          <div class="macro-mouse-stack">
            ${MOUSE_BUTTONS.map((button) => renderSurfaceButton(button.label, button.code, usedCodes, activeAction?.code ?? null)).join("")}
          </div>
        </aside>
      </div>
    `;
  }

  function renderKeyboardKey(key: SurfaceKey, usedCodes: Set<number>, activeCode: number | null) {
    const active = key.code !== undefined && key.code === activeCode;
    const used = key.code !== undefined && usedCodes.has(key.code);
    const widthClass = key.width ? `macro-key-${key.width}` : "";
    const stateClass = active ? "active" : used ? "used" : "";

    return `<div class="macro-key ${widthClass} ${stateClass}">${escapeHtml(key.label)}</div>`;
  }

  function renderSurfaceButton(label: string, code: number | undefined, usedCodes: Set<number>, activeCode: number | null) {
    const active = code !== undefined && code === activeCode;
    const used = code !== undefined && usedCodes.has(code);
    const stateClass = active ? "active" : used ? "used" : "";
    return `<div class="macro-surface-btn ${stateClass}">${escapeHtml(label)}</div>`;
  }

  function renderPlaybackLog() {
    if (!refs || !macroTimeline) return;

    const playbackLog = macroTimeline.getPlaybackLog();
    if (playbackLog.length === 0) {
      refs.playbackLog.innerHTML = `<div class="macro-empty">No playback activity yet.</div>`;
      return;
    }

    refs.playbackLog.innerHTML = playbackLog
      .map((entry) => `<div class="macro-log-entry">${escapeHtml(entry)}</div>`)
      .join("");
  }

  function generateScript() {
    const timeline = macroTimeline?.getTimeline() ?? [];
    const lines = [
      "// Generated by dumbWASD Macro Sequencer",
      `// Trigger mode: ${triggerMode === "hold" ? "hold until release" : "execute at once"}`,
      "",
      `macro("exported-macro", () => {`,
    ];

    if (leadInMs > 0) {
      lines.push(`  wait(${leadInMs});`);
    }

    if (iterations > 1) {
      lines.push(`  repeat(${iterations}, ({ loop }) => {`);
    }

    const indent = iterations > 1 ? "    " : "  ";
    if (timeline.length === 0) {
      lines.push(`${indent}// No timeline items recorded yet`);
    } else {
      for (const item of timeline) {
        if (item.kind === "wait") {
          lines.push(`${indent}wait(${item.durationMs});`);
        } else if (item.direction === "down") {
          lines.push(`${indent}pressDown("${item.input}");`);
        } else {
          lines.push(`${indent}liftUp("${item.input}");`);
        }
      }
    }

    if (iterations > 1) {
      if (pauseBetweenIterationsMs > 0) {
        lines.push(`    if (loop < ${iterations - 1}) wait(${pauseBetweenIterationsMs});`);
      }
      lines.push("  });");
    }

    lines.push("});");
    return lines.join("\n");
  }

  return {
    mount,
    unmount,
    handleInputEvent,
    setMonitoringActive,
  };
}

function clampNumber(value: string | undefined, minimum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.round(parsed));
}

function toolbarIcon(kind: "clear" | "play" | "remove-pauses" | "stop") {
  switch (kind) {
    case "clear":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 17h9l6-8.5L13.5 4H8L3 11v6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="m10 9 4 4m0-4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `;
    case "remove-pauses":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 6v12M12 6v12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M17 7v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>
          <path d="m5 5 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `;
    case "stop":
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.8" fill="currentColor"/>
        </svg>
      `;
    case "play":
    default:
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor"/>
        </svg>
      `;
  }
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
