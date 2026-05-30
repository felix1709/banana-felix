import { buildReferencedImageParts } from "./agentImageMentions.js";
import type { CanvasNode } from "../../types/node";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const nodes = [
  { id: "img-1", type: "input-image", nodeName: "参考图1", content: "data:image/png;base64,abc" },
  { id: "txt-1", type: "text-node", nodeName: "文本1", content: "hello" },
] as CanvasNode[];

const parts = buildReferencedImageParts("请分析 @参考图1", nodes);

assert(parts.length === 1, "finds referenced image nodes");
assert(parts[0].imageUrl === "data:image/png;base64,abc", "keeps image url for model input");
assert(parts[0].nodeName === "参考图1", "keeps node name for prompt context");
