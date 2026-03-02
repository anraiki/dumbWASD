import React, { useCallback, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

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
        <div style={{ fontSize: '10px', color: '#808090', textAlign: 'center' }}>
          Keyboard Joystick
        </div>
        <div
          style={{
            position: 'relative',
            width: '80px',
            height: '80px',
            background: '#0a0a0f',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ position: 'absolute', top: '8px', fontSize: '11px', fontWeight: 600, color: '#808090' }}>W</span>
          <span style={{ position: 'absolute', left: '8px', fontSize: '11px', fontWeight: 600, color: '#808090' }}>A</span>
          <span style={{ position: 'absolute', bottom: '8px', fontSize: '11px', fontWeight: 600, color: '#808090' }}>S</span>
          <span style={{ position: 'absolute', right: '8px', fontSize: '11px', fontWeight: 600, color: '#808090' }}>D</span>
        </div>
        <div style={{ fontSize: '11px', color: '#808090', textAlign: 'center' }}>
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
      <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
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

interface LayoutEditorProps {
  layout: DeviceLayout;
  onSave?: (updatedLayout: DeviceLayout) => void;
  onButtonStateChange?: (code: number, pressed: boolean) => void;
  buttonStateRef?: React.MutableRefObject<(code: number, pressed: boolean) => void>;
}

const LayoutEditorInner: React.FC<LayoutEditorProps> = ({ layout, onSave, buttonStateRef }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [snapToGrid, setSnapToGrid] = useState(false);
  const { fitView } = useReactFlow();

  // Expose setButtonState via ref — use direct DOM manipulation for instant feedback
  useEffect(() => {
    if (buttonStateRef) {
      buttonStateRef.current = (code: number, pressed: boolean) => {
        const nodeEl = document.querySelector(`[data-id="button-${code}"] .react-flow-button`);
        if (nodeEl) {
          nodeEl.classList.toggle('active', pressed);
        }
      };
    }
  }, [buttonStateRef]);

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

    setNodes(initialNodes);
  }, [layout, setNodes]);

  const handleCenter = useCallback(() => {
    if (nodes.length === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
      // Match the button dimensions from ButtonNode component
      const nodeWidth = 70 * (node.data.colspan || 1);
      const nodeHeight = 90 * (node.data.rowspan || 1);

      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + nodeWidth);
      maxY = Math.max(maxY, node.position.y + nodeHeight);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;

    console.log('[LayoutEditor] Bounding box:', { minX, minY, maxX, maxY });
    console.log('[LayoutEditor] Center:', { centerX, centerY });
    console.log('[LayoutEditor] Size:', { width, height });

    // Fit view to the bounding box with padding
    fitView({
      padding: 0.2,
      duration: 300,
      minZoom: 0.1,
      maxZoom: 2,
    });
  }, [nodes, fitView]);

  const handleSave = useCallback(async () => {
    console.log('[LayoutEditor] ========== SAVE BUTTON CLICKED ==========');

    if (!onSave) {
      console.error('[LayoutEditor] NO onSave callback provided!');
      return;
    }

    console.log('[LayoutEditor] Total nodes:', nodes.length);
    console.log('[LayoutEditor] Total buttons in layout:', layout.buttons.length);

    setSaveStatus('saving');

    try {
      // Convert React Flow nodes back to layout format
      const updatedButtons = layout.buttons.map((btn) => {
        const node = nodes.find((n) => n.id === `button-${btn.id}`);
        if (!node) {
          console.warn(`[LayoutEditor] Node not found for button ${btn.id}`);
          return {
            ...btn,
            x: 0,
            y: 0,
          };
        }

        const updated = {
          id: btn.id,
          label: btn.label,
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
          is_joystick: btn.is_joystick,
          colspan: btn.colspan,
          rowspan: btn.rowspan,
        };

        return updated;
      });

      const updatedLayout: DeviceLayout = {
        ...layout,
        device: {
          ...layout.device,
          layout_type: 'custom',
        },
        buttons: updatedButtons,
      };

      console.log('[LayoutEditor] Updated layout created');
      console.log('[LayoutEditor] layout_type:', updatedLayout.device.layout_type);
      console.log('[LayoutEditor] Sample buttons (first 3):', updatedLayout.buttons.slice(0, 3));
      console.log('[LayoutEditor] Calling onSave callback NOW...');

      await onSave(updatedLayout);

      console.log('[LayoutEditor] onSave callback completed successfully');
      setSaveStatus('success');

      // Reset to idle after 2 seconds
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[LayoutEditor] Save error:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [nodes, layout, onSave]);

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
  }, [layout, setNodes]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        snapToGrid={snapToGrid}
        snapGrid={[10, 10]}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={[1, 2]}
        selectionOnDrag={false}
      >
        <Controls />
        <Background color="#2a2a4a" gap={16} size={1} variant="dots" />
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

export const LayoutEditor: React.FC<LayoutEditorProps> = React.forwardRef<any, LayoutEditorProps>((props, ref) => {
  return (
    <ReactFlowProvider>
      <LayoutEditorInner {...props} buttonStateRef={ref as any} />
    </ReactFlowProvider>
  );
});

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
  }
) {
  const root = createRoot(container);

  const buttonStateRef = React.createRef<(code: number, pressed: boolean) => void>() as React.MutableRefObject<(code: number, pressed: boolean) => void>;

  root.render(
    <LayoutEditor
      ref={buttonStateRef}
      layout={layout}
      onSave={options?.onSave}
    />
  );

  return {
    setButtonState: (code: number, pressed: boolean) => {
      if (buttonStateRef.current) {
        buttonStateRef.current(code, pressed);
      }
    },
    destroy: () => {
      root.unmount();
    },
  };
}
