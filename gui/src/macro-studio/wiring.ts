import { invoke } from "@tauri-apps/api/core";
import type { MacroTimelineHandle } from "../macro-timeline";
import { applySavedMacro, deleteCurrentMacro, saveCurrentMacro } from "./library";
import type { MacroStudioState } from "./state";
import type { MacroStudioRefs } from "./template";
import { clampNumber } from "./utils";
import { wirePanelListeners } from "./wiring-panels";

export interface MacroStudioWiringCtx {
  host: HTMLElement;
  refs: MacroStudioRefs;
  state: MacroStudioState;
  macroTimeline: MacroTimelineHandle;
  refresh(): void;
  appendKeyPress(code: number): void;
}

export function wireEventListeners(ctx: MacroStudioWiringCtx) {
  const { host, refs, state, macroTimeline, refresh, appendKeyPress } = ctx;
  const libraryCtx = { state, macroTimeline, refresh };

  refs.leadInInput.addEventListener("input", () => {
    state.leadInMs = clampNumber(refs.leadInInput.value, 0, 0);
    refresh();
  });

  refs.keyDelayInput.addEventListener("input", () => {
    state.keyDelayMs = clampNumber(refs.keyDelayInput.value, 0, 10);
    refresh();
  });

  refs.iterationsInput.addEventListener("input", () => {
    state.iterations = clampNumber(refs.iterationsInput.value, 1, 1);
    refresh();
  });

  refs.pauseInput.addEventListener("input", () => {
    state.pauseBetweenIterationsMs = clampNumber(refs.pauseInput.value, 0, 0);
    refresh();
  });

  for (const stepperBtn of host.querySelectorAll<HTMLButtonElement>("[data-stepper-field]")) {
    stepperBtn.addEventListener("click", () => {
      const delta = Number(stepperBtn.dataset.stepperDelta);
      if (!Number.isFinite(delta)) return;

      switch (stepperBtn.dataset.stepperField) {
        case "lead":
          state.leadInMs = Math.max(0, state.leadInMs + delta);
          break;
        case "keydelay":
          state.keyDelayMs = Math.max(0, state.keyDelayMs + delta);
          break;
        case "iterations":
          state.iterations = Math.max(1, state.iterations + delta);
          break;
        case "pause":
          state.pauseBetweenIterationsMs = Math.max(0, state.pauseBetweenIterationsMs + delta);
          break;
      }
      refresh();
    });
  }

  refs.surfacePreview.addEventListener("click", (event) => {
    const keyBtn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-key-code]");
    if (!keyBtn || keyBtn.disabled) return;
    const code = Number(keyBtn.dataset.keyCode);
    if (!Number.isFinite(code)) return;
    appendKeyPress(code);
  });

  refs.librarySelect.addEventListener("change", () => {
    const selectedId = refs.librarySelect.value ?? "";
    const timeline = macroTimeline.getTimeline();

    if (!selectedId) {
      if (state.currentMacroId === null) return;
      if (timeline.length > 0 && !window.confirm("Start a new macro? The current timeline will be cleared.")) {
        refresh();
        return;
      }
      state.currentMacroId = null;
      macroTimeline.stopPlayback();
      macroTimeline.setTimeline([]);
      state.selectedItemIds = new Set();
      state.codeDirty = false;
      state.codeStatus = "Generated from macro builder";
      refresh();
      return;
    }

    const saved = state.savedMacros.find((entry) => entry.id === selectedId);
    if (!saved) {
      refresh();
      return;
    }
    if (
      timeline.length > 0 &&
      state.currentMacroId !== saved.id &&
      !window.confirm(`Load "${saved.name}"? The current timeline will be replaced.`)
    ) {
      refresh();
      return;
    }
    applySavedMacro(libraryCtx, saved);
  });

  refs.saveMacroBtn.addEventListener("click", () => {
    void saveCurrentMacro(libraryCtx);
  });

  refs.deleteMacroBtn.addEventListener("click", () => {
    void deleteCurrentMacro(libraryCtx);
  });

  refs.holdModeBtn.addEventListener("click", () => {
    state.triggerMode = "hold";
    refresh();
  });

  refs.executeModeBtn.addEventListener("click", () => {
    state.triggerMode = "execute";
    refresh();
  });

  refs.recordBtn.addEventListener("click", () => {
    if (macroTimeline.isRecording()) {
      macroTimeline.stopRecording("Recording stopped.");
      return;
    }
    macroTimeline.startRecording();
  });

  const appendTimedStep = (kind: "wait" | "rumble", durationMs: number) => {
    if (macroTimeline.isPlaybackRunning()) return;
    macroTimeline.setTimeline([
      ...macroTimeline.getTimeline(),
      { id: macroTimeline.nextId(), kind, durationMs },
    ]);
    state.codeDirty = false;
    state.codeStatus = "Generated from macro builder";
    macroTimeline.appendLog(`Appended ${kind} ${durationMs}ms.`);
    refresh();
  };

  refs.insertWaitBtn.addEventListener("click", () => appendTimedStep("wait", 100));
  refs.insertRumbleBtn.addEventListener("click", () => appendTimedStep("rumble", 250));

  refs.cleanBtn.addEventListener("click", () => {
    const count = macroTimeline.getTimeline().length;
    if (count === 0 || macroTimeline.isPlaybackRunning()) return;

    macroTimeline.setTimeline([]);
    state.selectedItemIds = new Set();
    state.codeDirty = false;
    state.codeStatus = "Generated from macro builder";
    macroTimeline.appendLog(`Cleaned ${count} step${count === 1 ? "" : "s"} from the macro.`);
    refresh();
  });

  refs.clearBtn.addEventListener("click", () => {
    if (macroTimeline.getTimeline().length === 0 && macroTimeline.getPlaybackLog().length === 0) return;
    if (!window.confirm("Clear the entire macro timeline and playback log?")) return;

    macroTimeline.stopPlayback("Timeline cleared.");
    macroTimeline.setTimeline([]);
    state.selectedItemIds = new Set();
    state.codeDirty = false;
    state.codeStatus = "Generated from macro builder";
    refresh();
  });

  refs.playBtn.addEventListener("click", () => {
    if (macroTimeline.isPlaybackRunning()) return;
    macroTimeline.startPlayback({
      leadInMs: state.leadInMs,
      iterations: state.iterations,
      pauseBetweenIterationsMs: state.pauseBetweenIterationsMs,
      keyDelayMs: state.keyDelayMs,
    });
  });

  refs.stopBtn.addEventListener("click", () => {
    if (macroTimeline.isPlaybackRunning()) {
      macroTimeline.stopPlayback("Test playback stopped.");
      return;
    }
    if (macroTimeline.isRecording()) {
      macroTimeline.stopRecording("Recording stopped.");
    }
  });

  refs.scriptTestBtn.addEventListener("click", async () => {
    if (state.scriptTestRunning || macroTimeline.isRecording() || macroTimeline.isPlaybackRunning()) return;

    state.scriptTestRunning = true;
    macroTimeline.appendLog("Running hardcoded 10s A hold test.");
    refresh();

    try {
      await invoke("run_test_macro");
      macroTimeline.appendLog("Hardcoded 10s A hold test completed.");
      window.alert("done");
    } catch (error) {
      macroTimeline.appendLog(`Hardcoded 10s A hold test failed: ${String(error)}`);
      window.alert(`Script test failed: ${String(error)}`);
    } finally {
      state.scriptTestRunning = false;
      refresh();
    }
  });

  wirePanelListeners(ctx);
}
