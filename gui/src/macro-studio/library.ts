import { invoke } from "@tauri-apps/api/core";
import type { MacroTimelineHandle } from "../macro-timeline";
import type { SavedMacro } from "../macro-types";
import type { MacroStudioState } from "./state";
import { stepsToTimeline, timelineToSteps } from "./steps";

export interface MacroLibraryCtx {
  state: MacroStudioState;
  macroTimeline: MacroTimelineHandle;
  refresh(): void;
}

export async function loadMacroLibrary(ctx: MacroLibraryCtx) {
  const { state, macroTimeline, refresh } = ctx;
  try {
    state.savedMacros = await invoke<SavedMacro[]>("list_macros");
  } catch (error) {
    macroTimeline.appendLog(`Macro library unavailable: ${String(error)}`);
  }
  refresh();
}

export function applySavedMacro(ctx: MacroLibraryCtx, saved: SavedMacro) {
  const { state, macroTimeline, refresh } = ctx;

  macroTimeline.stopPlayback();
  if (macroTimeline.isRecording()) {
    macroTimeline.stopRecording("Recording stopped to load a macro.");
  }

  state.triggerMode = saved.trigger_mode === "hold_until_release" ? "hold" : "execute";
  state.leadInMs = saved.lead_in_ms;
  state.iterations = Math.max(1, saved.iterations);
  state.pauseBetweenIterationsMs = saved.pause_between_iterations_ms;
  macroTimeline.setTimeline(stepsToTimeline(saved.steps, macroTimeline.nextId));
  state.selectedItemIds = new Set();
  state.currentMacroId = saved.id;
  state.codeDirty = false;
  state.codeStatus = "Generated from macro builder";
  macroTimeline.appendLog(`Loaded macro "${saved.name}".`);
  refresh();
}

export async function saveCurrentMacro(ctx: MacroLibraryCtx) {
  const { state, macroTimeline, refresh } = ctx;

  const timeline = macroTimeline.getTimeline();
  if (timeline.length === 0) return;

  const current = state.savedMacros.find((entry) => entry.id === state.currentMacroId);
  let id = current?.id ?? "";
  let name = current?.name ?? "";

  if (!current) {
    const input = window.prompt("Save macro as:");
    name = input?.trim() ?? "";
    id = slugifyMacroName(name);
    if (!id) return;
  }

  const definition: SavedMacro = {
    id,
    name,
    trigger_mode: state.triggerMode === "hold" ? "hold_until_release" : "execute_at_once",
    lead_in_ms: state.leadInMs,
    iterations: state.iterations,
    pause_between_iterations_ms: state.pauseBetweenIterationsMs,
    steps: timelineToSteps(timeline),
  };

  try {
    state.savedMacros = await invoke<SavedMacro[]>("save_macro", { definition });
    state.currentMacroId = id;
    macroTimeline.appendLog(`Saved macro "${name}".`);
  } catch (error) {
    macroTimeline.appendLog(`Failed to save macro: ${String(error)}`);
  }
  refresh();
}

export async function deleteCurrentMacro(ctx: MacroLibraryCtx) {
  const { state, macroTimeline, refresh } = ctx;

  const current = state.savedMacros.find((entry) => entry.id === state.currentMacroId);
  if (!current) return;
  if (!window.confirm(`Delete saved macro "${current.name}"? The timeline keeps its steps.`)) return;

  try {
    state.savedMacros = await invoke<SavedMacro[]>("delete_macro", { id: current.id });
    state.currentMacroId = null;
    macroTimeline.appendLog(`Deleted macro "${current.name}".`);
  } catch (error) {
    macroTimeline.appendLog(`Failed to delete macro: ${String(error)}`);
  }
  refresh();
}

function slugifyMacroName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
