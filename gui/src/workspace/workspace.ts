import { invoke } from "@tauri-apps/api/core";
import { createButtonGrid, type ButtonGrid } from "../button-grid";
import { createLayoutEditor, type LayoutEditorHandle } from "../react-flow-editor";
import { createDeviceSvgPreview, type DeviceSvgHandle } from "../devices/layout";
import type { BindingPopoverController } from "../binder/popover";
import type { DeviceLayout, ProfileManagerHandle } from "../profile-manager";
import { resolveDeviceSvgConfig } from "./device-svg-resolver";

export interface WorkspaceHandle {
  render(): void;
  syncAuxPanels(): void;
  applyJoystickVector(): void;
}

export function createWorkspace(options: {
  gridContainer: HTMLElement;
  statusEl: HTMLElement;
  actionBar: HTMLElement;
  eventLogContainer: HTMLElement;
  toggleModeBtn: HTMLButtonElement;
  listenAllDevicesToggle: HTMLInputElement;
  getIsEditMode(): boolean;
  getIsMacroMode(): boolean;
  getButtonGrid(): ButtonGrid | null;
  setButtonGrid(grid: ButtonGrid | null): void;
  getLayoutEditor(): LayoutEditorHandle | null;
  setLayoutEditor(editor: LayoutEditorHandle | null): void;
  getDeviceSvgPreview(): DeviceSvgHandle | null;
  setDeviceSvgPreview(preview: DeviceSvgHandle | null): void;
  pressedButtons: Set<number>;
  macroStudio: {
    mount(container: HTMLElement): void;
    unmount(): void;
    setMonitoringActive(active: boolean): void;
  };
  getIsMonitoringActive(): boolean;
  profileManager: Pick<
    ProfileManagerHandle,
    "getCurrentLayout" | "getSelectedLayout" | "loadLayout" | "getSelectedDevice"
  >;
  joystickTracker: { getCurrentVector(stick?: "left" | "right"): { x: number; y: number } | null };
  bindingController: BindingPopoverController;
}): WorkspaceHandle {
  function applyJoystickVector() {
    const v = options.joystickTracker.getCurrentVector();
    if (v) {
      options.getButtonGrid()?.setJoystickVector(v.x, v.y);
      options.getLayoutEditor()?.setJoystickVector(v.x, v.y);
      options.getDeviceSvgPreview()?.setJoystickVector(v.x, v.y);
    }
    const right = options.joystickTracker.getCurrentVector("right");
    if (right) {
      options.getDeviceSvgPreview()?.setJoystickVector(right.x, right.y, "right");
    }
  }

  function renderViewMode(currentLayout: DeviceLayout) {
    options.gridContainer.classList.remove("macro-workspace-host");
    options.macroStudio.unmount();

    const existingEditor = options.getLayoutEditor();
    if (existingEditor) {
      try { existingEditor.destroy(); } catch (e) { console.warn("Error destroying layout editor:", e); }
      options.setLayoutEditor(null);
    }

    options.getButtonGrid()?.destroy();
    options.gridContainer.innerHTML = "";
    const grid = createButtonGrid(options.gridContainer, currentLayout, {
      onButtonClick(button, element) {
        options.bindingController.open(button, element);
      },
    });
    options.setButtonGrid(grid);
    grid.clearAll();
    for (const code of options.pressedButtons) {
      grid.setButtonState(code, true);
    }
    applyJoystickVector();
  }

  function renderEditMode(currentLayout: DeviceLayout) {
    options.gridContainer.classList.remove("macro-workspace-host");
    options.macroStudio.unmount();

    options.getButtonGrid()?.destroy();
    options.gridContainer.innerHTML = "";
    options.setButtonGrid(null);
    options.gridContainer.style.height = "100%";

    const editor = createLayoutEditor(options.gridContainer, currentLayout, {
      onSave: async (updatedLayout) => {
        const selectedLayout = options.profileManager.getSelectedLayout();
        try {
          await invoke("save_layout", { name: selectedLayout, layout: updatedLayout });
          options.statusEl.textContent = "Layout saved successfully!";
          if (selectedLayout) {
            await options.profileManager.loadLayout(selectedLayout);
          }
        } catch (e) {
          options.statusEl.textContent = `Error saving layout: ${e}`;
        }
      },
    });
    options.setLayoutEditor(editor);
    requestAnimationFrame(() => {
      options.getLayoutEditor()?.clearAll();
      for (const code of options.pressedButtons) {
        options.getLayoutEditor()?.setButtonState(code, true);
      }
      applyJoystickVector();
    });
  }

  function renderDeviceSvgPreview() {
    options.getDeviceSvgPreview()?.destroy();
    options.setDeviceSvgPreview(null);

    const svgConfig = resolveDeviceSvgConfig(options.profileManager.getSelectedDevice());
    if (!svgConfig) {
      options.gridContainer.innerHTML = "";
      return;
    }

    options.gridContainer.innerHTML = `
      <section class="device-svg-preview" aria-label="${svgConfig.previewLabel}"></section>
    `;

    const frame = options.gridContainer.querySelector<HTMLElement>(".device-svg-preview");
    if (!frame) return;

    frame.innerHTML = svgConfig.markup;

    const svg = frame.querySelector<SVGElement>("svg");
    if (!svg) return;

    svg.classList.add("device-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const preview = createDeviceSvgPreview(svg, svgConfig, {
      onButtonClick(button, element) {
        options.bindingController.open(button, element);
      },
    });
    options.setDeviceSvgPreview(preview);
    preview.clearAll();
    for (const code of options.pressedButtons) {
      preview.setButtonState(code, true);
    }
    const v = options.joystickTracker.getCurrentVector();
    if (v) preview.setJoystickVector(v.x, v.y);
    const right = options.joystickTracker.getCurrentVector("right");
    if (right) preview.setJoystickVector(right.x, right.y, "right");
  }

  function syncAuxPanels() {
    options.eventLogContainer.style.display =
      options.getIsMonitoringActive() && !options.getIsMacroMode() ? "flex" : "none";
    options.actionBar.style.display = options.getIsMacroMode() ? "none" : "flex";
    options.toggleModeBtn.disabled = options.getIsMacroMode();
    options.listenAllDevicesToggle.disabled = options.getIsMacroMode();
  }

  function render() {
    options.bindingController.close();
    syncAuxPanels();

    if (options.getIsMacroMode()) {
      options.getDeviceSvgPreview()?.destroy();
      options.setDeviceSvgPreview(null);
      const existingEditor = options.getLayoutEditor();
      if (existingEditor) {
        try { existingEditor.destroy(); } catch (_) {}
        options.setLayoutEditor(null);
      }
      options.getButtonGrid()?.destroy();
      options.setButtonGrid(null);
      options.gridContainer.innerHTML = "";
      options.gridContainer.classList.add("macro-workspace-host");
      options.macroStudio.mount(options.gridContainer);
      options.macroStudio.setMonitoringActive(options.getIsMonitoringActive());
      return;
    }

    options.gridContainer.classList.remove("macro-workspace-host");
    options.macroStudio.unmount();

    const currentLayout = options.profileManager.getCurrentLayout();
    if (!currentLayout) {
      const existingEditor = options.getLayoutEditor();
      if (existingEditor) {
        try { existingEditor.destroy(); } catch (_) {}
        options.setLayoutEditor(null);
      }
      options.getButtonGrid()?.destroy();
      options.setButtonGrid(null);
      renderDeviceSvgPreview();
      return;
    }

    options.getDeviceSvgPreview()?.destroy();
    options.setDeviceSvgPreview(null);

    if (options.getIsEditMode()) {
      renderEditMode(currentLayout);
    } else {
      renderViewMode(currentLayout);
    }
  }

  return { render, syncAuxPanels, applyJoystickVector };
}
