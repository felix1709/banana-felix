import { memo, useCallback } from "react";
import { useAgentStore } from "../../stores/agentStore";

export const JiaojiaoBubble = memo(function JiaojiaoBubble() {
  const panelOpen = useAgentStore((s) => s.panelOpen);
  const status = useAgentStore((s) => s.status);
  const togglePanel = useAgentStore((s) => s.togglePanel);

  const handleClick = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

  const isActive = status !== "idle";

  return (
    <button
      type="button"
      onClick={handleClick}
      className="jiaojiao-bubble"
      style={{
        position: "fixed",
        bottom: 20,
        left: panelOpen ? 420 : 48,
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
        background: isActive
          ? "linear-gradient(135deg, #f97316, #eab308)"
          : "linear-gradient(135deg, #facc15, #f97316)",
        boxShadow: isActive
          ? "0 0 20px rgba(249, 115, 22, 0.5), 0 2px 8px rgba(0,0,0,0.3)"
          : "0 2px 8px rgba(0,0,0,0.3)",
        transition: "left 0.3s ease, box-shadow 0.3s ease",
      }}
      title="蕉蕉 Agent"
    >
      🍌
    </button>
  );
});
