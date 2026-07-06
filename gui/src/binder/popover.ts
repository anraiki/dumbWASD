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
      onClose(): void;
      onSave(binding: MappingTarget): Promise<void>;
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
      options.onSelectionChange(button.id);

      options.popover.open({
        anchorEl,
        button: { code: button.id, label: button.label },
        currentBinding,
        onClose: clearSelection,
        onSave: async (nextBinding) => {
          await options.legacyBinder.persist(button.id, nextBinding);
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
