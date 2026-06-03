import type { CanvasEdge, CanvasNode } from "../../../types/node";

export const VIDEO_RETRY_EVENT = "banana-canvas:retry-video-generation";

export interface VideoRetryEventDetail {
  sourceNodeId: string;
  outputNodeId: string;
}

export function getVideoRetrySourceNodeId(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  outputNodeId: string,
): string | null {
  const incoming = edges.filter((edge) => edge.to === outputNodeId);
  for (const edge of incoming) {
    const source = nodes.find((node) => node.id === edge.from);
    if (source?.type === "gen-video") return source.id;
  }
  return null;
}
