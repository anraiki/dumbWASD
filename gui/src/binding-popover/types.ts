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
  currentExclusive?: boolean;
  currentToggle?: boolean;
  onSave(
    nextBinding: MappingTarget,
    flags: { exclusive: boolean; toggle: boolean },
  ): Promise<void> | void;
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
  /** Pending value of the Override toggle; applied on Save. */
  currentExclusive: boolean;
  /** Pending value of the Toggle switch; applied on Save. */
  currentToggle: boolean;
  /** Whether the help overlay is covering the binding controls. */
  showInfo: boolean;
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
