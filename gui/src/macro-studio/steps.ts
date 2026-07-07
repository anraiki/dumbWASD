import { normalizeInput } from "../macro-input-constants";
import type { MacroTimelineItem } from "../macro-timeline";
import type { MacroStepDto } from "../macro-types";

const FIRST_MOUSE_CODE = 272; // BTN_LEFT
const LAST_MOUSE_CODE = 279; // BTN_TASK

export function timelineToSteps(timeline: MacroTimelineItem[]): MacroStepDto[] {
  const steps: MacroStepDto[] = [];

  for (const item of timeline) {
    if (item.kind === "wait") {
      steps.push({ type: "delay", ms: item.durationMs });
    } else if (item.kind === "rumble") {
      steps.push({ type: "rumble", ms: item.durationMs });
    } else if (item.code >= FIRST_MOUSE_CODE && item.code <= LAST_MOUSE_CODE) {
      steps.push({ type: "mouse_button", code: item.code, pressed: item.direction === "down" });
    } else {
      steps.push({ type: item.direction === "down" ? "key_down" : "key_up", code: item.code });
    }
  }

  return steps;
}

export function stepsToTimeline(steps: MacroStepDto[], nextId: () => number): MacroTimelineItem[] {
  const timeline: MacroTimelineItem[] = [];

  const pushAction = (code: number, direction: "down" | "up") => {
    timeline.push({
      id: nextId(),
      kind: "action",
      code,
      input: normalizeInput(code),
      direction,
    });
  };

  for (const step of steps) {
    switch (step.type) {
      case "key_down":
        pushAction(step.code, "down");
        break;
      case "key_up":
        pushAction(step.code, "up");
        break;
      case "key_tap":
        pushAction(step.code, "down");
        pushAction(step.code, "up");
        break;
      case "mouse_button":
        pushAction(step.code, step.pressed ? "down" : "up");
        break;
      case "delay":
        timeline.push({ id: nextId(), kind: "wait", durationMs: step.ms });
        break;
      case "rumble":
        timeline.push({ id: nextId(), kind: "rumble", durationMs: step.ms });
        break;
    }
  }

  return timeline;
}
