import type { PopoverContext } from "./types";
import { clamp } from "./utils";

export function positionPopover(ctx: PopoverContext) {
  const { popover, state } = ctx;
  if (!state.currentOptions || !state.currentAnchorEl) {
    return;
  }

  const anchorRect = state.currentAnchorEl.getBoundingClientRect();
  if (!anchorRect.width || !anchorRect.height) {
    return;
  }

  popover.hidden = false;
  const { width: panelWidth, height: panelHeight } = popover.getBoundingClientRect();
  const margin = 16;
  const gap = 20;

  const canFitRight = anchorRect.right + gap + panelWidth + margin <= window.innerWidth;
  const canFitLeft = anchorRect.left - gap - panelWidth - margin >= 0;
  const side = canFitRight || !canFitLeft ? "right" : "left";

  const top = clamp(
    anchorRect.top + anchorRect.height / 2 - panelHeight / 2,
    margin,
    window.innerHeight - panelHeight - margin,
  );
  const left = side === "right"
    ? Math.min(anchorRect.right + gap, window.innerWidth - panelWidth - margin)
    : Math.max(anchorRect.left - panelWidth - gap, margin);
  const anchorOffset = clamp(
    anchorRect.top + anchorRect.height / 2 - top,
    28,
    Math.max(panelHeight - 28, 28),
  );

  popover.dataset.side = side;
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.style.setProperty("--binding-popover-anchor-offset", `${anchorOffset}px`);
}
