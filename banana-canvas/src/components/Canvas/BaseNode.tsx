import { memo, type ReactNode, useCallback, useRef, useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { useUIStore } from "../../stores/uiStore";
import { useGraphStore } from "../../stores/graphStore";
import { NODE_TYPE_LABELS } from "../../types/node";
import type { NodeType } from "../../types/node";

export interface PortConfig {
  id: string;
  label?: string;
  position?: number; // fractional offset from top (0-1), default 0.5
}

interface BaseNodeProps {
  id: string;
  type: NodeType;
  children: ReactNode;
  showInput?: boolean;
  showOutput?: boolean;
  inputPorts?: PortConfig[];
  outputPorts?: PortConfig[];
  badge?: string;
  generationStatus?: "generating" | "completed" | null;
  selected?: boolean;
  nodeName?: string;
  actions?: ReactNode;
  titleCenter?: ReactNode;
}

export const NODE_PORT_CONFIG: Partial<Record<NodeType, { inputs: PortConfig[]; outputs: PortConfig[] }>> = {
  "input-image": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "video-input": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "text-node": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "video-analyze": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "image-compare": {
    inputs: [
      { id: "default", label: "左图", position: 0.35 },
      { id: "right", label: "右图", position: 0.65 },
    ],
    outputs: [{ id: "default" }],
  },
  "gen-image": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "gen-video": {
    inputs: [{ id: "default", label: "参考", position: 0.5 }],
    outputs: [{ id: "default", position: 0.5 }],
  },
  preview: { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "local-save": { inputs: [{ id: "default" }], outputs: [] },
  // ── 镜头运动组 ──
  "global-perspective": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "camera-movement": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "professional-camera": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "motion-control": { inputs: [{ id: "default" }, { id: "video", label: "参考视频", position: 0.7 }], outputs: [{ id: "default" }] },
  // ── 工具辅助组 ──
  "canvas-node": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "doodle-canvas": { inputs: [], outputs: [{ id: "default" }] },
  "gen-music": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "custom-agent": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  // ── 图片处理组 ──
  "inpaint-crop": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "inpaint-stitch": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "jimeng-super-resolution": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "topaz-upscale": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  // ── 影视创作组 ──
  "extract-characters-scenes": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "character-description": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "scene-description": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "create-character": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "create-scene": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "generate-character-video": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "generate-scene-video": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "generate-character-image": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
  "generate-scene-image": { inputs: [{ id: "default" }], outputs: [{ id: "default" }] },
};

export const BaseNode = memo(function BaseNode({
  id,
  type: nodeType,
  children,
  showInput = true,
  showOutput = true,
  inputPorts,
  outputPorts,
  badge,
  generationStatus,
  selected = false,
  nodeName,
  actions,
  titleCenter,
}: BaseNodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const connectingTarget = useUIStore((s) => s.connectingTarget);
  const isTarget = connectingTarget === id;

  // Read nodeName from graphStore (single source of truth)
  const storedNodeName = useGraphStore((s) => s.nodes.find((n) => n.id === id)?.nodeName);
  const displayName = storedNodeName || nodeName || NODE_TYPE_LABELS[nodeType];

  // Delete handler
  const removeNode = useGraphStore((s) => s.removeNode);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeNode(id);
    setXyNodes((nds) => nds.filter((n) => n.id !== id));
    setXyEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, removeNode, setXyNodes, setXyEdges]);

  const portConfig = NODE_PORT_CONFIG[nodeType];
  const resolvedInputs = inputPorts ?? portConfig?.inputs;
  const resolvedOutputs = outputPorts ?? portConfig?.outputs;

  const handleStyle = (position: Position, port?: PortConfig): React.CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: isDark ? "#52525b" : "#a1a1aa",
    border: `2px solid ${isDark ? "#71717a" : "#d4d4d8"}`,
    top: `${(port?.position ?? 0.5) * 100}%`,
    transform: "translate(-50%, -50%)",
    ...(position === Position.Left ? { left: 0 } : { right: 0, transform: "translate(50%, -50%)" }),
  });

  const renderHandles = (
    ports: PortConfig[] | undefined,
    type: "target" | "source",
    fallback: boolean,
    position: Position,
    defaultId: string,
  ) => {
    const portList = ports && ports.length > 0 ? ports : (fallback ? [{ id: defaultId }] : []);

    return portList.map((port) => (
      <Handle
        key={port.id}
        type={type}
        position={position}
        id={port.id}
        style={handleStyle(position, port)}
      >
        {port.label && (
          <span
            className="absolute text-[9px] whitespace-nowrap pointer-events-none"
            style={{
              color: isDark ? "#a1a1aa" : "#71717a",
              ...(position === Position.Left
                ? { left: 12, top: -2 }
                : { right: 12, top: -2 }),
            }}
          >
            {port.label}
          </span>
        )}
      </Handle>
    ));
  };

  // ── Resize handle ──
  const resizeStart = useRef<{ w: number; h: number; x: number; y: number } | null>(null);

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const node = useGraphStore.getState().nodes.find((n) => n.id === id);
    if (!node) return;
    resizeStart.current = { w: node.width, h: node.height, x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [id]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeStart.current) return;
    const { w, h, x } = resizeStart.current;
    const dx = e.clientX - x;
    const aspectRatio = w / h;
    // Use the larger delta to drive proportional scaling
    const newW = Math.max(120, w + dx);
    const newH = Math.max(80, newW / aspectRatio);
    useGraphStore.getState().updateNode(id, { width: newW, height: newH });
    setXyNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, width: newW, height: newH }, style: { ...n.style, width: newW } }
          : n,
      ),
    );
  }, [id, setXyNodes]);

  const onResizePointerUp = useCallback(() => {
    resizeStart.current = null;
  }, []);

  // ── Node name editing ──
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const startEditing = useCallback(() => {
    setEditName(displayName);
    setEditing(true);
  }, [displayName]);

  const confirmEdit = useCallback(() => {
    useGraphStore.getState().updateNode(id, { nodeName: editName });
    setXyNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label: editName } } : n,
      ),
    );
    setEditing(false);
  }, [id, editName, setXyNodes]);

  return (
    <div
      className={`rounded-lg border shadow-lg transition-all duration-150 ${
        isTarget
          ? "shadow-green-400/40 border-green-400 ring-2 ring-green-400/40"
          : selected
            ? "shadow-blue-500/30 border-blue-500 ring-2 ring-blue-500/40"
            : isDark
              ? "border-zinc-700"
              : "border-zinc-300"
      }`}
      style={{
        background: isDark ? "#18181b" : "#ffffff",
        minWidth: 120,
        minHeight: 60,
      }}
    >
      <style>{`@keyframes gen-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      {renderHandles(resolvedInputs, "target", !portConfig && showInput, Position.Left, "default")}

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b"
        style={{
          background: isDark ? "#27272a" : "#f4f4f5",
          borderColor: selected ? "#3b82f6" : isDark ? "#3f3f46" : "#d4d4d8",
        }}
      >
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={confirmEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            title="编辑节点名称"
            placeholder="节点名称"
            className="nodrag text-xs font-medium bg-transparent outline-none border-b border-blue-500 w-28"
            style={{ color: isDark ? "#f4f4f5" : "#18181b" }}
          />
        ) : (
          <span
            className="text-xs font-medium truncate cursor-text nodrag"
            style={{ color: isDark ? "#f4f4f5" : "#18181b" }}
            onClick={startEditing}
          >
            {displayName}
          </span>
        )}
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
            {badge}
          </span>
        )}
        {generationStatus === "generating" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full nodrag" style={{
            background: "rgba(239, 68, 68, 0.15)",
            color: "#ef4444",
            animation: "gen-pulse 1.5s ease-in-out infinite",
          }}>
            正在生成
          </span>
        )}
        {generationStatus === "completed" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
            background: "rgba(34, 197, 94, 0.15)",
            color: "#22c55e",
          }}>
            生成完成
          </span>
        )}
        {titleCenter && <div className="flex-1 text-center truncate">{titleCenter}</div>}
        {actions && <div className="ml-auto shrink-0 flex items-center gap-1">{actions}</div>}
      </div>

      {/* Content */}
      <div className="p-2">
        {children}
      </div>

      {renderHandles(resolvedOutputs, "source", !portConfig && showOutput, Position.Right, "default")}

      {/* Resize handle — bottom-right corner */}
      <div
        className="nodrag"
        style={{
          position: "absolute",
          right: 2,
          bottom: 2,
          width: 14,
          height: 14,
          cursor: "nwse-resize",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M9 1L1 9" stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M9 5L5 9" stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M9 9L9 9" stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Delete button — top-right outside, shown when selected */}
      {selected && (
        <button
          type="button"
          onClick={handleDelete}
          className="nodrag"
          style={{
            position: "absolute",
            top: -8,
            right: -8,
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid #18181b",
            background: "#ef4444",
            color: "#ffffff",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            cursor: "pointer",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            transition: "transform 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          title="删除节点"
        >
          ×
        </button>
      )}
    </div>
  );
});
