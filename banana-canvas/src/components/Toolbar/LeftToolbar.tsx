import { useCallback, useRef } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useGraphStore } from "../../stores/graphStore";
import { getUiTheme, iconButtonStyle, separatorStyle } from "../../styles/uiTheme";

interface LeftToolbarProps {
  onCreateNode: (screenX: number, screenY: number) => void;
}

const TOOLS = [
  { id: "select" as const, label: "\u2196", title: "\u9009\u62e9" },
  { id: "brush" as const, label: "\ud83d\udd8c\ufe0f", title: "\u753b\u7b14" },
  { id: "eraser" as const, label: "\u232b", title: "\u6a61\u76ae\u64e6" },
];

export function LeftToolbar({ onCreateNode }: LeftToolbarProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const ui = getUiTheme(isDark);
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
          background: ui.colors.panel,
          border: `1px solid ${ui.colors.borderSubtle}`,
          borderLeft: "none",
          borderRadius: `0 ${ui.radii.sm}px ${ui.radii.sm}px 0`,
          color: ui.colors.textSubtle,
          cursor: "pointer",
          fontSize: 10,
          boxShadow: ui.shadow.panel,
        }}
      >
        ▸
      </button>
    );
  }

  const btnStyle = (active: boolean, tone: "neutral" | "primary" | "danger" = "neutral"): React.CSSProperties =>
    iconButtonStyle(ui, { active, tone });

  return (
    <div
      className="fixed z-[100] flex flex-col items-center gap-0.5 py-2"
      style={{
        left: 0,
        top: 36,
        width: 36,
        bottom: 0,
        background: isDark
          ? "linear-gradient(180deg, #121217 0%, #0b0b0e 100%)"
          : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        borderRight: `1px solid ${ui.colors.borderSubtle}`,
        boxShadow: isDark ? "2px 0 16px rgba(0,0,0,0.24)" : "2px 0 16px rgba(24,24,27,0.08)",
      }}
    >
      {/* Create node */}
      <button ref={addBtnRef} type="button" onClick={handleCreateClick} style={btnStyle(true, "primary")} title="创建节点">
        ＋
      </button>

      <div style={separatorStyle(ui, false)} />

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

      <div style={separatorStyle(ui, false)} />

      {/* Clear doodles */}
      <button
        type="button"
        onClick={() => useGraphStore.getState().clearDoodleStrokes()}
        style={btnStyle(false, "danger")}
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
