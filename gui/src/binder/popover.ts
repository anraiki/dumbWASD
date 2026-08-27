import { getMappingTargetLabel, type MappingTarget } from "../input-codes";
import type { LegacyBinderHandle } from "./legacy";

export interface BindingPopoverController {
  open(button: { id: number; label: string }, anchorEl: Element): void;
  close(): void;
}

export function createBindingPopoverController(options: {
  popover: {
    isOpenFor(code: number): boolean;
    open(params: {
      anchorEl: Element;
      button: { code: number; label: string };
      currentBinding: MappingTarget | null;
      currentExclusive: boolean;
      currentToggle: boolean;
      onClose(): void;
      onSave(
        binding: MappingTarget,
        flags: { exclusive: boolean; toggle: boolean },
      ): Promise<void>;
      onReset(): Promise<void>;
      onOpenMacroStudio?(): void;
    }): void;
    close(): void;
  };
  legacyBinder: LegacyBinderHandle;
  statusEl: HTMLElement;
  getIsEditMode(): boolean;
  getIsMacroMode(): boolean;
  getHasProfile(): boolean;
  onSelectionChange(code: number | null): void;
  onOpenMacroStudio?(): void;
}): BindingPopoverController {
  function clearSelection() {
    options.onSelectionChange(null);
  }

  return {
    open(button, anchorEl) {
      if (!options.getHasProfile() || options.getIsEditMode() || options.getIsMacroMode()) {
        return;
      }

      if (options.popover.isOpenFor(button.id)) {
        options.popover.close();
        clearSelection();
        return;
      }

      const currentBinding = options.legacyBinder.getMapping(button.id);
      const currentExclusive = options.legacyBinder.getExclusive(button.id);
      const currentToggle = options.legacyBinder.getToggle(button.id);
      options.onSelectionChange(button.id);

      options.popover.open({
        anchorEl,
        button: { code: button.id, label: button.label },
        currentBinding,
        currentExclusive,
        currentToggle,
        onClose: clearSelection,
        onSave: async (nextBinding, flags) => {
          await options.legacyBinder.persist(button.id, nextBinding, flags);
          options.statusEl.textContent = `${button.label} mapped to ${getMappingTargetLabel(nextBinding)}`;
        },
        onReset: async () => {
          await options.legacyBinder.persist(button.id, null);
          options.statusEl.textContent = `${button.label} mapping cleared`;
        },
        onOpenMacroStudio: options.onOpenMacroStudio,
      });
    },

    close() {
      options.popover.close();
      clearSelection();
    },
  };
}
