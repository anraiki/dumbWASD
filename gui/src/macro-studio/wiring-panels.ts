import type { MacroStudioWiringCtx } from "./wiring";
import { generateScript } from "./script";
import { copyToClipboard } from "./utils";

/** Listeners for the tab strip, code editor panel, and playback-log modal. */
export function wirePanelListeners(ctx: MacroStudioWiringCtx) {
  const { refs, state, macroTimeline, refresh } = ctx;

  refs.visualTabBtn.addEventListener("click", () => {
    state.activeTab = "visual";
    refresh();
  });

  refs.codeTabBtn.addEventListener("click", () => {
    state.activeTab = "code";
    refresh();
  });

  refs.logBtn.addEventListener("click", () => {
    state.playbackLogOpen = true;
    refresh();
  });

  refs.playbackModalCloseBtn.addEventListener("click", () => {
    state.playbackLogOpen = false;
    refresh();
  });

  refs.playbackModal.addEventListener("click", (event) => {
    if (event.target === refs.playbackModal) {
      state.playbackLogOpen = false;
      refresh();
    }
  });

  refs.codeEditor.addEventListener("input", () => {
    state.codeDraft = refs.codeEditor.value ?? "";
    state.codeDirty = true;
    state.codeStatus = "Manual edits ready to share";
    refresh();
  });

  refs.resetCodeBtn.addEventListener("click", () => {
    state.codeDirty = false;
    state.codeDraft = generateScript(macroTimeline.getTimeline(), state);
    state.codeStatus = "Code reset from macro builder";
    refresh();
  });

  refs.copyCodeBtn.addEventListener("click", async () => {
    try {
      await copyToClipboard(refs.codeEditor.value ?? state.codeDraft);
      state.codeStatus = "Code copied to clipboard";
    } catch {
      state.codeStatus = "Clipboard copy failed";
    }
    refresh();
  });
}
