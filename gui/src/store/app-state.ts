import type { ButtonGrid } from "../button-grid";
import type { LayoutEditorHandle } from "../react-flow-editor";
import type { DeviceSvgHandle } from "../devices/layout";
import type { DeviceEntry } from "../device-modal";

export interface AppState {
  // ── Mode flags ──
  getIsEditMode(): boolean;
  setIsEditMode(val: boolean): void;
  getIsMacroMode(): boolean;
  setIsMacroMode(val: boolean): void;
  getListenAllDevices(): boolean;
  setListenAllDevices(val: boolean): void;

  // ── Active workspace widgets ──
  getButtonGrid(): ButtonGrid | null;
  setButtonGrid(grid: ButtonGrid | null): void;
  getLayoutEditor(): LayoutEditorHandle | null;
  setLayoutEditor(editor: LayoutEditorHandle | null): void;
  destroyLayoutEditor(): void;
  getDeviceSvgPreview(): DeviceSvgHandle | null;
  setDeviceSvgPreview(preview: DeviceSvgHandle | null): void;

  // ── Device context menu ──
  getCloseDeviceContextMenu(): (() => void) | null;
  setCloseDeviceContextMenu(fn: (() => void) | null): void;

  // ── Startup data ──
  initialize(data: { allDevices: DeviceEntry[]; layouts: string[] }): void;
  allDevices: DeviceEntry[];
  layouts: string[];

  // ── Shared collections ──
  pressedButtons: Set<number>;
}

export function createAppState(): AppState {
  let isEditMode = false;
  let isMacroMode = false;
  let listenAllDevices = false;
  let buttonGrid: ButtonGrid | null = null;
  let layoutEditor: LayoutEditorHandle | null = null;
  let deviceSvgPreview: DeviceSvgHandle | null = null;
  let closeDeviceContextMenu: (() => void) | null = null;
  const pressedButtons = new Set<number>();
  let allDevices: DeviceEntry[] = [];
  let layouts: string[] = [];

  return {
    getIsEditMode: () => isEditMode,
    setIsEditMode: (val) => { isEditMode = val; },

    getIsMacroMode: () => isMacroMode,
    setIsMacroMode: (val) => { isMacroMode = val; },

    getListenAllDevices: () => listenAllDevices,
    setListenAllDevices: (val) => { listenAllDevices = val; },

    getButtonGrid: () => buttonGrid,
    setButtonGrid: (grid) => { buttonGrid = grid; },

    getLayoutEditor: () => layoutEditor,
    setLayoutEditor: (editor) => { layoutEditor = editor; },
    destroyLayoutEditor: () => {
      if (!layoutEditor) return;
      try { layoutEditor.destroy(); } catch (_) {}
      layoutEditor = null;
    },

    getDeviceSvgPreview: () => deviceSvgPreview,
    setDeviceSvgPreview: (preview) => { deviceSvgPreview = preview; },

    getCloseDeviceContextMenu: () => closeDeviceContextMenu,
    setCloseDeviceContextMenu: (fn) => { closeDeviceContextMenu = fn; },

    initialize: (data) => { allDevices = data.allDevices; layouts = data.layouts; },
    get allDevices() { return allDevices; },
    get layouts() { return layouts; },

    pressedButtons,
  };
}
