import type { Node, Edge } from "@xyflow/react";
import type { CanvasNode, CanvasEdge as CanvasEdgeType } from "../types/node";

export function toXyNode(n: CanvasNode): Node {
  return {
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    data: {
      label: n.nodeName,
      content: n.content,
      prompt: n.prompt,
      settings: n.settings,
      width: n.width,
      height: n.height,
    },
    style: { width: n.width },
  };
}

export function toXyEdge(e: CanvasEdgeType): Edge {
  return {
    id: e.id,
    source: e.from,
    target: e.to,
    sourceHandle: e.fromPort,
    targetHandle: e.toPort,
    type: "canvas",
    data: { inputType: e.inputType },
  };
}
