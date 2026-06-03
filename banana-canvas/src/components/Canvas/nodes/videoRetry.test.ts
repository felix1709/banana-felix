import { getVideoRetrySourceNodeId } from "./videoRetry.js";
import type { CanvasEdge, CanvasNode } from "../../../types/node.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const nodes: CanvasNode[] = [
  { id: "video-source", type: "gen-video", x: 0, y: 0, width: 320, height: 320, content: "", prompt: "", settings: {}, nodeName: "视频生成" },
  { id: "image-source", type: "gen-image", x: 0, y: 0, width: 320, height: 320, content: "", prompt: "", settings: {}, nodeName: "图片生成" },
  { id: "video-output", type: "video-input", x: 400, y: 0, width: 360, height: 420, content: "", prompt: "", settings: {}, nodeName: "视频结果" },
];

const edges: CanvasEdge[] = [
  { id: "edge-image", from: "image-source", to: "video-output", fromPort: "default", toPort: "default", inputType: "default" },
  { id: "edge-video", from: "video-source", to: "video-output", fromPort: "default", toPort: "default", inputType: "default" },
];

assert(
  getVideoRetrySourceNodeId(nodes, edges, "video-output") === "video-source",
  "finds the connected video generation node for retry",
);

assert(
  getVideoRetrySourceNodeId(nodes, edges, "missing-output") === null,
  "returns null when the output node has no retry source",
);
