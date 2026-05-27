import { useEffect, useRef } from "react";
import { useGraphStore } from "../../stores/graphStore";
import { useUIStore } from "../../stores/uiStore";
import { v4 as uuid } from "uuid";

const MENU_ITEMS: Record<string, { label: string; action: string }[]> = {
  canvas: [
    { label: "创建节点", action: "create-node" },
    { label: "全选 (Ctrl+A)", action: "select-all" },
  ],
  node: [
    { label: "复制节点 (Ctrl+D)", action: "copy-node" },
    { label: "删除节点 (Delete)", action: "delete-node" },
    { label: "断开所有连线", action: "disconnect-node" },
  ],
  "multi-select": [
    { label: "删除选中 (Delete)", action: "delete-selected" },
  ],
  edge: [
    { label: "删除连线", action: "delete-edge" },
  ],
};

interface ContextMenuProps {
  x: number;
  y: number;
  type: "canvas" | "node" | "edge" | "multi-select" | "preview" | "image-input";
  targetId?: string;
  onClose: () => void;
  onCreateNode: (screenX: number, screenY: number) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function CanvasContextMenu({ x, y, type, targetId, onClose, onCreateNode, onDeleteNode, onDeleteEdge }: ContextMenuProps) {
  const theme = useUIStore((s) => s.theme);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const nodes = useGraphStore((s) => s.nodes);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const isDark = theme === "dark";
  const items = MENU_ITEMS[type] || MENU_ITEMS.canvas;

  const handleAction = (action: string) => {
    switch (action) {
      case "create-node":
        onCreateNode(x, y);
        break;
      case "delete-node":
        if (targetId) onDeleteNode(targetId);
        break;
      case "delete-edge":
        if (targetId) onDeleteEdge(targetId);
        break;
      case "copy-node": {
        if (targetId) {
          const src = nodes.find((n) => n.id === targetId);
          if (src) {
            useGraphStore.getState().addNode({
              ...src,
              id: uuid(),
              x: src.x + 30,
              y: src.y + 30,
            });
          }
        }
        break;
      }
      case "delete-selected":
        for (const id of selectedNodeIds) onDeleteNode(id);
        break;
      case "select-all": {
        const allIds = new Set(nodes.map((n) => n.id));
        useGraphStore.getState().selectNodes(allIds);
        break;
      }
      case "disconnect-node":
        if (targetId) {
          const graphEdges = useGraphStore.getState().edges;
          for (const e of graphEdges) {
            if (e.from === targetId || e.to === targetId) removeEdge(e.id);
          }
        }
        break;
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-[100] min-w-44 rounded-lg shadow-2xl border overflow-hidden py-1"
      style={{
        left: x,
        top: y,
        background: isDark ? "#18181b" : "#ffffff",
        borderColor: isDark ? "#3f3f46" : "#d4d4d8",
      }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          className="w-full text-left px-3 py-2 text-xs"
          style={{ color: isDark ? "#f4f4f5" : "#18181b" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = isDark ? "#27272a" : "#f4f4f5";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          onClick={() => handleAction(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
