import { memo, useCallback } from "react";
import { ensureCustomOption, isCustomOption, isManualInputOption } from "./quickReplyOptionsUtils";

interface QuickReplyOptionsProps {
  options: string[];
  hint?: string;
  onSelect: (text: string) => void;
  onCustom?: () => void;
}

export const QuickReplyOptions = memo(function QuickReplyOptions({ options, hint, onSelect, onCustom }: QuickReplyOptionsProps) {
  const handleClick = useCallback((opt: string) => {
    if (isManualInputOption(opt)) {
      onCustom?.();
    } else {
      onSelect(opt);
    }
  }, [onSelect, onCustom]);

  const normalizedOptions = ensureCustomOption(options);
  if (normalizedOptions.length === 0) return null;

  return (
    <div style={{ marginTop: 4, marginBottom: 8 }}>
      {hint && (
        <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>{hint}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {normalizedOptions.map((opt) => {
          const isCustom = isCustomOption(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleClick(opt)}
              style={{
                padding: "3px 10px",
                borderRadius: 12,
                border: isCustom ? "1px dashed #f97316" : "1px solid #3f3f46",
                background: isCustom ? "rgba(249,115,22,0.08)" : "#18181b",
                color: isCustom ? "#f97316" : "#a1a1aa",
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
                e.currentTarget.style.borderColor = isCustom ? "1px dashed #f97316" : "#3f3f46";
                if (isCustom) {
                  e.currentTarget.style.borderColor = "#f97316";
                  e.currentTarget.style.borderStyle = "dashed";
                  e.currentTarget.style.background = "rgba(249,115,22,0.08)";
                } else {
                  e.currentTarget.style.borderColor = "#3f3f46";
                  e.currentTarget.style.background = "#18181b";
                }
                e.currentTarget.style.color = isCustom ? "#f97316" : "#a1a1aa";
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
});
