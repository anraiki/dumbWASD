export const BUTTON_BASE_WIDTH = 70;
export const BUTTON_BASE_HEIGHT = 90;
export const BUTTON_SPAN_GAP = 10;

export function getButtonDimensions(options: {
  colspan?: number;
  rowspan?: number;
}) {
  const colSpan = options.colspan || 1;
  const rowSpan = options.rowspan || 1;

  return {
    width: BUTTON_BASE_WIDTH * colSpan + BUTTON_SPAN_GAP * (colSpan - 1),
    height: BUTTON_BASE_HEIGHT * rowSpan + BUTTON_SPAN_GAP * (rowSpan - 1),
  };
}
