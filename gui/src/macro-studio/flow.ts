import { createMacroTimelineFlow, type MacroFlowItem } from "../macro-flow-prototype";
import type { MacroTimelineHandle, MacroTimelineItem } from "../macro-timeline";
import type { MacroStudioState } from "./state";

export interface MacroTimelineFlowApi {
  setState(state: { items: MacroFlowItem[]; selectedItemIds: number[] }): void;
  destroy(): void;
}

interface TimelineRenderChip {
  key: string;
  itemId?: number;
  kind: "action" | "wait" | "meta";
  label: string;
  secondary?: string;
  draggable: boolean;
  waitValue?: number;
}

interface MacroFlowCtx {
  state: MacroStudioState;
  macroTimeline: MacroTimelineHandle;
  refresh(): void;
}

export function initTimelineFlow(flowHost: HTMLElement, ctx: MacroFlowCtx): MacroTimelineFlowApi {
  const { state, macroTimeline, refresh } = ctx;

  return createMacroTimelineFlow(flowHost, {
    onWaitChange: (itemId, value) => {
      const timeline = macroTimeline.getTimeline();
      const item = timeline.find((entry) => entry.id === itemId);
      if (!item || item.kind !== "wait") return;
      item.durationMs = Math.max(0, Math.round(value));
      state.codeDirty = false;
      state.codeStatus = "Generated from macro builder";
      refresh();
    },
    onDeleteSelection: (itemIds) => {
      const idSet = new Set(itemIds);
      macroTimeline.setTimeline(macroTimeline.getTimeline().filter((item) => !idSet.has(item.id)));
      for (const itemId of itemIds) state.selectedItemIds.delete(itemId);
      state.codeDirty = false;
      state.codeStatus = "Generated from macro builder";
      refresh();
    },
    onOrderChange: (orderedItemIds) => {
      const timeline = macroTimeline.getTimeline();
      if (orderedItemIds.length !== timeline.length) return;

      const itemById = new Map(timeline.map((item) => [item.id, item]));
      const nextTimeline = orderedItemIds
        .map((itemId) => itemById.get(itemId))
        .filter((item): item is MacroTimelineItem => item !== undefined);

      if (nextTimeline.length !== timeline.length) return;
      if (nextTimeline.every((item, index) => item.id === timeline[index]?.id)) return;

      macroTimeline.setTimeline(nextTimeline);
      state.codeDirty = false;
      state.codeStatus = "Generated from macro builder";
      refresh();
    },
    onSelectionChange: (nextSelectedItemIds) => {
      state.selectedItemIds = new Set(
        nextSelectedItemIds.filter((itemId) => macroTimeline.getTimeline().some((item) => item.id === itemId))
      );
      refresh();
    },
  });
}

export function renderFlowTimeline(
  timelineFlow: MacroTimelineFlowApi | null,
  macroTimeline: MacroTimelineHandle,
  state: MacroStudioState,
) {
  if (!timelineFlow) return;
  const timeline = macroTimeline.getTimeline();
  const activePlaybackItemId = macroTimeline.getActivePlaybackItemId();
  const playbackRunning = macroTimeline.isPlaybackRunning();
  const chips = buildTimelineRenderChips(timeline, playbackRunning, state);
  const items: MacroFlowItem[] = chips.map((chip) => ({
    key: chip.key,
    itemId: chip.itemId,
    kind: chip.kind,
    label: chip.label,
    secondary: chip.secondary,
    waitValue: chip.waitValue,
    active: chip.itemId !== undefined && chip.itemId === activePlaybackItemId,
    draggable: chip.draggable,
  }));
  timelineFlow.setState({ items, selectedItemIds: [...state.selectedItemIds] });
}

function buildTimelineRenderChips(
  timeline: MacroTimelineItem[],
  playbackRunning: boolean,
  state: MacroStudioState,
): TimelineRenderChip[] {
  const chips: TimelineRenderChip[] = [];

  if (state.leadInMs > 0) {
    chips.push({
      key: "lead-in",
      kind: "meta",
      label: "Lead-in",
      secondary: `${state.leadInMs} ms`,
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
        draggable: !playbackRunning,
        waitValue: item.durationMs,
      });
    } else {
      chips.push({
        key: `action-${item.id}`,
        itemId: item.id,
        kind: "action",
        label: item.input,
        secondary: item.direction,
        draggable: !playbackRunning,
      });
    }
  }

  if (state.iterations > 1) {
    chips.push({
      key: "loop",
      kind: "meta",
      label: "Loop",
      secondary: `${state.iterations}x`,
      draggable: false,
    });
  }

  return chips;
}
