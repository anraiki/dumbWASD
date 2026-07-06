import type { MacroStudioState } from "./state";
import { toolbarIcon } from "./utils";

export interface MacroStudioRefs {
  librarySelect: HTMLSelectElement;
  saveMacroBtn: HTMLButtonElement;
  deleteMacroBtn: HTMLButtonElement;
  leadInInput: HTMLInputElement;
  iterationsInput: HTMLInputElement;
  pauseInput: HTMLInputElement;
  holdModeBtn: HTMLButtonElement;
  executeModeBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
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
        <section class="macro-command-bar macro-card">
          <div class="macro-toolbar-group">
            <span class="macro-toolbar-label">Macro</span>
            <div class="macro-library">
              <select id="macro-library-select" class="macro-library-select">
                <option value="">New macro…</option>
              </select>
              <button id="macro-save-btn" class="btn btn-action macro-library-btn" type="button">Save</button>
              <button id="macro-delete-btn" class="btn btn-action macro-library-btn" type="button">Delete</button>
            </div>
          </div>

          <div class="macro-toolbar-group">
            <span class="macro-toolbar-label">Playback Mode</span>
            <div class="macro-mode-switch">
              <button id="macro-mode-hold" class="macro-mode-btn" type="button">Hold until release</button>
              <button id="macro-mode-execute" class="macro-mode-btn active" type="button">Execute at once</button>
            </div>
          </div>

          <div class="macro-toolbar-group">
            <span class="macro-toolbar-label">Lead-in</span>
            <div class="macro-stepper">
              <button class="macro-stepper-btn" type="button" data-stepper-field="lead" data-stepper-delta="-10" aria-label="Decrease lead-in">&minus;</button>
              <label class="macro-stepper-value">
                <input id="macro-lead-in" type="number" min="0" step="10" value="${state.leadInMs}" />
                <span>ms</span>
              </label>
              <button class="macro-stepper-btn" type="button" data-stepper-field="lead" data-stepper-delta="10" aria-label="Increase lead-in">+</button>
            </div>
          </div>

          <div class="macro-toolbar-group">
            <span class="macro-toolbar-label">Iterations</span>
            <div class="macro-stepper">
              <button class="macro-stepper-btn" type="button" data-stepper-field="iterations" data-stepper-delta="-1" aria-label="Decrease iterations">&minus;</button>
              <label class="macro-stepper-value">
                <input id="macro-iterations" type="number" min="1" step="1" value="${state.iterations}" />
              </label>
              <button class="macro-stepper-btn" type="button" data-stepper-field="iterations" data-stepper-delta="1" aria-label="Increase iterations">+</button>
            </div>
          </div>

          <div class="macro-toolbar-group">
            <span class="macro-toolbar-label">Pause / Loop</span>
            <div class="macro-stepper">
              <button class="macro-stepper-btn" type="button" data-stepper-field="pause" data-stepper-delta="-10" aria-label="Decrease pause between loops">&minus;</button>
              <label class="macro-stepper-value">
                <input id="macro-pause" type="number" min="0" step="10" value="${state.pauseBetweenIterationsMs}" />
                <span>ms</span>
              </label>
              <button class="macro-stepper-btn" type="button" data-stepper-field="pause" data-stepper-delta="10" aria-label="Increase pause between loops">+</button>
            </div>
          </div>

          <div class="macro-toolbar-group macro-transport-group">
            <span class="macro-toolbar-label">Transport</span>
            <div class="macro-transport">
              <button
                id="macro-record-btn"
                class="macro-icon-btn macro-record-btn"
                type="button"
                title="Start recording"
                aria-label="Start recording"
              >
                <span class="macro-record-glyph" aria-hidden="true"></span>
                <span class="sr-only">Start recording</span>
              </button>
              <button
                id="macro-play-btn"
                class="macro-icon-btn"
                type="button"
                title="Test run"
                aria-label="Test run"
              >
                ${toolbarIcon("play")}
                <span class="sr-only">Test run</span>
              </button>
              <button
                id="macro-stop-btn"
                class="macro-icon-btn"
                type="button"
                title="Stop"
                aria-label="Stop"
              >
                ${toolbarIcon("stop")}
                <span class="sr-only">Stop</span>
              </button>
              <button
                id="macro-clear-btn"
                class="macro-icon-btn"
                type="button"
                title="Clear macro"
                aria-label="Clear macro"
              >
                ${toolbarIcon("trash")}
                <span class="sr-only">Clear macro</span>
              </button>
              <span class="macro-transport-divider" aria-hidden="true"></span>
              <button id="macro-script-test-btn" class="btn btn-action macro-script-test-btn" type="button">
                Run 10s Test
              </button>
            </div>
          </div>
        </section>

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
    iterationsInput: host.querySelector<HTMLInputElement>("#macro-iterations")!,
    pauseInput: host.querySelector<HTMLInputElement>("#macro-pause")!,
    holdModeBtn: host.querySelector<HTMLButtonElement>("#macro-mode-hold")!,
    executeModeBtn: host.querySelector<HTMLButtonElement>("#macro-mode-execute")!,
    recordBtn: host.querySelector<HTMLButtonElement>("#macro-record-btn")!,
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
