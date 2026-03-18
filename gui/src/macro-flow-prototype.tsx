import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

export interface MacroFlowItem {
  key: string;
  itemId?: number;
  kind: "action" | "wait" | "meta";
  label: string;
  secondary?: string;
  waitValue?: number;
  width: number;
  active: boolean;
  draggable: boolean;
}

interface MacroTimelineFlowProps {
  items: MacroFlowItem[];
  selectedItemIds: number[];
  onWaitChange: (itemId: number, value: number) => void;
  onRemove: (itemId: number) => void;
  onOrderChange: (orderedItemIds: number[]) => void;
  onSelectionChange: (selectedItemIds: number[]) => void;
}

interface MacroTimelineFlowApi {
  setState(state: { items: MacroFlowItem[]; selectedItemIds: number[] }): void;
  destroy(): void;
}

interface PendingDrag {
  pointerId: number;
  itemId: number;
  selectedItemIds: number[];
  startX: number;
  startY: number;
}

interface ActiveDrag {
  pointerId: number;
  selectedItemIds: number[];
  insertionIndex: number;
  x: number;
  y: number;
}

interface MarqueeSelection {
  pointerId: number;
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
}

const FLOW_DRAG_THRESHOLD = 6;

function isDraggableItem(item: MacroFlowItem): item is MacroFlowItem & { itemId: number } {
  return item.draggable && item.itemId !== undefined;
}

function arraysEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getDraggableItems(items: MacroFlowItem[]) {
  return items.filter(isDraggableItem);
}

function getOrderedDraggableIds(items: MacroFlowItem[]) {
  return getDraggableItems(items).map((item) => item.itemId);
}

function getLeadingFixedItems(items: MacroFlowItem[]) {
  const firstDraggableIndex = items.findIndex(isDraggableItem);
  return firstDraggableIndex === -1 ? items : items.slice(0, firstDraggableIndex);
}

function getTrailingFixedItems(items: MacroFlowItem[]) {
  const lastDraggableIndex = [...items].reverse().findIndex(isDraggableItem);
  if (lastDraggableIndex === -1) return [];
  return items.slice(items.length - lastDraggableIndex);
}

function getRemainingDraggableItems(items: MacroFlowItem[], selectedItemIds: number[]) {
  const selectedSet = new Set(selectedItemIds);
  return getDraggableItems(items).filter((item) => !selectedSet.has(item.itemId));
}

function getInitialInsertionIndex(items: MacroFlowItem[], selectedItemIds: number[]) {
  const selectedSet = new Set(selectedItemIds);
  const draggableIds = getOrderedDraggableIds(items);
  let remainingBefore = 0;

  for (const itemId of draggableIds) {
    if (selectedSet.has(itemId)) return remainingBefore;
    remainingBefore += 1;
  }

  return remainingBefore;
}

function buildMovedOrder(items: MacroFlowItem[], selectedItemIds: number[], insertionIndex: number) {
  const selectedSet = new Set(selectedItemIds);
  const draggableIds = getOrderedDraggableIds(items);
  const movingIds = draggableIds.filter((itemId) => selectedSet.has(itemId));
  const remainingIds = draggableIds.filter((itemId) => !selectedSet.has(itemId));
  const clampedIndex = Math.max(0, Math.min(insertionIndex, remainingIds.length));

  return [
    ...remainingIds.slice(0, clampedIndex),
    ...movingIds,
    ...remainingIds.slice(clampedIndex),
  ];
}

function getRangeSelection(items: MacroFlowItem[], anchorId: number, itemId: number) {
  const draggableIds = getOrderedDraggableIds(items);
  const anchorIndex = draggableIds.indexOf(anchorId);
  const itemIndex = draggableIds.indexOf(itemId);
  if (anchorIndex === -1 || itemIndex === -1) return [itemId];

  const start = Math.min(anchorIndex, itemIndex);
  const end = Math.max(anchorIndex, itemIndex);
  return draggableIds.slice(start, end + 1);
}

function pointInSurface(surface: HTMLElement, clientX: number, clientY: number) {
  const rect = surface.getBoundingClientRect();
  return {
    x: clientX - rect.left + surface.scrollLeft,
    y: clientY - rect.top + surface.scrollTop,
  };
}

const FlowChip: React.FC<{
  item: MacroFlowItem;
  selected: boolean;
  dragging?: boolean;
  onWaitChange: (itemId: number, value: number) => void;
  onRemove: (itemId: number) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  elementRef?: (element: HTMLDivElement | null) => void;
}> = ({
  item,
  selected,
  dragging = false,
  onWaitChange,
  onRemove,
  onPointerDown,
  elementRef,
}) => {
  const classes = [
    "macro-flow-chip",
    `macro-flow-chip-${item.kind}`,
    item.active ? "active" : "",
    selected ? "selected" : "",
    dragging ? "dragging" : "",
    item.draggable ? "draggable" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classes}
      style={{ width: `${item.width}px` }}
      onPointerDown={onPointerDown}
      ref={elementRef}
      data-flow-item-id={item.itemId}
    >
      {item.kind !== "meta" && item.itemId !== undefined ? (
        <div className="macro-flow-chip-order">{item.itemId}</div>
      ) : null}
      <div className="macro-flow-chip-body">
        {item.kind === "wait" ? (
          <>
            <span className="macro-flow-chip-label">Wait</span>
            <label className="macro-flow-chip-input">
              <input
                type="number"
                min="0"
                step="10"
                value={item.waitValue ?? 0}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  if (item.itemId === undefined) return;
                  onWaitChange(item.itemId, Number(event.target.value));
                }}
              />
              <span>ms</span>
            </label>
          </>
        ) : item.kind === "meta" ? (
          <>
            <span className="macro-flow-chip-label">{item.label}</span>
            <span className="macro-flow-chip-meta">{item.secondary ?? ""}</span>
          </>
        ) : (
          <>
            <span className="macro-flow-chip-input-name">{item.label}</span>
            <span className="macro-flow-chip-direction">{item.secondary ?? ""}</span>
          </>
        )}
      </div>
      {item.kind !== "meta" && item.itemId !== undefined ? (
        <button
          className="macro-flow-chip-remove"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onRemove(item.itemId!)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

const MacroTimelineFlow: React.FC<MacroTimelineFlowProps> = ({
  items,
  selectedItemIds,
  onWaitChange,
  onRemove,
  onOrderChange,
  onSelectionChange,
}) => {
  const [anchorId, setAnchorId] = useState<number | null>(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDrag | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gapRefs = useRef(new Map<number, HTMLDivElement>());
  const chipRefs = useRef(new Map<number, HTMLDivElement>());
  const itemsRef = useRef(items);
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const marqueeSelectionRef = useRef<MarqueeSelection | null>(null);
  const onOrderChangeRef = useRef(onOrderChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectedItemIdsRef = useRef(selectedItemIds);

  useEffect(() => {
    itemsRef.current = items;
    onOrderChangeRef.current = onOrderChange;
    onSelectionChangeRef.current = onSelectionChange;
    selectedItemIdsRef.current = selectedItemIds;
  }, [items, onOrderChange, onSelectionChange, selectedItemIds]);

  useEffect(() => {
    activeDragRef.current = activeDrag;
  }, [activeDrag]);

  useEffect(() => {
    pendingDragRef.current = pendingDrag;
  }, [pendingDrag]);

  useEffect(() => {
    marqueeSelectionRef.current = marqueeSelection;
  }, [marqueeSelection]);

  useEffect(() => {
    if (anchorId === null) return;
    if (!getOrderedDraggableIds(items).includes(anchorId)) {
      setAnchorId(null);
    }
  }, [anchorId, items]);

  const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const visibleDraggableItems = useMemo(
    () => (activeDrag ? getRemainingDraggableItems(items, activeDrag.selectedItemIds) : getDraggableItems(items)),
    [activeDrag, items]
  );
  const leadingItems = useMemo(() => getLeadingFixedItems(items), [items]);
  const trailingItems = useMemo(() => getTrailingFixedItems(items), [items]);

  function setGapRef(index: number, element: HTMLDivElement | null) {
    if (element) {
      gapRefs.current.set(index, element);
      return;
    }
    gapRefs.current.delete(index);
  }

  function setChipRef(itemId: number, element: HTMLDivElement | null) {
    if (element) {
      chipRefs.current.set(itemId, element);
      return;
    }
    chipRefs.current.delete(itemId);
  }

  function findClosestGapIndex(clientX: number, clientY: number) {
    let bestIndex = activeDragRef.current?.insertionIndex ?? 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [index, element] of gapRefs.current.entries()) {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = (centerX - clientX) ** 2 + (centerY - clientY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  function commitSelection(nextSelection: number[]) {
    if (arraysEqual(nextSelection, selectedItemIdsRef.current)) return;
    onSelectionChangeRef.current(nextSelection);
  }

  function getMarqueeSelectionIds(selection: MarqueeSelection) {
    const surface = surfaceRef.current;
    if (!surface) return [];

    const surfaceRect = surface.getBoundingClientRect();
    const left = Math.min(selection.anchorX, selection.currentX);
    const right = Math.max(selection.anchorX, selection.currentX);
    const top = Math.min(selection.anchorY, selection.currentY);
    const bottom = Math.max(selection.anchorY, selection.currentY);
    const result: number[] = [];

    for (const item of getDraggableItems(itemsRef.current)) {
      const element = chipRefs.current.get(item.itemId);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      const itemLeft = rect.left - surfaceRect.left + surface.scrollLeft;
      const itemTop = rect.top - surfaceRect.top + surface.scrollTop;
      const itemRight = itemLeft + rect.width;
      const itemBottom = itemTop + rect.height;

      if (itemLeft < right && itemRight > left && itemTop < bottom && itemBottom > top) {
        result.push(item.itemId);
      }
    }

    return result;
  }

  function handleChipPointerDown(item: MacroFlowItem & { itemId: number }, event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("input, button")) return;

    const pointerId = event.pointerId;
    let nextSelection = selectedItemIds;

    if (event.shiftKey) {
      const rangeSelection = getRangeSelection(items, anchorId ?? item.itemId, item.itemId);
      setAnchorId(item.itemId);
      commitSelection(rangeSelection);
      setPendingDrag(null);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      const toggled = selectedSet.has(item.itemId)
        ? selectedItemIds.filter((selectedId) => selectedId !== item.itemId)
        : [...selectedItemIds, item.itemId];
      setAnchorId(item.itemId);
      commitSelection(toggled);
      setPendingDrag(null);
      return;
    }

    if (!selectedSet.has(item.itemId) || selectedItemIds.length === 0) {
      nextSelection = [item.itemId];
      commitSelection(nextSelection);
    }

    setAnchorId(item.itemId);
    setPendingDrag({
      pointerId,
      itemId: item.itemId,
      selectedItemIds: nextSelection,
      startX: event.clientX,
      startY: event.clientY,
    });
    event.preventDefault();
  }

  function handleSurfacePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-flow-item-id], input, button")) return;
    setPendingDrag(null);
    setActiveDrag(null);
    const surface = surfaceRef.current;
    if (!surface) return;

    const point = pointInSurface(surface, event.clientX, event.clientY);
    const nextMarqueeSelection = {
      pointerId: event.pointerId,
      anchorX: point.x,
      anchorY: point.y,
      currentX: point.x,
      currentY: point.y,
    };

    setAnchorId(null);
    setMarqueeSelection(nextMarqueeSelection);
    commitSelection([]);
    event.preventDefault();
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const currentPendingDrag = pendingDragRef.current;
      const currentActiveDrag = activeDragRef.current;
      const currentMarqueeSelection = marqueeSelectionRef.current;

      if (currentPendingDrag && event.pointerId === currentPendingDrag.pointerId) {
        const distanceX = event.clientX - currentPendingDrag.startX;
        const distanceY = event.clientY - currentPendingDrag.startY;
        const distance = Math.hypot(distanceX, distanceY);

        if (distance >= FLOW_DRAG_THRESHOLD) {
          setActiveDrag({
            pointerId: currentPendingDrag.pointerId,
            selectedItemIds: currentPendingDrag.selectedItemIds,
            insertionIndex: getInitialInsertionIndex(itemsRef.current, currentPendingDrag.selectedItemIds),
            x: event.clientX,
            y: event.clientY,
          });
          setPendingDrag(null);
        }
        return;
      }

      if (currentMarqueeSelection && event.pointerId === currentMarqueeSelection.pointerId) {
        const surface = surfaceRef.current;
        if (!surface) return;
        const point = pointInSurface(surface, event.clientX, event.clientY);
        const nextMarqueeSelection = {
          ...currentMarqueeSelection,
          currentX: point.x,
          currentY: point.y,
        };
        setMarqueeSelection(nextMarqueeSelection);
        commitSelection(getMarqueeSelectionIds(nextMarqueeSelection));
        return;
      }

      if (!currentActiveDrag || event.pointerId !== currentActiveDrag.pointerId) return;

      setActiveDrag({
        ...currentActiveDrag,
        x: event.clientX,
        y: event.clientY,
        insertionIndex: findClosestGapIndex(event.clientX, event.clientY),
      });
    }

    function handlePointerUp(event: PointerEvent) {
      const currentPendingDrag = pendingDragRef.current;
      const currentActiveDrag = activeDragRef.current;
      const currentMarqueeSelection = marqueeSelectionRef.current;

      if (currentPendingDrag && event.pointerId === currentPendingDrag.pointerId) {
        setPendingDrag(null);
        return;
      }

      if (currentMarqueeSelection && event.pointerId === currentMarqueeSelection.pointerId) {
        setMarqueeSelection(null);
        return;
      }

      if (!currentActiveDrag || event.pointerId !== currentActiveDrag.pointerId) return;

      const nextOrder = buildMovedOrder(
        itemsRef.current,
        currentActiveDrag.selectedItemIds,
        currentActiveDrag.insertionIndex
      );
      const currentOrder = getOrderedDraggableIds(itemsRef.current);

      if (!arraysEqual(nextOrder, currentOrder)) {
        onOrderChangeRef.current(nextOrder);
      }

      setActiveDrag(null);
      setPendingDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  function renderDragPreview() {
    if (!activeDrag) return null;

    return (
      <div
        className="macro-flow-drag-preview"
        style={{
          left: `${activeDrag.x + 14}px`,
          top: `${activeDrag.y + 14}px`,
        }}
      >
        Moving {activeDrag.selectedItemIds.length} item{activeDrag.selectedItemIds.length === 1 ? "" : "s"}
      </div>
    );
  }

  function renderMarqueeSelection() {
    if (!marqueeSelection) return null;

    const left = Math.min(marqueeSelection.anchorX, marqueeSelection.currentX);
    const top = Math.min(marqueeSelection.anchorY, marqueeSelection.currentY);
    const width = Math.abs(marqueeSelection.currentX - marqueeSelection.anchorX);
    const height = Math.abs(marqueeSelection.currentY - marqueeSelection.anchorY);

    return (
      <div
        className="macro-flow-marquee"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
    );
  }

  function renderGap(index: number) {
    const classes = [
      "macro-flow-gap",
      activeDrag ? "drag-active" : "",
      activeDrag && activeDrag.insertionIndex === index ? "target" : "",
    ].filter(Boolean).join(" ");

    return (
      <div
        key={`gap-${index}`}
        ref={(element) => setGapRef(index, element)}
        className={classes}
        data-flow-gap-index={index}
      />
    );
  }

  function renderDraggableItems() {
    if (!activeDrag) {
      return getDraggableItems(items).map((item) => (
        <FlowChip
          key={item.key}
          item={item}
          selected={selectedSet.has(item.itemId)}
          onWaitChange={onWaitChange}
          onRemove={onRemove}
          onPointerDown={(event) => handleChipPointerDown(item, event)}
          elementRef={(element) => setChipRef(item.itemId, element)}
        />
      ));
    }

    const rendered: React.ReactNode[] = [];

    for (let index = 0; index <= visibleDraggableItems.length; index += 1) {
      rendered.push(renderGap(index));

      const item = visibleDraggableItems[index];
      if (!item) continue;

      rendered.push(
        <FlowChip
          key={item.key}
          item={item}
          selected={selectedSet.has(item.itemId)}
          onWaitChange={onWaitChange}
          onRemove={onRemove}
          onPointerDown={(event) => handleChipPointerDown(item, event)}
          elementRef={(element) => setChipRef(item.itemId, element)}
        />
      );
    }

    return rendered;
  }

  if (items.length === 0) {
    return (
      <div className="macro-flow-root">
        <div className="macro-flow-surface">
          <div className="macro-empty">No timeline items recorded yet.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="macro-flow-root">
      <div ref={surfaceRef} className="macro-flow-surface" onPointerDown={handleSurfacePointerDown}>
        <div className="macro-flow-list">
          {leadingItems.map((item) => (
            <FlowChip
              key={item.key}
              item={item}
              selected={false}
              onWaitChange={onWaitChange}
              onRemove={onRemove}
            />
          ))}
          {renderDraggableItems()}
          {trailingItems.map((item) => (
            <FlowChip
              key={item.key}
              item={item}
              selected={false}
              onWaitChange={onWaitChange}
              onRemove={onRemove}
            />
          ))}
        </div>
        {renderMarqueeSelection()}
      </div>
      {renderDragPreview()}
    </div>
  );
};

export function createMacroTimelineFlow(
  container: HTMLElement,
  options: {
    onWaitChange: (itemId: number, value: number) => void;
    onRemove: (itemId: number) => void;
    onOrderChange: (orderedItemIds: number[]) => void;
    onSelectionChange: (selectedItemIds: number[]) => void;
  }
): MacroTimelineFlowApi {
  const root = createRoot(container);

  function render(items: MacroFlowItem[], selectedItemIds: number[]) {
    root.render(
      <MacroTimelineFlow
        items={items}
        selectedItemIds={selectedItemIds}
        onWaitChange={options.onWaitChange}
        onRemove={options.onRemove}
        onOrderChange={options.onOrderChange}
        onSelectionChange={options.onSelectionChange}
      />
    );
  }

  render([], []);

  return {
    setState(state) {
      render(state.items, state.selectedItemIds);
    },
    destroy() {
      root.unmount();
    },
  };
}
