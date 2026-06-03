import type { CanvasNode, CanvasEdge } from "../../../types/node";
import { buildMergedPrompt } from "../../../hooks/useMentionParser";

export function getConnectedTextPrompt(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): string {
  const parts: string[] = [];
  for (const edge of edges) {
    if (edge.to !== targetNodeId) continue;
    const src = nodes.find((node) => node.id === edge.from);
    if (!src || src.type !== "text-node") continue;
    const text = buildMergedPrompt(src);
    if (text) parts.push(text);
  }
  return parts.join("\n");
}

export function getConnectedTextSourceCount(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  targetNodeId: string,
): number {
  return edges.filter((edge) => {
    if (edge.to !== targetNodeId) return false;
    return nodes.some((node) => node.id === edge.from && node.type === "text-node");
  }).length;
}
