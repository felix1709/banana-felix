import { useCallback, useRef } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useGraphStore } from "../../stores/graphStore";

interface LeftToolbarProps {
  onCreateNode: (screenX: number, screenY: number) => void;
}

const TOOLS = [
  { id: "select" as const, label: "↖", title: "选择 (V)" },
  { id: "brush" as const, label: "🖌", title: "画笔 (B)" },
  { id: "eraser" as const, label: "⌫", title: "橡皮擦 (E)" },
];

export function LeftToolbar({ onCreateNode }: LeftToolbarProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const leftToolbarOpen = useUIStore((s) => s.leftToolbarOpen);
  const toggleLeftToolbar = useUIStore((s) => s.toggleLeftToolbar);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const handleCreateClick = useCallback(() => {
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      onCreateNode(rect.right + 4, rect.top);
    }
  }, [onCreateNode]);

  if (!leftToolbarOpen) {
    return (
      <button
        type="button"
        onClick={toggleLeftToolbar}
        className="fixed z-[100] flex items-center justify-center"
        style={{
          left: 0,
          top: 40,
          width: 20,
          height: 40,
          background: isDark ? "#09090b" : "#ffffff",
          border: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          color: isDark ? "#71717a" : "#a1a1aa",
          cursor: "pointer",
          fontSize: 10,
        }}
      >
        ▸
      </button>
    );
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    background: active ? "#3b82f6" : "transparent",
    color: active ? "#fff" : (isDark ? "#a1a1aa" : "#71717a"),
  });

  return (
    <div
      className="fixed z-[100] flex flex-col items-center gap-0.5 py-2"
      style={{
        left: 0,
        top: 36,
        width: 36,
        bottom: 0,
        background: isDark ? "#09090b" : "#ffffff",
        borderRight: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
      }}
    >
      {/* Create node */}
      <button ref={addBtnRef} type="button" onClick={handleCreateClick} style={btnStyle(false)} title="创建节点">
        ＋
      </button>

      <div style={{ width: 20, height: 1, background: isDark ? "#27272a" : "#e4e4e7", margin: "4px 0" }} />

      {/* Tools */}
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => setActiveTool(tool.id)}
          style={btnStyle(activeTool === tool.id)}
          title={tool.title}
        >
          {tool.label}
        </button>
      ))}

      <div style={{ width: 20, height: 1, background: isDark ? "#27272a" : "#e4e4e7", margin: "4px 0" }} />

      {/* Clear doodles */}
      <button
        type="button"
        onClick={() => useGraphStore.getState().clearDoodleStrokes()}
        style={btnStyle(false)}
        title="清空画笔内容"
      >
        🗑
      </button>

      <div style={{ flex: 1 }} />

      {/* Collapse */}
      <button
        type="button"
        onClick={toggleLeftToolbar}
        style={{ ...btnStyle(false), fontSize: 9 }}
        title="收起侧栏"
      >
        ◂
      </button>
    </div>
  );
}
