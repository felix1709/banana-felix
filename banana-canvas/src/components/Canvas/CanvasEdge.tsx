import { memo } from "react";
import {
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useUIStore } from "../../stores/uiStore";
import { useJobStore } from "../../stores/jobStore";

export const CanvasEdge = memo(function CanvasEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { getEdges } = useReactFlow();

  // Check if either endpoint node has an active (running) job
  const hasActiveJob = useJobStore(
    (s) => s.jobs.some(
      (j) => (j.nodeId === source || j.nodeId === target) && j.status === "running",
    ),
  );

  const parallelEdges = getEdges()
    .filter((e) => e.source === source && e.target === target)
    .sort((a, b) => a.id.localeCompare(b.id));

  const parallelIndex = parallelEdges.findIndex((e) => e.id === id);
  const parallelCount = parallelEdges.length;

  const curvature =
    parallelCount <= 1
      ? 0.4
      : 0.4 + (parallelIndex - (parallelCount - 1) / 2) * 0.25;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature,
  });

  const mainColor = selected
    ? "#3b82f6"
    : isDark
      ? "#71717a"
      : "#a1a1aa";
  const bgColor = selected
    ? "#3b82f630"
    : isDark
      ? "#27272a"
      : "#e4e4e7";

  return (
    <g>
      {/* Hit area — invisible wide path for easy clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
      />
      {/* Background stroke */}
      <path
        d={edgePath}
        fill="none"
        stroke={bgColor}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Main stroke */}
      <path
        d={edgePath}
        fill="none"
        stroke={hasActiveJob ? "#3b82f6" : mainColor}
        strokeWidth={selected ? 2 : 1.5}
        strokeLinecap="round"
      />
      {/* Pulse flow animation when a job is running */}
      {hasActiveJob && (
        <path
          d={edgePath}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeLinecap="round"
          opacity={0.8}
        >
          <animate
            attributeName="stroke-dashoffset"
            values="0;-10"
            dur="0.6s"
            repeatCount="indefinite"
          />
        </path>
      )}
    </g>
  );
});
