import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  Node,
  Edge,
  BackgroundVariant,
  Controls,
  Background,
  useNodesState,
  NodeTypes,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  applyKeyboardJoystickState,
  clearKeyboardJoystickAnalog,
  createKeyboardJoystickState,
  isKeyboardJoystickDirectionCode,
  resetKeyboardJoystickState,
  setKeyboardJoystickAnalog,
  setKeyboardJoystickDirection,
} from './keyboard-joystick';

interface DeviceLayout {
  device: {
    name: string;
    vendor_id: number;
    product_id: number;
    rows?: number;
    cols?: number;
    layout_type?: string;
  };
  buttons: Array<{
    id: number;
    label: string;
    row?: number;
    col?: number;
    x?: number;
    y?: number;
    is_joystick?: boolean;
    colspan?: number;
    rowspan?: number;
  }>;
}

interface ButtonNodeData {
  id: number;
  label: string;
  is_joystick?: boolean;
  isPressed?: boolean;
  colspan?: number;
  rowspan?: number;
}

// Custom button node component
const ButtonNode: React.FC<{ data: ButtonNodeData }> = ({ data }) => {
  // Match View Mode dimensions exactly
  const baseWidth = 70;
  const baseHeight = 90;
  const width = baseWidth * (data.colspan || 1);
  const height = baseHeight * (data.rowspan || 1);

  if (data.is_joystick) {
    return (
      <div
        className="react-flow-button joystick"
        style={{
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        <div className="joystick-display" data-joystick-display>
          Keyboard Joystick
        </div>
        <div className="joystick-circle">
          <div className="joystick-puck" data-joystick-puck></div>
          <span className="joystick-dir joystick-w" data-joystick-dir="up">W</span>
          <span className="joystick-dir joystick-a" data-joystick-dir="left">A</span>
          <span className="joystick-dir joystick-s" data-joystick-dir="down">S</span>
          <span className="joystick-dir joystick-d" data-joystick-dir="right">D</span>
        </div>
        <div className="joystick-label-bottom">
          {data.label}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            fontSize: '10px',
            color: '#606080',
          }}
        >
          #{data.id}
        </div>
      </div>
    );
  }

  return (
    <div
      className="react-flow-button"
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: VIEW_LABEL_COLOR }}>
        {data.label}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '4px',
          left: '4px',
          fontSize: '10px',
          color: '#606080',
        }}
      >
        #{data.id}
      </div>
    </div>
  );
};

const nodeTypes: NodeTypes = {
  buttonNode: ButtonNode,
};

const VIEW_LABEL_COLOR = 'rgb(128, 128, 144)';
const AUTO_FIT_PADDING_PX = 20;
const AUTO_FIT_MAX_ZOOM = 1;

interface LayoutEditorProps {
  layout: DeviceLayout;
  onSave?: (updatedLayout: DeviceLayout) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onButtonStateChange?: (code: number, pressed: boolean) => void;
  buttonStateRef?: React.MutableRefObject<(
    code: number,
    pressed: boolean,
    options?: { suppressPhysical?: boolean }
  ) => void>;
  joystickVectorRef?: React.MutableRefObject<((x: number, y: number) => void) | null>;
  clearStateRef?: React.MutableRefObject<(() => void) | null>;
  dirtyStateRef?: React.MutableRefObject<boolean>;
  saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

const LayoutEditorInner: React.FC<LayoutEditorProps> = ({
  layout,
  onSave,
  onDirtyChange,
  buttonStateRef,
  joystickVectorRef,
  clearStateRef,
  dirtyStateRef,
  saveRef,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const edges: Edge[] = [];
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [snapToGrid, setSnapToGrid] = useState(false);
  const { setViewport } = useReactFlow();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const baselineFingerprintRef = useRef("");
  const dirtyRef = useRef(false);
  const joystickStateRef = useRef(createKeyboardJoystickState());

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const setDirtyState = useCallback((nextDirty: boolean) => {
    if (dirtyRef.current === nextDirty) {
      return;
    }
    dirtyRef.current = nextDirty;
    if (dirtyStateRef) {
      dirtyStateRef.current = nextDirty;
    }
    onDirtyChange?.(nextDirty);
  }, [dirtyStateRef, onDirtyChange]);

  const buildLayoutFromNodes = useCallback((targetNodes: Node[]): DeviceLayout => {
    const updatedButtons = layout.buttons.map((btn) => {
      const node = targetNodes.find((candidate) => candidate.id === `button-${btn.id}`);
      if (!node) {
        console.warn(`[LayoutEditor] Node not found for button ${btn.id}`);
        return {
          ...btn,
          x: 0,
          y: 0,
        };
      }

      return {
        id: btn.id,
        label: btn.label,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        is_joystick: btn.is_joystick,
        colspan: btn.colspan,
        rowspan: btn.rowspan,
      };
    });

    return {
      ...layout,
      device: {
        ...layout.device,
        layout_type: 'custom',
      },
      buttons: updatedButtons,
    };
  }, [layout]);

  const fingerprintNodes = useCallback((targetNodes: Node[]) => {
    return targetNodes
      .map((node) => ({
        id: node.id,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        colspan: node.data.colspan || 1,
        rowspan: node.data.rowspan || 1,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => `${node.id}:${node.x}:${node.y}:${node.colspan}:${node.rowspan}`)
      .join("|");
  }, []);

  const applyAutoViewport = useCallback((targetNodes: Node[], duration = 0) => {
    const viewportEl = viewportRef.current;
    if (!viewportEl || targetNodes.length === 0) {
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    targetNodes.forEach((node) => {
      const nodeWidth = 70 * (node.data.colspan || 1);
      const nodeHeight = 90 * (node.data.rowspan || 1);

      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + nodeWidth);
      maxY = Math.max(maxY, node.position.y + nodeHeight);
    });

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const contentWidth = boundsWidth + AUTO_FIT_PADDING_PX * 2;
    const contentHeight = boundsHeight + AUTO_FIT_PADDING_PX * 2;
    const availableWidth = viewportEl.clientWidth;
    const availableHeight = viewportEl.clientHeight;

    if (!availableWidth || !availableHeight || !contentWidth || !contentHeight) {
      return;
    }

    const zoom = Math.min(
      AUTO_FIT_MAX_ZOOM,
      availableWidth / contentWidth,
      availableHeight / contentHeight,
    );

    const x = (availableWidth - contentWidth * zoom) / 2 + (-minX + AUTO_FIT_PADDING_PX) * zoom;
    const y = (availableHeight - contentHeight * zoom) / 2 + (-minY + AUTO_FIT_PADDING_PX) * zoom;

    void setViewport({ x, y, zoom }, { duration });
  }, [setViewport]);

  const scheduleAutoViewport = useCallback((targetNodes: Node[], duration = 0) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyAutoViewport(targetNodes, duration);
      });
    });
  }, [applyAutoViewport]);

  // Expose setButtonState via ref — use direct DOM manipulation for instant feedback
  useEffect(() => {
    if (buttonStateRef) {
      buttonStateRef.current = (
        code: number,
        pressed: boolean,
        options?: { suppressPhysical?: boolean }
      ) => {
        const nodeEl = document.querySelector(`[data-id="button-${code}"] .react-flow-button`);
        if (nodeEl && !options?.suppressPhysical) {
          nodeEl.classList.toggle('active', pressed);
        } else if (nodeEl && options?.suppressPhysical && !isKeyboardJoystickDirectionCode(code)) {
          nodeEl.classList.remove('active');
        }

        if (setKeyboardJoystickDirection(joystickStateRef.current, code, pressed)) {
          document.querySelectorAll<HTMLElement>('.react-flow-button.joystick').forEach((joystickEl) => {
            applyKeyboardJoystickState(joystickEl, joystickStateRef.current);
          });
        }
      };
    }
  }, [buttonStateRef]);

  useEffect(() => {
    if (!joystickVectorRef) {
      return;
    }

    joystickVectorRef.current = (x: number, y: number) => {
      setKeyboardJoystickAnalog(joystickStateRef.current, x, y);
      document.querySelectorAll<HTMLElement>('.react-flow-button.joystick').forEach((joystickEl) => {
        applyKeyboardJoystickState(joystickEl, joystickStateRef.current);
      });
    };

    return () => {
      joystickVectorRef.current = null;
    };
  }, [joystickVectorRef]);

  useEffect(() => {
    if (!clearStateRef) {
      return;
    }

    clearStateRef.current = () => {
      document.querySelectorAll<HTMLElement>('.react-flow-button.active').forEach((nodeEl) => {
        nodeEl.classList.remove('active');
      });
      resetKeyboardJoystickState(joystickStateRef.current);
      clearKeyboardJoystickAnalog(joystickStateRef.current);
      document.querySelectorAll<HTMLElement>('.react-flow-button.joystick').forEach((joystickEl) => {
        applyKeyboardJoystickState(joystickEl, joystickStateRef.current);
      });
    };

    return () => {
      clearStateRef.current = null;
    };
  }, [clearStateRef]);

  // Convert layout buttons to React Flow nodes
  useEffect(() => {
    const baseSize = 80;
    const gap = 10;

    console.log('Creating nodes from layout:', layout);

    const initialNodes: Node[] = layout.buttons.map((btn) => {
      let x = 0;
      let y = 0;

      // ALWAYS prefer row/col if available, since that's the canonical position
      // x/y are only used when row/col don't exist (pure custom layouts)
      if (btn.row !== undefined && btn.col !== undefined) {
        // Grid-based positioning - convert to absolute
        x = btn.col * (baseSize + gap);
        y = btn.row * (baseSize + gap);
        console.log(`Button ${btn.id} (${btn.label}): converting grid (${btn.row}, ${btn.col}) to position (${x}, ${y})`);
      } else if (btn.x !== undefined && btn.y !== undefined) {
        // Pure custom absolute positioning (no grid fallback)
        x = btn.x;
        y = btn.y;
        console.log(`Button ${btn.id}: using custom position (${x}, ${y})`);
      } else {
        console.warn(`Button ${btn.id}: no position information!`, btn);
      }

      return {
        id: `button-${btn.id}`,
        type: 'buttonNode',
        position: { x, y },
        data: {
          id: btn.id,
          label: btn.label,
          is_joystick: btn.is_joystick,
          isPressed: false,
          colspan: btn.colspan,
          rowspan: btn.rowspan,
        },
        draggable: true,
      };
    });

    baselineFingerprintRef.current = fingerprintNodes(initialNodes);
    if (dirtyStateRef) {
      dirtyStateRef.current = false;
    }
    setNodes(initialNodes);
    setDirtyState(false);
    scheduleAutoViewport(initialNodes);
    resetKeyboardJoystickState(joystickStateRef.current);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>('.react-flow-button.joystick').forEach((joystickEl) => {
          applyKeyboardJoystickState(joystickEl, joystickStateRef.current);
        });
      });
    });
  }, [dirtyStateRef, fingerprintNodes, layout, scheduleAutoViewport, setDirtyState, setNodes]);

  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }
    const nextDirty = fingerprintNodes(nodes) !== baselineFingerprintRef.current;
    setDirtyState(nextDirty);
  }, [fingerprintNodes, nodes, setDirtyState]);

  useEffect(() => {
    const viewportEl = viewportRef.current;
    if (!viewportEl) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      applyAutoViewport(nodesRef.current);
    });
    resizeObserver.observe(viewportEl);

    return () => {
      resizeObserver.disconnect();
    };
  }, [applyAutoViewport]);

  const handleCenter = useCallback(() => {
    if (nodes.length === 0) return;
    applyAutoViewport(nodes, 300);
  }, [applyAutoViewport, nodes]);

  const handleSave = useCallback(async () => {
    console.log('[LayoutEditor] ========== SAVE BUTTON CLICKED ==========');

    if (!onSave) {
      console.error('[LayoutEditor] NO onSave callback provided!');
      return false;
    }

    console.log('[LayoutEditor] Total nodes:', nodes.length);
    console.log('[LayoutEditor] Total buttons in layout:', layout.buttons.length);

    setSaveStatus('saving');

    try {
      const updatedLayout = buildLayoutFromNodes(nodes);

      console.log('[LayoutEditor] Updated layout created');
      console.log('[LayoutEditor] layout_type:', updatedLayout.device.layout_type);
      console.log('[LayoutEditor] Sample buttons (first 3):', updatedLayout.buttons.slice(0, 3));
      console.log('[LayoutEditor] Calling onSave callback NOW...');

      await onSave(updatedLayout);

      console.log('[LayoutEditor] onSave callback completed successfully');
      baselineFingerprintRef.current = fingerprintNodes(nodes);
      setDirtyState(false);
      setSaveStatus('success');

      // Reset to idle after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    } catch (error) {
      console.error('[LayoutEditor] Save error:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return false;
    }
  }, [buildLayoutFromNodes, fingerprintNodes, layout.buttons.length, nodes, onSave, setDirtyState]);

  useEffect(() => {
    if (!saveRef) {
      return;
    }
    saveRef.current = handleSave;
    return () => {
      saveRef.current = null;
    };
  }, [handleSave, saveRef]);

  const handleReset = useCallback(() => {
    // Reset to grid layout
    const baseSize = 80;
    const gap = 10;

    const resetNodes: Node[] = layout.buttons.map((btn) => {
      const x = (btn.col ?? 0) * (baseSize + gap);
      const y = (btn.row ?? 0) * (baseSize + gap);

      return {
        id: `button-${btn.id}`,
        type: 'buttonNode',
        position: { x, y },
        data: {
          id: btn.id,
          label: btn.label,
          is_joystick: btn.is_joystick,
          isPressed: false,
          colspan: btn.colspan,
          rowspan: btn.rowspan,
        },
        draggable: true,
      };
    });

    setNodes(resetNodes);
    scheduleAutoViewport(resetNodes);
  }, [layout, scheduleAutoViewport, setNodes]);

  return (
    <div ref={viewportRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        minZoom={0.1}
        maxZoom={2}
        snapToGrid={snapToGrid}
        snapGrid={[10, 10]}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={[1, 2]}
        selectionOnDrag={false}
      >
        <Controls />
        <Background color="#2a2a4a" gap={16} size={1} variant={BackgroundVariant.Dots} />
        <Panel position="top-left" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: '#252545',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#e0e0e0',
            cursor: 'pointer',
            userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Snap to Grid
          </label>
          <button
            onClick={() => {
              console.log('Current nodes:', nodes);
              console.log('Node count:', nodes.length);
              nodes.forEach(node => {
                console.log(`  ${node.id}: (${node.position.x}, ${node.position.y})`);
              });
            }}
            style={{
              padding: '6px 12px',
              background: '#3a3a5a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Debug Positions
          </button>
        </Panel>
        <Panel position="top-right" style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleCenter}
            style={{
              padding: '8px 16px',
              background: '#0f7dff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Center View
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 16px',
              background: '#3a3a5a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset to Grid
          </button>
          {onSave && (
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{
                padding: '8px 16px',
                background:
                  saveStatus === 'saving' ? '#666' :
                  saveStatus === 'success' ? '#00dd00' :
                  saveStatus === 'error' ? '#dd0000' :
                  '#00aa00',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                opacity: saveStatus === 'saving' ? 0.7 : 1,
              }}
            >
              {saveStatus === 'saving' ? 'Saving...' :
               saveStatus === 'success' ? 'Saved!' :
               saveStatus === 'error' ? 'Error!' :
               'Save Layout'}
            </button>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
};

export const LayoutEditor: React.FC<LayoutEditorProps> = (props) => {
  return (
    <ReactFlowProvider>
      <LayoutEditorInner {...props} />
    </ReactFlowProvider>
  );
};

export interface LayoutEditorHandle {
  setButtonState(
    code: number,
    pressed: boolean,
    options?: { suppressPhysical?: boolean }
  ): void;
  setJoystickVector(x: number, y: number): void;
  clearAll(): void;
  hasUnsavedChanges(): boolean;
  save(): Promise<boolean>;
  destroy(): void;
}

/**
 * Create a React Flow-based layout editor.
 *
 * @param container - The DOM element to render into
 * @param layout - The device layout to edit
 * @param options - Configuration options
 * @returns API for controlling the editor
 */
export function createLayoutEditor(
  container: HTMLElement,
  layout: DeviceLayout,
  options?: {
    onSave?: (updatedLayout: DeviceLayout) => void;
    onDirtyChange?: (dirty: boolean) => void;
  }
): LayoutEditorHandle {
  const root = createRoot(container);

  const buttonStateRef = React.createRef<(
    code: number,
    pressed: boolean,
    options?: { suppressPhysical?: boolean }
  ) => void>() as React.MutableRefObject<(
    code: number,
    pressed: boolean,
    options?: { suppressPhysical?: boolean }
  ) => void>;
  const joystickVectorRef = React.createRef<((x: number, y: number) => void) | null>() as React.MutableRefObject<((x: number, y: number) => void) | null>;
  const clearStateRef = React.createRef<(() => void) | null>() as React.MutableRefObject<(() => void) | null>;
  const dirtyStateRef = React.createRef<boolean>() as React.MutableRefObject<boolean>;
  const saveRef = React.createRef<(() => Promise<boolean>) | null>() as React.MutableRefObject<(() => Promise<boolean>) | null>;
  dirtyStateRef.current = false;

  root.render(
    <LayoutEditor
      layout={layout}
      onSave={options?.onSave}
      onDirtyChange={options?.onDirtyChange}
      buttonStateRef={buttonStateRef}
      joystickVectorRef={joystickVectorRef}
      clearStateRef={clearStateRef}
      dirtyStateRef={dirtyStateRef}
      saveRef={saveRef}
    />
  );

  return {
    setButtonState: (code: number, pressed: boolean, options?: { suppressPhysical?: boolean }) => {
      if (buttonStateRef.current) {
        buttonStateRef.current(code, pressed, options);
      }
    },
    setJoystickVector: (x: number, y: number) => {
      joystickVectorRef.current?.(x, y);
    },
    clearAll: () => {
      if (clearStateRef.current) {
        clearStateRef.current();
      }
    },
    hasUnsavedChanges: () => dirtyStateRef.current === true,
    save: async () => {
      if (!saveRef.current) {
        return false;
      }
      return await saveRef.current();
    },
    destroy: () => {
      root.unmount();
    },
  };
}
