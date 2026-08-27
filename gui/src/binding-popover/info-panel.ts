import type { PopoverContext, PopoverState } from "./types";

const CLOSE_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>`;

const INFO_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M8 7.1v4.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="8" cy="4.8" r="0.95" fill="currentColor" />
  </svg>`;

/// The icon pair in the popover's top-right corner.
export function renderToolbar(state: PopoverState): string {
  const disabled = state.pending ? "disabled" : "";

  return `<div class="binding-popover-toolbar">
      <button
        type="button"
        class="binding-popover-icon-btn binding-popover-info-open"
        aria-label="What these options do"
        title="What these options do"
        ${disabled}
      >${INFO_ICON}</button>
      <button
        type="button"
        class="binding-popover-icon-btn binding-popover-dismiss"
        aria-label="Close"
        title="Close"
        ${disabled}
      >${CLOSE_ICON}</button>
    </div>`;
}

/// The help overlay, covering the popover until dismissed. Kept out of the
/// main body so the binding controls themselves stay label-only.
export function renderInfoPanel(state: PopoverState): string {
  if (!state.showInfo) {
    return "";
  }

  return `<div class="binding-popover-info" role="dialog" aria-label="What these options do">
      <div class="binding-popover-info-head">
        <strong>What these options do</strong>
        <button
          type="button"
          class="binding-popover-icon-btn binding-popover-info-close"
          aria-label="Back to binding"
          title="Back to binding"
        >${CLOSE_ICON}</button>
      </div>
      <dl class="binding-popover-info-list">
        <dt>Turbo</dt>
        <dd>
          Off, the chord is held down for as long as the button is, and your
          system's own key repeat applies. On, the chord is tapped over and
          over at the interval you set instead, at a rate that ignores your
          system's repeat settings. Nothing stays held down in that mode.
          The interval will not go below 100&nbsp;ms — each tick fires the
          whole chord, and faster than that floods the receiving application.
        </dd>
        <dt>Toggle</dt>
        <dd>
          Makes the button latch. One press turns the binding on and it stays
          on — held down, or turbo-firing — until you press the button again
          to turn it off. Letting go in between does nothing.
        </dd>
        <dt>Override</dt>
        <dd>
          While this binding is held it takes sole use of the output —
          everything else being held is released first and stays silent, so a
          chord cannot be polluted by keys another binding is holding. They
          resume when you let go. If two Override bindings overlap, the one
          pressed first keeps priority and the other waits its turn.
        </dd>
      </dl>
    </div>`;
}

export function wireInfoPanel(ctx: PopoverContext) {
  const { popover, state } = ctx;

  const setInfo = (visible: boolean) => {
    state.showInfo = visible;
    ctx.render();
    ctx.positionPopover();
  };

  popover
    .querySelector<HTMLButtonElement>(".binding-popover-info-open")
    ?.addEventListener("click", () => setInfo(true));

  popover
    .querySelector<HTMLButtonElement>(".binding-popover-info-close")
    ?.addEventListener("click", () => setInfo(false));

  popover
    .querySelector<HTMLButtonElement>(".binding-popover-dismiss")
    ?.addEventListener("click", () => ctx.close());
}
