import type { MentionedNode } from "./useMentionParser";

interface ResourceDescription {
  mention: string;
  type: "image" | "video" | "audio";
  description: string;
}

function classifyMention(node: MentionedNode): ResourceDescription {
  const mention = `@${node.nodeName}`;
  const videoTypes = ["video-input", "gen-video"];
  const audioTypes = ["audio-input", "gen-music"];

  if (videoTypes.includes(node.nodeType)) {
    return { mention, type: "video", description: "对应视频参考素材，用于参考镜头、运镜、动态、节奏、画面风格" };
  }
  if (audioTypes.includes(node.nodeType)) {
    return { mention, type: "audio", description: "对应音频参考素材，用于参考音色、语速、情绪、背景音乐、音效风格" };
  }
  return { mention, type: "image", description: "对应参考图片素材，用于参考构图、风格、细节、光影" };
}

export function buildAnchorText(
  mentionedNodes: MentionedNode[],
  userPrompt: string,
): string {
  if (mentionedNodes.length === 0) return userPrompt;

  const resources = mentionedNodes.map(classifyMention);
  const lines = [
    "==== 引用资源说明区(系统自动生成) ====",
    "本文中所有 @xxx 为外部参考素材标识，对应关系如下：",
  ];
  resources.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.mention} ${r.description}`);
  });
  lines.push("请严格结合对应参考素材内容，完成生成任务。");
  lines.push("==== 引用说明结束 ====");

  return lines.join("\n") + "\n" + userPrompt;
}

export function buildCanvasAnchorText(
  mentionedNodes: MentionedNode[],
  userPrompt: string,
  colorMappings: Array<{ color: string; mention: string; category: string }>,
): string {
  let result = buildAnchorText(mentionedNodes, userPrompt);

  if (colorMappings.length > 0) {
    const mappingLines = colorMappings.map(
      (m) => `${m.color} sketch lines → POSITION/POSE of ${m.mention} (${m.category})`,
    );
    result += "\n额外补充：画布手绘彩色线条为位置/动作标注，不同颜色区域对应上方引用角色素材，";
    result += "请按照手绘区域位置、轮廓，结合对应角色参考图生成画面。\n";
    result += "【颜色→引用映射】\n" + mappingLines.join("\n");
  }

  return result;
}

export type { ResourceDescription };
