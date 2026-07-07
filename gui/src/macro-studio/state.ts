import type { SavedMacro } from "../macro-types";

export type TriggerMode = "hold" | "execute";
export type ActiveTab = "visual" | "code";

export interface MacroStudioState {
  leadInMs: number;
  keyDelayMs: number;
  iterations: number;
  pauseBetweenIterationsMs: number;
  triggerMode: TriggerMode;
  activeTab: ActiveTab;
  monitoringActive: boolean;
  codeDraft: string;
  codeDirty: boolean;
  codeStatus: string;
  selectedItemIds: Set<number>;
  playbackLogOpen: boolean;
  scriptTestRunning: boolean;
  savedMacros: SavedMacro[];
  currentMacroId: string | null;
  librarySignature: string;
}

export function createInitialState(): MacroStudioState {
  return {
    leadInMs: 0,
    keyDelayMs: 10,
    iterations: 1,
    pauseBetweenIterationsMs: 0,
    triggerMode: "execute",
    activeTab: "visual",
    monitoringActive: false,
    codeDraft: "",
    codeDirty: false,
    codeStatus: "Generated from macro builder",
    selectedItemIds: new Set<number>(),
    playbackLogOpen: false,
    scriptTestRunning: false,
    savedMacros: [],
    currentMacroId: null,
    librarySignature: "",
  };
}
