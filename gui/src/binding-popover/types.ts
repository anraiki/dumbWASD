import type { MappingTarget } from "../input-codes";
import type { SavedMacro } from "../macro-types";

export interface BindingPopoverButton {
  code: number;
  label: string;
}

export interface BindingPopoverOptions {
  anchorEl: Element;
  button: BindingPopoverButton;
  currentBinding: MappingTarget | null;
  onSave(nextBinding: MappingTarget): Promise<void> | void;
  onReset(): Promise<void> | void;
  onClose?(): void;
  onOpenMacroStudio?(): void;
}

export interface BindingPopoverController {
  open(options: BindingPopoverOptions): void;
  close(): void;
  isOpenFor(code: number): boolean;
  destroy(): void;
}

/** Mutable state shared by the popover modules. */
export interface PopoverState {
  currentOptions: BindingPopoverOptions | null;
  currentButtonCode: number | null;
  currentAnchorEl: Element | null;
  currentSelection: MappingTarget | null;
  currentError: string;
  pending: boolean;
  listening: boolean;
  captureModifiers: Set<number>;
  modifierOnlyCandidate: number | null;
  savedMacros: SavedMacro[];
  macroLibraryLoaded: boolean;
}

/** State plus the closure-owned operations the popover modules call back into. */
export interface PopoverContext {
  popover: HTMLElement;
  state: PopoverState;
  render(): void;
  positionPopover(): void;
  close(): void;
  startListening(): void;
  stopListening(): void;
  runAction(action: () => Promise<void>): Promise<void>;
}
