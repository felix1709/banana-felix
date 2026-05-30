import { v4 as uuid } from "uuid";
import { NODE_DEFAULT_SIZES, getDefaultSettings } from "../../../types/node";
import type { CanvasEdge, CanvasNode } from "../../../types/node";

interface BuildVideoOutputNodeParams {
  sourceNode: CanvasNode;
  existingOutputCount: number;
}

export function buildVideoOutputNodeAndEdge({ sourceNode, existingOutputCount }: BuildVideoOutputNodeParams): {
  node: CanvasNode;
  edge: CanvasEdge;
} {
  const dims = NODE_DEFAULT_SIZES["video-input"] ?? { w: 360, h: 420 };
  const nodeId = uuid();
  const nodeName = sourceNode.nodeName
    ? `${sourceNode.nodeName} 结果${existingOutputCount + 1}`
    : `生成视频结果${existingOutputCount + 1}`;

  const node: CanvasNode = {
    id: nodeId,
    type: "video-input",
    x: sourceNode.x + (sourceNode.width || 320) + 40,
    y: sourceNode.y + existingOutputCount * (dims.h + 30),
    width: dims.w,
    height: dims.h,
    content: "",
    prompt: "",
    nodeName,
    settings: {
      ...getDefaultSettings("video-input"),
      source: "url",
      videoUrl: "",
      fileName: "生成中...",
    },
  };

  const edge: CanvasEdge = {
    id: uuid(),
    from: sourceNode.id,
    to: nodeId,
    fromPort: "default",
    toPort: "default",
    inputType: "default",
  };

  return { node, edge };
}
