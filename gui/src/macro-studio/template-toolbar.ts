import type { MacroStudioState } from "./state";
import { toolbarIcon } from "./utils";

export function buildToolbar(state: MacroStudioState): string {
  return `
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
            <span class="macro-toolbar-label">Key Delay</span>
            <div class="macro-stepper">
              <button class="macro-stepper-btn" type="button" data-stepper-field="keydelay" data-stepper-delta="-5" aria-label="Decrease delay between inputs">&minus;</button>
              <label class="macro-stepper-value">
                <input id="macro-key-delay" type="number" min="0" step="5" value="${state.keyDelayMs}" />
                <span>ms</span>
              </label>
              <button class="macro-stepper-btn" type="button" data-stepper-field="keydelay" data-stepper-delta="5" aria-label="Increase delay between inputs">+</button>
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

          <div class="macro-toolbar-group">
            <span class="macro-toolbar-label">Insert</span>
            <div class="macro-insert">
              <button id="macro-insert-wait-btn" class="btn btn-action macro-insert-btn" type="button" title="Append a wait step">＋ Wait</button>
              <button id="macro-insert-rumble-btn" class="btn btn-action macro-insert-btn" type="button" title="Append a rumble step">＋ Rumble</button>
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
                id="macro-clean-btn"
                class="macro-icon-btn"
                type="button"
                title="Clean: remove every input from this macro"
                aria-label="Clean: remove every input from this macro"
              >
                ${toolbarIcon("clean")}
                <span class="sr-only">Clean macro inputs</span>
              </button>
              <button
                id="macro-clear-btn"
                class="macro-icon-btn"
                type="button"
                title="Clear macro and playback log"
                aria-label="Clear macro and playback log"
              >
                ${toolbarIcon("trash")}
                <span class="sr-only">Clear macro and playback log</span>
              </button>
              <span class="macro-transport-divider" aria-hidden="true"></span>
              <button id="macro-script-test-btn" class="btn btn-action macro-script-test-btn" type="button">
                Run 10s Test
              </button>
            </div>
          </div>
        </section>
  `;
}
