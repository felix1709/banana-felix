import { memo, useState, useCallback, useEffect, useRef } from "react";
import { useAgentStore } from "../../stores/agentStore";
import type { SessionIndexEntry } from "../../types/agent";

interface SessionHistoryPanelProps {
  open: boolean;
  onClose: () => void;
}

export const SessionHistoryPanel = memo(function SessionHistoryPanel({ open, onClose }: SessionHistoryPanelProps) {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const switchToSession = useAgentStore((s) => s.switchToSession);
  const deleteSession = useAgentStore((s) => s.deleteSession);

  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions;

  const handleSwitch = useCallback((id: string) => {
    switchToSession(id);
    onClose();
  }, [switchToSession, onClose]);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(id);
  }, [deleteSession]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(9,9,11,0.97)",
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Search */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #27272a" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索会话..."
          autoFocus
          style={{
            width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 6,
            border: "1px solid #3f3f46", background: "#0f0f0f", color: "#e4e4e7", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 12px", color: "#52525b", fontSize: 12 }}>
            {search ? "未找到匹配的会话" : "暂无历史会话"}
          </div>
        )}
        {filtered.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            active={session.id === activeSessionId}
            onSwitch={handleSwitch}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Close button */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #27272a" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%", padding: "6px 0", borderRadius: 6, border: "1px solid #3f3f46",
            background: "transparent", color: "#a1a1aa", fontSize: 11, cursor: "pointer",
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
});

interface SessionRowProps {
  session: SessionIndexEntry;
  active: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

const SessionRow = memo(function SessionRow({ session, active, onSwitch, onDelete }: SessionRowProps) {
  const dateStr = new Date(session.updatedAt).toLocaleDateString(undefined, {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      onClick={() => onSwitch(session.id)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", cursor: "pointer",
        background: active ? "rgba(249,115,22,0.1)" : "transparent",
        borderLeft: active ? "2px solid #f97316" : "2px solid transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: active ? "#f97316" : "#e4e4e7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {session.title}
        </div>
        <div style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>
          {dateStr} · {session.messageCount}条消息
        </div>
      </div>
      {!active && (
        <button
          type="button"
          onClick={(e) => onDelete(session.id, e)}
          title="删除会话"
          style={{
            background: "none", border: "none", color: "#52525b", cursor: "pointer",
            fontSize: 12, padding: "2px 4px", borderRadius: 3,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#52525b"; }}
        >
          X
        </button>
      )}
    </div>
  );
});
