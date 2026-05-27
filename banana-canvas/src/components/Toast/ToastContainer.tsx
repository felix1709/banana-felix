import { useUIStore } from "../../stores/uiStore";
import type { Toast } from "../../stores/uiStore";

const ICONS: Record<Toast["type"], string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const COLORS: Record<Toast["type"], { bg: string; border: string; icon: string }> = {
  success: { bg: "#052e16", border: "#16a34a", icon: "#4ade80" },
  error: { bg: "#450a0a", border: "#dc2626", icon: "#f87171" },
  warning: { bg: "#451a03", border: "#d97706", icon: "#fbbf24" },
  info: { bg: "#0c1b33", border: "#2563eb", icon: "#60a5fa" },
};

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2"
      style={{ bottom: 16, right: 16, maxWidth: 360 }}
    >
      {toasts.map((t) => {
        const c = COLORS[t.type];
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              background: c.bg,
              border: `1px solid ${c.border}`,
              color: "#e4e4e7",
              fontSize: 13,
              animation: "toast-in 0.25s ease-out",
            }}
          >
            <span style={{ color: c.icon, fontSize: 14, flexShrink: 0 }}>{ICONS[t.type]}</span>
            <span style={{ flex: 1 }}>{t.msg}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              style={{
                background: "transparent",
                border: "none",
                color: "#71717a",
                cursor: "pointer",
                fontSize: 12,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
