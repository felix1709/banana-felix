import type { CanvasNode } from "../../types/node";

export interface ReferencedImagePart {
  nodeId: string;
  nodeName: string;
  imageUrl: string;
}

export interface ChatModelLike {
  id: string;
  name?: string;
  type?: string;
}

const MULTIMODAL_MODEL_KEYWORDS = [
  "gpt-4o",
  "omni",
  "vision",
  "vl",
  "qwen-vl",
  "qwen2-vl",
  "qwen2.5-vl",
  "qwen3-vl",
  "gemini",
  "claude-3",
  "claude-sonnet",
  "claude-opus",
  "llava",
  "minicpm",
  "internvl",
];

export function isImageNodeContent(node: CanvasNode): boolean {
  return (
    (node.type === "input-image" || node.type === "gen-image") &&
    typeof node.content === "string" &&
    (node.content.startsWith("data:image") || node.content.startsWith("http"))
  );
}

export function buildReferencedImageParts(text: string, nodes: CanvasNode[]): ReferencedImagePart[] {
  const seen = new Set<string>();
  const mentionNames = Array.from(text.matchAll(/@([^\s@]+)/g)).map((match) => match[1].toLowerCase());
  return mentionNames
    .map((mentionName) => nodes.find((node) => (node.nodeName || "").toLowerCase() === mentionName))
    .filter((node): node is CanvasNode => !!node && isImageNodeContent(node))
    .filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    })
    .map((node) => ({
      nodeId: node.id,
      nodeName: node.nodeName || node.id,
      imageUrl: node.content,
    }));
}

export function isLikelyMultimodalChatModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return MULTIMODAL_MODEL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function selectImageRecognitionModel(
  currentModel: string,
  models: ChatModelLike[],
): string | null {
  if (isLikelyMultimodalChatModel(currentModel)) return currentModel;
  const candidates = models.filter((model) => isLikelyMultimodalChatModel(`${model.id} ${model.name || ""}`));
  const qwen = candidates.find((model) => /qwen/i.test(`${model.id} ${model.name || ""}`));
  return (qwen || candidates[0])?.id || null;
}

export function buildReferencedImagePromptContext(
  referencedImages: ReferencedImagePart[],
  options: { storyboardActive: boolean; imageAnalysis?: string } = { storyboardActive: false },
): string {
  if (referencedImages.length === 0) return "";
  const imageNames = referencedImages.map((image) => `@${image.nodeName}`).join("、");
  const nextStep = options.storyboardActive
    ? "用户已经输入了需要引用的图片并备注了图片内容，不要再要求用户重新上传或重复说明图片；请直接进入分镜创作流程，开始整理剧情、角色、场景关系并制作分镜。"
    : "用户已经输入了需要引用的图片并备注了图片内容，不要再要求用户重新上传或重复说明图片；请基于这些参考信息继续完成用户请求。";
  const analysis = options.imageAnalysis?.trim()
    ? `\n\n识别模型对参考图的文字分析：\n${options.imageAnalysis.trim()}`
    : "";

  return `用户引用了画布图片：${imageNames}。\n${nextStep}${analysis}`;
}
