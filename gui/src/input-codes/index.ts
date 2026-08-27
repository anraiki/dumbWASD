import type { SavedMacro } from "../macro-types";
import { getStickLabel } from "../stick-codes";

export type MappingTargetType = "key" | "mouse_button" | "shortcut" | "macro";

export type MappingTarget =
  | {
      type: "key" | "mouse_button";
      code: number;
    }
  | {
      type: "shortcut";
      modifiers: number[];
      key: number;
      /**
       * Absent (the default) means the chord is held for as long as the
       * button is. A value switches to auto-repeat: the chord is tapped
       * every `repeat_ms` while held, and nothing stays down.
       */
      repeat_ms?: number;
    }
  | {
      type: "macro";
      /** Treated as "toggle" when absent. */
      mode?: "toggle" | "hold";
      /**
       * Snapshot embedded into the profile at bind time. Playback uses this
       * copy; editing or deleting the library macro leaves it untouched
       * until the binding is reimported. `definition.id` records which
       * library macro it was imported from.
       */
      definition: SavedMacro;
    };

export type MappingTargetOption = Extract<MappingTarget, { type: "key" | "mouse_button" }> & {
  label: string;
  group: "Keyboard" | "Mouse";
};

import {
  INPUT_CODE_LABELS,
  KEYBOARD_CODE_LABELS,
  MOUSE_CODE_LABELS,
} from "./code-labels";
import {
  KEYBOARD_EVENT_CODE_TO_INPUT_CODE,
  MODIFIER_CODES,
  POINTER_BUTTON_TO_INPUT_CODE,
  SHORTCUT_MODIFIER_ORDER,
} from "./browser-input";


export const MAPPING_TARGET_OPTIONS: MappingTargetOption[] = [
  ...KEYBOARD_CODE_LABELS.map(([code, label]) => ({
    type: "key" as const,
    code,
    label,
    group: "Keyboard" as const,
  })),
  ...MOUSE_CODE_LABELS.map(([code, label]) => ({
    type: "mouse_button" as const,
    code,
    label,
    group: "Mouse" as const,
  })),
];

export function getInputCodeLabel(code: number): string {
  return INPUT_CODE_LABELS.get(code) || getStickLabel(code) || `Code ${code}`;
}

export function getMappingTargetLabel(target: MappingTarget | null | undefined): string {
  if (!target) {
    return "None";
  }

  if (target.type === "macro") {
    return `Macro: ${target.definition.name || target.definition.id}`;
  }

  if (target.type === "shortcut") {
    const parts = normalizeShortcutModifiers(target.modifiers).map((code) => getInputCodeLabel(code));
    parts.push(getInputCodeLabel(target.key));
    return parts.join(" + ");
  }

  return getInputCodeLabel(target.code);
}

export function isSupportedMappingTarget(
  target:
    | {
        type: string;
        code?: number;
        modifiers?: number[];
        key?: number;
        definition?: { id?: unknown } | null;
      }
    | null
    | undefined,
): target is MappingTarget {
  if (!target) {
    return false;
  }

  if ((target.type === "key" || target.type === "mouse_button") && Number.isFinite(target.code)) {
    return true;
  }

  if (
    target.type === "macro"
    && typeof target.definition?.id === "string"
    && target.definition.id.length > 0
  ) {
    return true;
  }

  if (target.type !== "shortcut" || !Array.isArray(target.modifiers) || !Number.isFinite(target.key)) {
    return false;
  }

  return target.modifiers.every((code) => Number.isFinite(code));
}


export function getInputCodeFromKeyboardEvent(event: KeyboardEvent): number | null {
  return KEYBOARD_EVENT_CODE_TO_INPUT_CODE.get(event.code) ?? null;
}

export function getMappingTargetFromPointerButton(button: number): MappingTarget | null {
  const code = POINTER_BUTTON_TO_INPUT_CODE.get(button);
  return typeof code === "number" ? { type: "mouse_button", code } : null;
}

export function isModifierInputCode(code: number): boolean {
  return MODIFIER_CODES.has(code);
}

export function normalizeShortcutModifiers(modifiers: number[]): number[] {
  const seen = new Set<number>();

  return SHORTCUT_MODIFIER_ORDER.filter((code) => {
    if (!modifiers.includes(code) || seen.has(code)) {
      return false;
    }

    seen.add(code);
    return true;
  });
}
