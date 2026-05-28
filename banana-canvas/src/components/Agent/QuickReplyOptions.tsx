import { memo, useCallback } from "react";

interface QuickReplyOptionsProps {
  options: string[];
  hint?: string;
  onSelect: (text: string) => void;
}

export const QuickReplyOptions = memo(function QuickReplyOptions({ options, hint, onSelect }: QuickReplyOptionsProps) {
  const handleClick = useCallback((opt: string) => {
    onSelect(opt);
  }, [onSelect]);

  if (options.length === 0) return null;

  return (
    <div style={{ marginTop: 4, marginBottom: 8 }}>
      {hint && (
        <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>{hint}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => handleClick(opt)}
            style={{
              padding: "3px 10px",
              borderRadius: 12,
              border: "1px solid #3f3f46",
              background: "#18181b",
              color: "#a1a1aa",
              fontSize: 11,
              cursor: "pointer",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#f97316";
              e.currentTarget.style.color = "#f97316";
              e.currentTarget.style.background = "rgba(249,115,22,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#3f3f46";
              e.currentTarget.style.color = "#a1a1aa";
              e.currentTarget.style.background = "#18181b";
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
});
