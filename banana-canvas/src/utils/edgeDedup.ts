import type { Edge } from "@xyflow/react";
import type { CanvasEdge } from "../types/node";

function canvasEdgeKey(edge: CanvasEdge): string {
  return [
    edge.from,
    edge.to,
    edge.fromPort || "default",
    edge.toPort || "default",
  ].join("::");
}

function xyEdgeKey(edge: Edge): string {
  return [
    edge.source,
    edge.target,
    edge.sourceHandle || "default",
    edge.targetHandle || "default",
  ].join("::");
}

export function appendUniqueCanvasEdge(edges: CanvasEdge[], edge: CanvasEdge): CanvasEdge[] {
  const key = canvasEdgeKey(edge);
  if (edges.some((existing) => canvasEdgeKey(existing) === key)) return edges;
  return [...edges, edge];
}

export function dedupeCanvasEdges(edges: CanvasEdge[]): CanvasEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = canvasEdgeKey(edge);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function appendUniqueXyEdge(edges: Edge[], edge: Edge): Edge[] {
  const key = xyEdgeKey(edge);
  if (edges.some((existing) => xyEdgeKey(existing) === key)) return edges;
  return [...edges, edge];
}
