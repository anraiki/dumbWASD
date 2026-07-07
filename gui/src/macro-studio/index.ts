import { normalizeInput } from "../macro-input-constants";
import { createMacroTimeline, type MacroTimelineHandle } from "../macro-timeline";
import { initTimelineFlow, renderFlowTimeline, type MacroTimelineFlowApi } from "./flow";
import { loadMacroLibrary } from "./library";
import { renderPlaybackLog, renderSurfacePreview } from "./render";
import { generateScript } from "./script";
import { createInitialState } from "./state";
import { buildTemplate, collectRefs, type MacroStudioRefs } from "./template";
import { escapeHtml } from "./utils";
import { wireEventListeners } from "./wiring";

export interface MacroStudio {
  mount(container: HTMLElement): void;
  unmount(): void;
  handleInputEvent(code: number, pressed: boolean): void;
  setMonitoringActive(active: boolean): void;
}

export function createMacroStudio(): MacroStudio {
  let host: HTMLElement | null = null;
  let refs: MacroStudioRefs | null = null;
  let timelineFlow: MacroTimelineFlowApi | null = null;
  let macroTimeline: MacroTimelineHandle | null = null;
  const state = createInitialState();

  function mount(container: HTMLElement) {
    host = container;
    host.innerHTML = buildTemplate(state);
    refs = collectRefs(host);

    macroTimeline = createMacroTimeline({
      getIsMonitoringActive: () => state.monitoringActive,
      normalizeInput,
      onRecorded: () => {
        state.codeDirty = false;
        state.codeStatus = "Generated from macro builder";
      },
      onUpdate: refresh,
    });

    state.codeDraft = generateScript(macroTimeline.getTimeline(), state);
    state.codeStatus = "Generated from macro builder";
    timelineFlow = initTimelineFlow(refs.flowHost, { state, macroTimeline, refresh });

    wireEventListeners({ host, refs, state, macroTimeline, refresh, appendKeyPress });

    void loadMacroLibrary({ state, macroTimeline, refresh });
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
    state.monitoringActive = active;
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

    const generatedScript = generateScript(timeline, state);

    const signature = `${state.currentMacroId ?? ""}|${state.savedMacros.map((entry) => `${entry.id}:${entry.name}`).join(",")}`;
    if (signature !== state.librarySignature) {
      state.librarySignature = signature;
      refs.librarySelect.innerHTML = [
        `<option value="">New macro…</option>`,
        ...state.savedMacros.map(
          (entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`
        ),
      ].join("");
    }
    refs.librarySelect.value = state.currentMacroId ?? "";
    refs.saveMacroBtn.disabled = timeline.length === 0;
    refs.deleteMacroBtn.disabled = !state.savedMacros.some((entry) => entry.id === state.currentMacroId);

    refs.leadInInput.value = String(state.leadInMs);
    refs.keyDelayInput.value = String(state.keyDelayMs);
    refs.iterationsInput.value = String(state.iterations);
    refs.pauseInput.value = String(state.pauseBetweenIterationsMs);

    refs.holdModeBtn.classList.toggle("active", state.triggerMode === "hold");
    refs.executeModeBtn.classList.toggle("active", state.triggerMode === "execute");

    refs.recordBtn.classList.toggle("recording", recording);
    refs.recordBtn.disabled = playbackRunning || (!state.monitoringActive && !recording);
    refs.recordBtn.title = recording ? "Stop recording" : "Start recording";
    refs.recordBtn.setAttribute("aria-label", recording ? "Stop recording" : "Start recording");

    refs.cleanBtn.disabled = timeline.length === 0 || playbackRunning;

    refs.insertWaitBtn.disabled = playbackRunning;
    refs.insertRumbleBtn.disabled = playbackRunning;

    refs.clearBtn.disabled = timeline.length === 0 && playbackLog.length === 0;

    refs.playBtn.classList.toggle("active", playbackRunning);
    refs.playBtn.disabled = playbackRunning || recording || timeline.length === 0;

    refs.stopBtn.disabled = !playbackRunning && !recording;

    refs.scriptTestBtn.disabled = state.scriptTestRunning || recording || playbackRunning;
    refs.scriptTestBtn.textContent = state.scriptTestRunning ? "Running 10s Test..." : "Run 10s Test";

    const actionCount = timeline.filter((item) => item.kind === "action").length;
    const keypressCount = timeline.filter(
      (item) => item.kind === "action" && item.direction === "down"
    ).length;
    refs.timelineStats.textContent = actionCount === 0
      ? ""
      : `${keypressCount} keypress${keypressCount === 1 ? "" : "es"} · ${actionCount} event${actionCount === 1 ? "" : "s"}`;

    refs.visualTabBtn.classList.toggle("active", state.activeTab === "visual");
    refs.codeTabBtn.classList.toggle("active", state.activeTab === "code");
    refs.logBtn.classList.toggle("active", state.playbackLogOpen);
    refs.visualPanel.classList.toggle("active", state.activeTab === "visual");
    refs.codePanel.classList.toggle("active", state.activeTab === "code");
    refs.playbackModal.classList.toggle("active", state.playbackLogOpen);

    if (!state.codeDirty) {
      state.codeDraft = generatedScript;
    }
    refs.codeEditor.value = state.codeDraft;
    refs.codeStatus.textContent = state.codeStatus;

    renderFlowTimeline(timelineFlow, macroTimeline, state);
    renderSurfacePreview(refs.surfacePreview, macroTimeline);
    renderPlaybackLog(refs.playbackLog, playbackLog);
  }

  function appendKeyPress(code: number) {
    if (!macroTimeline || macroTimeline.isPlaybackRunning()) return;

    const input = normalizeInput(code);
    macroTimeline.setTimeline([
      ...macroTimeline.getTimeline(),
      { id: macroTimeline.nextId(), kind: "action", code, input, direction: "down" },
      { id: macroTimeline.nextId(), kind: "action", code, input, direction: "up" },
    ]);
    state.codeDirty = false;
    state.codeStatus = "Generated from macro builder";
    macroTimeline.appendLog(`Appended ${input} press.`);
    refresh();
  }

  return {
    mount,
    unmount,
    handleInputEvent,
    setMonitoringActive,
  };
}
