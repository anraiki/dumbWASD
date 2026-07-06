import { getMappingTargetLabel, normalizeShortcutModifiers } from "../input-codes";
import type { PopoverContext } from "./types";
import { escapeHtml, getDisplayMarkup } from "./utils";

export function renderPopover(ctx: PopoverContext) {
  const { popover, state } = ctx;
  const options = state.currentOptions;
  if (!options) {
    return;
  }

  const activeLabel = getMappingTargetLabel(state.currentSelection);
  const keySelection = state.currentSelection?.type === "macro" ? null : state.currentSelection;
  const captureTitle = state.listening
    ? state.captureModifiers.size
      ? `${normalizeShortcutModifiers([...state.captureModifiers])
        .map((code) => getMappingTargetLabel({ type: "key", code }))
        .join(" + ")} + ...`
      : "Press a key, shortcut, or mouse button"
    : getMappingTargetLabel(keySelection);
  const captureHint = state.listening
    ? "Press another key to finish a shortcut, or press Esc to cancel."
    : "Click here, then press a key, shortcut, or mouse button.";
  const embeddedDefinition = state.currentSelection?.type === "macro" ? state.currentSelection.definition : undefined;
  const selectedMacroId = embeddedDefinition?.id ?? "";
  const selectedMacroMode = state.currentSelection?.type === "macro" ? state.currentSelection.mode ?? "toggle" : null;
  const selectedLibraryEntry = selectedMacroId
    ? state.savedMacros.find((entry) => entry.id === selectedMacroId)
    : undefined;
  const orphanedOptionMarkup = embeddedDefinition && state.macroLibraryLoaded && !selectedLibraryEntry
    ? `<option value="${escapeHtml(selectedMacroId)}" selected>${escapeHtml(embeddedDefinition.name)} (imported copy)</option>`
    : "";

  let importStatusMarkup = "";
  if (embeddedDefinition && state.macroLibraryLoaded) {
    if (selectedLibraryEntry) {
      const matchesLibrary = JSON.stringify(embeddedDefinition) === JSON.stringify(selectedLibraryEntry);
      importStatusMarkup = matchesLibrary
        ? `<p class="binding-popover-import-status">Imported copy matches the library version.</p>`
        : `<p class="binding-popover-import-status differs">Imported copy differs from the library version.
              <button type="button" class="binding-popover-reimport" ${state.pending ? "disabled" : ""}>Reimport</button></p>`;
    } else {
      importStatusMarkup = `<p class="binding-popover-import-status missing">Source macro is no longer in the library — this binding keeps its own imported copy.</p>`;
    }
  }
  const helpText = selectedMacroMode === "hold"
    ? "The macro plays while the button is held and stops when you let go."
    : selectedMacroMode === "toggle"
      ? "Press the button to play this macro. Press it again while it is playing to stop it."
      : "This writes a direct profile remap for the selected button.";
  const behaviorFieldMarkup = selectedMacroMode
    ? `
      <label class="binding-popover-field">
        <span class="binding-popover-field-label">Behavior</span>
        <select class="binding-popover-macro-select binding-popover-behavior-select" ${state.pending ? "disabled" : ""}>
          <option value="toggle"${selectedMacroMode === "toggle" ? " selected" : ""}>Press to play / press again to stop</option>
          <option value="hold"${selectedMacroMode === "hold" ? " selected" : ""}>Play while held / stop on release</option>
        </select>
      </label>`
    : "";
  popover.innerHTML = `
      <div class="binding-popover-preview">
        <span class="binding-popover-preview-label">Output</span>
        <strong class="binding-popover-preview-value">${getDisplayMarkup(activeLabel)}</strong>
      </div>
      <label class="binding-popover-field">
        <span class="binding-popover-field-label">Bind to</span>
        <button
          type="button"
          class="binding-popover-capture"
          ${state.pending ? "disabled" : ""}
          ${state.listening ? 'data-listening="true"' : ""}
        >
          <span class="binding-popover-capture-value">${getDisplayMarkup(captureTitle)}</span>
          <span class="binding-popover-capture-hint">${captureHint}</span>
        </button>
      </label>
      <label class="binding-popover-field">
        <span class="binding-popover-field-label">Macro</span>
        <select class="binding-popover-macro-select" ${state.pending ? "disabled" : ""}>
          <option value="">None</option>
          ${state.savedMacros
            .map(
              (entry) =>
                `<option value="${escapeHtml(entry.id)}"${entry.id === selectedMacroId ? " selected" : ""}>${escapeHtml(entry.name)}</option>`
            )
            .join("")}
          ${orphanedOptionMarkup}
          <option value="__new__">＋ Create new macro…</option>
        </select>
      </label>${importStatusMarkup}${behaviorFieldMarkup}
      <p class="binding-popover-help">
        ${helpText}
      </p>
      <p class="binding-popover-error" ${state.currentError ? "" : "hidden"}>${state.currentError}</p>
      <div class="binding-popover-actions">
        <button type="button" class="btn binding-popover-reset"${options.currentBinding ? "" : " disabled"}>Reset</button>
        <div class="binding-popover-action-group">
          <button type="button" class="btn binding-popover-cancel">Cancel</button>
          <button type="button" class="btn binding-popover-save"${state.currentSelection ? "" : " disabled"}>Save</button>
        </div>
      </div>
    `;

  const captureButtonEl = popover.querySelector<HTMLButtonElement>(".binding-popover-capture");
  const errorEl = popover.querySelector<HTMLElement>(".binding-popover-error");
  const resetBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-reset");
  const cancelBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-cancel");
  const saveBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-save");

  if (
    !captureButtonEl
    || !errorEl
    || !resetBtn
    || !cancelBtn
    || !saveBtn
  ) {
    return;
  }

  cancelBtn.disabled = state.pending;
  resetBtn.disabled = state.pending || !options.currentBinding;
  saveBtn.disabled = state.pending || !state.currentSelection;
  errorEl.hidden = !state.currentError;
  errorEl.textContent = state.currentError;

  const macroSelect = popover.querySelector<HTMLSelectElement>(
    ".binding-popover-macro-select:not(.binding-popover-behavior-select)"
  );
  macroSelect?.addEventListener("change", () => {
    const value = macroSelect.value;

    if (value === "__new__") {
      const openMacroStudio = state.currentOptions?.onOpenMacroStudio;
      ctx.close();
      openMacroStudio?.();
      return;
    }

    if (!value) {
      if (state.currentSelection?.type === "macro") {
        state.currentSelection = null;
      }
    } else if (state.currentSelection?.type === "macro" && state.currentSelection.definition.id === value) {
      // Re-picking the current macro keeps the existing imported copy.
    } else {
      const entry = state.savedMacros.find((candidate) => candidate.id === value);
      if (!entry) {
        return;
      }
      // Import: embed a snapshot of the macro into the binding. The library
      // version can change or vanish without affecting this copy.
      state.currentSelection = {
        type: "macro",
        mode: entry.trigger_mode === "hold_until_release" ? "hold" : "toggle",
        definition: structuredClone(entry),
      };
      ctx.stopListening();
    }
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  });

  const reimportBtn = popover.querySelector<HTMLButtonElement>(".binding-popover-reimport");
  reimportBtn?.addEventListener("click", () => {
    const selection = state.currentSelection;
    if (selection?.type !== "macro") {
      return;
    }

    const entry = state.savedMacros.find((candidate) => candidate.id === selection.definition.id);
    if (!entry) {
      return;
    }

    state.currentSelection = { ...selection, definition: structuredClone(entry) };
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  });

  const behaviorSelect = popover.querySelector<HTMLSelectElement>(".binding-popover-behavior-select");
  behaviorSelect?.addEventListener("change", () => {
    if (state.currentSelection?.type !== "macro") {
      return;
    }

    state.currentSelection = {
      ...state.currentSelection,
      mode: behaviorSelect.value === "hold" ? "hold" : "toggle",
    };
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  });

  cancelBtn.addEventListener("click", () => ctx.close());
  captureButtonEl.addEventListener("click", () => {
    if (state.pending) {
      return;
    }

    if (state.listening) {
      ctx.stopListening();
    } else {
      ctx.startListening();
    }
    state.currentError = "";
    ctx.render();
    ctx.positionPopover();
  });
  resetBtn.addEventListener("click", () => {
    void ctx.runAction(async () => {
      await options.onReset();
      ctx.close();
    });
  });
  saveBtn.addEventListener("click", () => {
    if (!state.currentSelection) {
      return;
    }

    const nextBinding = state.currentSelection;
    void ctx.runAction(async () => {
      await options.onSave(nextBinding);
      ctx.close();
    });
  });
}
