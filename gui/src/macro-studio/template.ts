import type { MacroStudioState } from "./state";
import { buildToolbar } from "./template-toolbar";

export interface MacroStudioRefs {
  librarySelect: HTMLSelectElement;
  saveMacroBtn: HTMLButtonElement;
  deleteMacroBtn: HTMLButtonElement;
  leadInInput: HTMLInputElement;
  keyDelayInput: HTMLInputElement;
  iterationsInput: HTMLInputElement;
  pauseInput: HTMLInputElement;
  holdModeBtn: HTMLButtonElement;
  executeModeBtn: HTMLButtonElement;
  insertWaitBtn: HTMLButtonElement;
  insertRumbleBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  cleanBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  playBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
  scriptTestBtn: HTMLButtonElement;
  visualTabBtn: HTMLButtonElement;
  codeTabBtn: HTMLButtonElement;
  logBtn: HTMLButtonElement;
  timelineStats: HTMLElement;
  visualPanel: HTMLElement;
  codePanel: HTMLElement;
  flowHost: HTMLElement;
  codeEditor: HTMLTextAreaElement;
  copyCodeBtn: HTMLButtonElement;
  resetCodeBtn: HTMLButtonElement;
  codeStatus: HTMLElement;
  playbackModal: HTMLElement;
  playbackModalCloseBtn: HTMLButtonElement;
  playbackLog: HTMLElement;
  surfacePreview: HTMLElement;
}

export function buildTemplate(state: MacroStudioState): string {
  return `
      <div class="macro-sequencer">
        ${buildToolbar(state)}

        <div class="macro-tab-row">
          <div class="macro-tab-strip">
            <button id="macro-tab-visual" class="macro-tab-btn active" type="button">Visual Builder</button>
            <button id="macro-tab-code" class="macro-tab-btn" type="button">Code View</button>
            <button id="macro-tab-log" class="macro-tab-btn macro-tab-utility" type="button">Playback Log</button>
          </div>
          <span id="macro-timeline-stats" class="macro-timeline-stats"></span>
        </div>

        <div id="macro-visual-panel" class="macro-tab-panel active">
          <section class="macro-timeline-card macro-card">
            <div id="macro-timeline-flow" class="macro-timeline-flow"></div>
          </section>

          <section class="macro-card macro-keyinput-card">
            <div class="macro-keyinput-header">
              <span class="macro-toolbar-label">Key Input</span>
              <span class="macro-keyinput-hint">Click a key to append a press to the timeline</span>
            </div>
            <div id="macro-surface-preview" class="macro-surface-preview"></div>
          </section>
        </div>

        <div id="macro-code-panel" class="macro-tab-panel">
          <section class="macro-card macro-code-card">
            <div class="macro-section-header">
              <div>
                <h3>Shareable Code View</h3>
                <p>The code mirrors the builder timeline: press down, wait, press up.</p>
              </div>
              <div class="macro-code-actions">
                <button id="macro-reset-code" class="btn btn-action" type="button">Reset from Builder</button>
                <button id="macro-copy-code" class="btn btn-action" type="button">Copy Code</button>
              </div>
            </div>
            <textarea id="macro-code-editor" class="macro-code-editor" spellcheck="false"></textarea>
            <div class="macro-code-footer">
              <span id="macro-code-status">Generated from macro builder</span>
            </div>
          </section>
        </div>

        <div id="macro-playback-modal" class="macro-playback-modal">
          <div class="macro-playback-dialog macro-card">
            <div class="macro-section-header">
              <div>
                <h3>Playback Log</h3>
                <p>Safe UI test run. No real input is fired yet.</p>
              </div>
              <button id="macro-playback-close" class="macro-playback-close" type="button">Close</button>
            </div>
            <div id="macro-playback-log" class="macro-playback-log"></div>
          </div>
        </div>
      </div>
    `;
}

export function collectRefs(host: HTMLElement): MacroStudioRefs {
  return {
    librarySelect: host.querySelector<HTMLSelectElement>("#macro-library-select")!,
    saveMacroBtn: host.querySelector<HTMLButtonElement>("#macro-save-btn")!,
    deleteMacroBtn: host.querySelector<HTMLButtonElement>("#macro-delete-btn")!,
    leadInInput: host.querySelector<HTMLInputElement>("#macro-lead-in")!,
    keyDelayInput: host.querySelector<HTMLInputElement>("#macro-key-delay")!,
    iterationsInput: host.querySelector<HTMLInputElement>("#macro-iterations")!,
    pauseInput: host.querySelector<HTMLInputElement>("#macro-pause")!,
    holdModeBtn: host.querySelector<HTMLButtonElement>("#macro-mode-hold")!,
    executeModeBtn: host.querySelector<HTMLButtonElement>("#macro-mode-execute")!,
    insertWaitBtn: host.querySelector<HTMLButtonElement>("#macro-insert-wait-btn")!,
    insertRumbleBtn: host.querySelector<HTMLButtonElement>("#macro-insert-rumble-btn")!,
    recordBtn: host.querySelector<HTMLButtonElement>("#macro-record-btn")!,
    cleanBtn: host.querySelector<HTMLButtonElement>("#macro-clean-btn")!,
    clearBtn: host.querySelector<HTMLButtonElement>("#macro-clear-btn")!,
    playBtn: host.querySelector<HTMLButtonElement>("#macro-play-btn")!,
    stopBtn: host.querySelector<HTMLButtonElement>("#macro-stop-btn")!,
    scriptTestBtn: host.querySelector<HTMLButtonElement>("#macro-script-test-btn")!,
    visualTabBtn: host.querySelector<HTMLButtonElement>("#macro-tab-visual")!,
    codeTabBtn: host.querySelector<HTMLButtonElement>("#macro-tab-code")!,
    logBtn: host.querySelector<HTMLButtonElement>("#macro-tab-log")!,
    timelineStats: host.querySelector<HTMLElement>("#macro-timeline-stats")!,
    visualPanel: host.querySelector<HTMLElement>("#macro-visual-panel")!,
    codePanel: host.querySelector<HTMLElement>("#macro-code-panel")!,
    flowHost: host.querySelector<HTMLElement>("#macro-timeline-flow")!,
    codeEditor: host.querySelector<HTMLTextAreaElement>("#macro-code-editor")!,
    copyCodeBtn: host.querySelector<HTMLButtonElement>("#macro-copy-code")!,
    resetCodeBtn: host.querySelector<HTMLButtonElement>("#macro-reset-code")!,
    codeStatus: host.querySelector<HTMLElement>("#macro-code-status")!,
    playbackModal: host.querySelector<HTMLElement>("#macro-playback-modal")!,
    playbackModalCloseBtn: host.querySelector<HTMLButtonElement>("#macro-playback-close")!,
    playbackLog: host.querySelector<HTMLElement>("#macro-playback-log")!,
    surfacePreview: host.querySelector<HTMLElement>("#macro-surface-preview")!,
  };
}
