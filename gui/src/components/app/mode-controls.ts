import { createDeviceSelector } from "../../device-selector";
import { showUnsavedLayoutDialog } from "../../layout-unsaved-dialog";
import type { LayoutEditorHandle } from "../../react-flow-editor";
import type { ProfileManagerHandle } from "../../profile-manager";
import type { WorkspaceHandle } from "../../workspace/workspace";
import type { MonitorHandle } from "../../monitoring/monitor";

export interface ModeControlsHandle {
  confirmExitEditModeIfDirty(): Promise<boolean>;
}

export function setupModeControls(options: {
  toggleModeBtn: HTMLButtonElement;
  macroBtn: HTMLButtonElement;
  reconnectBtn: HTMLButtonElement;
  layoutSelectorEl: HTMLElement;
  layouts: string[];
  statusEl: HTMLElement;
  getIsEditMode(): boolean;
  setIsEditMode(val: boolean): void;
  getIsMacroMode(): boolean;
  setIsMacroMode(val: boolean): void;
  getLayoutEditor(): LayoutEditorHandle | null;
  profileManager: ProfileManagerHandle;
  workspace: WorkspaceHandle;
  monitor: MonitorHandle;
}): ModeControlsHandle {
  async function confirmExitEditModeIfDirty(): Promise<boolean> {
    const editor = options.getLayoutEditor();
    if (!options.getIsEditMode() || !editor?.hasUnsavedChanges()) {
      return true;
    }

    const layoutName =
      options.profileManager.getSelectedLayout() ||
      options.profileManager.getCurrentLayout()?.device.name ||
      "this layout";
    const choice = await showUnsavedLayoutDialog({ layoutName });

    if (choice === "cancel") return false;
    if (choice === "discard") return true;

    const saved = await editor.save();
    if (!saved) {
      options.statusEl.textContent = `Error saving layout: ${layoutName}`;
      return false;
    }

    return true;
  }

  createDeviceSelector(options.layoutSelectorEl, {
    label: "Layout",
    items: options.layouts.map((name) => ({ value: name, label: name })),
    async onChange(value) {
      if (value !== options.profileManager.getSelectedLayout()) {
        const canLeave = await confirmExitEditModeIfDirty();
        if (!canLeave) {
          const layoutSelect = options.layoutSelectorEl.querySelector<HTMLSelectElement>("select");
          if (layoutSelect) layoutSelect.value = options.profileManager.getSelectedLayout() || "";
          return;
        }
      }
      await options.profileManager.selectLayout(value);
    },
  });

  options.toggleModeBtn.addEventListener("click", async () => {
    if (options.getIsEditMode()) {
      const canLeave = await confirmExitEditModeIfDirty();
      if (!canLeave) return;
    }

    const nextEditMode = !options.getIsEditMode();
    options.setIsEditMode(nextEditMode);
    options.toggleModeBtn.textContent = nextEditMode ? "View Mode" : "Edit Mode";

    if (options.profileManager.getCurrentLayout()) {
      options.workspace.render();
    }
  });

  options.macroBtn.addEventListener("click", async () => {
    if (!options.getIsMacroMode()) {
      const canLeave = await confirmExitEditModeIfDirty();
      if (!canLeave) return;
    }

    const nextMacroMode = !options.getIsMacroMode();
    options.setIsMacroMode(nextMacroMode);
    options.macroBtn.classList.toggle("active", nextMacroMode);
    options.workspace.render();
    await options.monitor.syncScope(true);

    const currentLayout = options.profileManager.getCurrentLayout();
    options.statusEl.textContent = nextMacroMode
      ? "Macro Studio ready. Recording listens across all connected profile keyboards/gamepads."
      : currentLayout
        ? `Layout: ${currentLayout.device.name} (${currentLayout.buttons.length} buttons)`
        : "Select a profile...";
  });

  options.reconnectBtn.addEventListener("click", async () => {
    await options.monitor.syncScope(true);
  });

  return { confirmExitEditModeIfDirty };
}
