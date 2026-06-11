import {
  buildReferencedImageParts,
  buildReferencedImagePromptContext,
  isLikelyMultimodalChatModel,
  selectImageRecognitionModel,
} from "./agentImageMentions.js";
import type { CanvasNode } from "../../types/node";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const nodes = [
  { id: "img-1", type: "input-image", nodeName: "参考图1", content: "data:image/png;base64,abc" },
  { id: "txt-1", type: "text-node", nodeName: "文本1", content: "hello" },
] as CanvasNode[];

const parts = buildReferencedImageParts("请分镜 @参考图1", nodes);

assert(parts.length === 1, "finds referenced image nodes");
assert(parts[0].imageUrl === "data:image/png;base64,abc", "keeps image url for model input");
assert(parts[0].nodeName === "参考图1", "keeps node name for prompt context");

const context = buildReferencedImagePromptContext(parts, { storyboardActive: true });
assert(context.includes("@参考图1"), "mentions referenced image names in text context");
assert(context.includes("不要再要求用户重新上传或重复说明图片"), "prevents the agent from asking for already provided image information again");
assert(context.includes("直接进入分镜创作流程"), "tells the agent to continue storyboard creation after image references");

assert(isLikelyMultimodalChatModel("qwen2.5-vl-72b"), "detects qwen vl models as multimodal");
assert(isLikelyMultimodalChatModel("gpt-4o"), "detects omni models as multimodal");
assert(!isLikelyMultimodalChatModel("deepseek-chat"), "keeps plain text chat models non-multimodal");

const recognitionModel = selectImageRecognitionModel("deepseek-chat", [
  { id: "deepseek-chat", name: "deepseek-chat", type: "chat" },
  { id: "qwen2.5-vl-72b", name: "qwen2.5-vl-72b", type: "chat" },
]);
assert(recognitionModel === "qwen2.5-vl-72b", "uses a qwen vision model to recognize images for text-only chat models");
assert(selectImageRecognitionModel("gpt-4o", []) === "gpt-4o", "uses the current model directly when it is multimodal");
