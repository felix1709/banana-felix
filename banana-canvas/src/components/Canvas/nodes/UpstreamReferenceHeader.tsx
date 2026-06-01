import { memo, useCallback } from "react";
import type { MouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "../../../stores/graphStore";
import { stripReferenceMention } from "./referenceRemoval";

interface UpstreamReferenceHeaderProps {
  targetNodeId: string;
  reference: {
    edgeId?: string;
    nodeId: string;
    nodeName: string;
    nodeType?: string;
    content?: string;
  };
  isDark: boolean;
  promptValue?: string;
  onPromptChange?: (nextPrompt: string) => void;
  onRemove?: () => void;
}

export const UpstreamReferenceHeader = memo(function UpstreamReferenceHeader({
  targetNodeId,
  reference,
  isDark,
  promptValue,
  onPromptChange,
  onRemove,
}: UpstreamReferenceHeaderProps) {
  const { setEdges: setXyEdges } = useReactFlow();

  const handleRemove = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (reference.edgeId) {
      useGraphStore.getState().removeEdge(reference.edgeId);
      setXyEdges((edges) => edges.filter((edge) => edge.id !== reference.edgeId));
    } else {
      const matchingEdges = useGraphStore.getState().edges.filter(
        (edge) => edge.to === targetNodeId && edge.from === reference.nodeId,
      );
      for (const edge of matchingEdges) useGraphStore.getState().removeEdge(edge.id);
      setXyEdges((edges) => edges.filter(
        (edge) => !(edge.target === targetNodeId && edge.source === reference.nodeId),
      ));
    }

    if (promptValue !== undefined && onPromptChange) {
      onPromptChange(stripReferenceMention(promptValue, reference.nodeName));
    }
    onRemove?.();
  }, [onPromptChange, onRemove, promptValue, reference.edgeId, reference.nodeId, reference.nodeName, setXyEdges, targetNodeId]);

  const isImage = reference.nodeType === "input-image" || reference.nodeType === "gen-image";
  const isVideo = reference.nodeType === "video-input" || reference.nodeType === "gen-video";
  const isAudio = reference.nodeType === "audio-input" || reference.nodeType === "gen-music";

  return (
    <div
      className="flex items-center gap-1.5 px-1.5 py-1 rounded border nodrag"
      title={`@${reference.nodeName}`}
      style={{
        background: isDark ? "#18181b" : "#fafafa",
        borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        color: isDark ? "#e4e4e7" : "#18181b",
      }}
    >
      <span className="text-[9px] shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>
        引用
      </span>
      {isImage && reference.content && (
        <img src={reference.content} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
      )}
      {isVideo && <span className="text-[9px] shrink-0" style={{ color: "#f97316" }}>VID</span>}
      {isAudio && <span className="text-[9px] shrink-0" style={{ color: "#22c55e" }}>AUD</span>}
      <span className="text-[10px] truncate min-w-0 flex-1" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
        @{reference.nodeName}
      </span>
      <button
        type="button"
        className="nodrag shrink-0"
        aria-label={`删除引用 ${reference.nodeName}`}
        title={`删除引用 ${reference.nodeName}`}
        onClick={handleRemove}
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: "none",
          background: "transparent",
          color: "#ef4444",
          fontSize: 10,
          lineHeight: 1,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        X
      </button>
    </div>
  );
});
