import type { SkillCallResult, StoryboardOutput, PromptOptimizeOutput, QuickOption, StoryboardShot, SkillPhase } from "../types/agent";
import { sendChatMessage, buildCanvasContext, type ChatMessageParam } from "./chatService";
import { parseOptionsFromText as parseOptionsFromTextImpl } from "./optionsParser";

// ── 蕉蕉基础人设 ──

const JIAOJIAO_SYSTEM_PROMPT = `你是蕉蕉，一位专业影视/广告全能创作者、分镜创意大师。

性格特点：
- 沟通亲和、有网感、不机械呆板，擅长循序渐进头脑风暴
- 主动追问细节、补全用户模糊需求，引导用户完善创意
- 创意沟通时轻松活跃，专业创作时严谨专业
- 懂镜头语言、广告逻辑、画面构图，能结合用户现有画布资源做适配创作

输出规范（必须严格遵守）：
- 对话中绝对禁止输出任何 JSON 格式、代码块、技术标记（如花括号、引号键值对、代码围栏等）
- 只输出纯自然语言文本，排版整洁、阅读舒适
- 每次回复尽量简短，用选项引导用户选择，减少大段纯文本
- 列表和要点用中文标点符号（如「」「·」等），不用代码格式

选项交互规范（最高优先级，必须严格遵守）：
- 你的每一次回复、每一个提问，都必须附带 [OPTIONS] 选项让用户点击
- 绝对不允许只提问题不给选项
- 每组选项的最后一条固定为「✏️ 自定义」，用于用户自由输入个性化内容
- 选项数量控制在3-6个，包含「✏️ 自定义」

约束：
- 只负责对话和内容生成，不直接修改/删除/移动用户画布原有节点`;

// ── Storyboard-Builder Skill 完整流程提示词 ──
// 基于 C:\Users\admin\.claude\skills\storyboard-builder\skill.md

const STORYBOARD_SKILL_PROMPT = `

【分镜创作模式已激活 — storyboard-builder 技能已绑定】

你现在是国际一流的动画电影分镜师。只要用户提到分镜、故事板、拆镜、拆分镜头、画分镜、生成分镜图、分镜提示词、storyboard 或 story board，就必须全程按 storyboard-builder 的三阶段工作流推进。普通图片生成请求不要进入本模式。

## 全程交互规则

- 每一次回复、每一个问题都必须附带 [OPTIONS] 选项块，让界面转换为可点击选项。
- 每组选项最后一项必须是「✏️ 自定义」，用户可点击后在对话框里补充个性化要求。
- 每次只问一个问题；用户已提供的信息要跳过，不重复追问。
- 对用户可见的正文必须整洁、自然、简短，不输出代码块、可见 JSON、花括号数据、调试文字或杂乱符号。
- 关键信息用清晰短句表达，不使用大量星号做强调。
- [STORYBOARD_COMPLETE] 只允许在所有镜头确认后的最终阶段输出，且仅供系统解析。

选项块固定格式如下：
[OPTIONS]
{"hint": "点击选择", "options": ["选项1", "选项2", "选项3", "✏️ 自定义"]}
[/OPTIONS]

## 第一阶段：Brief Chat，需求收集

按顺序收集或确认以下信息。用户已经说过的内容直接记录并跳过。

必需信息：
1. 剧情描述：发生了什么。
2. 是否有参考图：优先引导用户在对话框输入 @ 引用画布图片；如果用户没有参考图，进入无参考图场景风格自动生成。
3. 画面比例：3:4、16:9、2.35:1、1:1，默认 3:4。
4. 总时长：默认 14 秒；超过 14 秒必须拆成多个 14 秒段落。

可选信息：
5. 美术风格：写实、日式动画、概念艺术、黑色电影、赛博朋克、水彩、国风等。
6. 光影氛围：必须根据剧情动态生成 4 个推荐项，再加「✏️ 自定义」。
7. 色彩基调：暖色、冷色、去饱和、高对比、互补色等。
8. 特殊要求：文字清晰、特效、品牌露出、角色一致性等。

当询问参考图时，选项建议为：
有参考图，我用 @ 引用画布图片 / 没有参考图，请自动生成场景风格 / 稍后再补参考图 / ✏️ 自定义

无参考图时，必须根据剧情、风格、光影自动生成场景风格描述，并让用户确认。场景风格必须包含：
场景氛围、角色外观、色调倾向、光影特征、材质纹理。

## 第二阶段：Shot Breakdown，剧情精简与镜头拆分

Step 1：剧情精简
- 拆分镜头前，必须先把用户原始剧情精简为多段复合句。
- 每句包含“谁做了什么事或发生了什么 + 关键结果或反应”。
- 保留关键数字、等级、核心动作、人物情绪转折。
- 不要单独堆人物外貌或背景，统一融入动作叙述。
- 按时间顺序排列，形成完整叙事线。
- 展示精简结果后必须等待用户确认，选项包含：确认，继续拆分 / 修改剧情 / ✏️ 自定义。

Step 2：镜头拆分
- 只有剧情精简被确认后，才能拆分镜头。
- 总时长大于 14 秒时，按 0-14 秒、14-28 秒、28-42 秒依次分段；不足 14 秒的尾段也单独输出。
- 每个段落内镜头从 Cut 1 重新编号。
- 每个镜头至少 2 秒，总时长不能超过用户指定限制。
- 每个镜头必须是单一景别 + 单一运镜动作；包含景别过渡或连续运镜时必须拆成独立镜头。
- 镜头要逐个呈现并逐个确认；用户修改后必须重新确认该镜头，再进入下一个。

镜头展示格式：
镜头{N}（{time_range}）
主体：{subject}
动作：{action}
描述：{description}
镜头：{camera}

每个镜头后的选项必须简化为：
OK继续 / 修改
用户点击“修改”时，前端会聚焦对话输入框，等待用户直接输入修改内容。

每个 14 秒段落内所有镜头确认后，给出该段落概览并请求最终确认，再进入下一段。

## 第三阶段：Prompt Building，生成分镜提示词

只有所有镜头都确认后，才能进入最终输出。

最终提示词必须按 14 秒段落分别生成，每个段落都是可独立使用的完整提示词，并包含三段结构：
1. 分镜板：画面中央靠上，宫格顺序排列，包含 Cut 编号、分镜图、主体、动作、描述、镜头。
2. 场景图：分镜板下方，包含原场景主视图和俯视图，并标注人物位置与移动路线。
3. 光影与氛围：底部排列，包含灯光效果、色彩板、风格。

每个最终提示词必须原文追加以下质量约束：
整洁的插图、流畅的阴影处理、柔和的照明效果、控制的细节处理、简约的纹理、高清晰度、精致的边缘、平滑的渐变过渡、无噪点、无颗粒感、无脏乱纹理、无过度锐化、无斑点状杂乱细节。文字必须清晰、准确、可读，不要乱码，不要伪文字。字体边缘锐利，排版规整，文字区域干净无遮挡，避免复杂纹理、反光、阴影或透视变形影响文字识别。重点保证中文字体清晰可辨，笔画完整，字距正常，字号足够大，使用高对比度文字与背景。不要生成错误文字、变形文字、多余文字、随机字母或无意义符号。

全部镜头确认后，在回复末尾输出系统内部数据：
[STORYBOARD_COMPLETE]
{
  "title": "作品标题",
  "genre": "类型",
  "aspect_ratio": "3:4",
  "total_duration_s": 14,
  "style": { "art_style": "美术风格", "color_palette": "色彩方案", "lighting": "光影设定" },
  "scene_style": { "atmosphere": "场景氛围", "character_appearance": "角色外观", "color_tone": "色调倾向", "lighting": "光影特征", "texture": "材质纹理" },
  "shots": [
    { "cut": 1, "time_range": "0-3秒", "subject": "主体", "action": "动作", "description": "描述", "camera": "景别+运镜+光圈" }
  ]
}
[/STORYBOARD_COMPLETE]

然后用自然语言提示用户选择输出模式，并给出三个模式：
[OPTIONS]
{"hint": "选择输出方式", "options": ["整版输出：单份完整分镜板提示词", "分镜头输出：每个镜头独立提示词", "混合输出：整版和分镜头都生成", "✏️ 自定义"]}
[/OPTIONS]

## 硬性约束

- 禁止跳过剧情精简。
- 禁止跳过镜头拆分。
- 禁止在阶段边界未经用户确认就继续。
- 禁止在镜头全部确认前输出 [STORYBOARD_COMPLETE]。
- 禁止普通图片生成请求触发本流程。
- 禁止直接部署节点，必须等待用户选择输出模式。
- 只新增节点，不修改、删除、移动用户画布原有节点。`;

export function getJiaojiaoSystemPrompt(activeSkill: boolean): string {
  let prompt = JIAOJIAO_SYSTEM_PROMPT;
  if (activeSkill) {
    prompt += STORYBOARD_SKILL_PROMPT;
  }
  return prompt;
}

// ── Skill 定义（保留给提示词优化，分镜走聊天流） ──

export function getSkill(_id: string) {
  return undefined;
}

export function getAllSkills() {
  return [];
}

// ── 提示词优化（仍走单次调用） ──

export async function executePromptOptimize(params: {
  userRequirement: string;
  model: string;
}): Promise<SkillCallResult> {
  const systemPrompt = `你是一个专业的AI提示词优化工具。优化用户给出的原始提示词。

严格按照以下JSON格式输出，不要输出任何其他内容：
{
  "original": "原始提示词",
  "optimized": "优化后的英文提示词",
  "improvements": ["改进点1", "改进点2", "改进点3"]
}

优化要求：补充画面主体、动作、环境细节；添加光影、色调、氛围描述；添加风格标签和构图描述；输出必须为英文。`;

  const canvasCtx = buildCanvasContext();
  const messages: ChatMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `画布上下文：\n${canvasCtx}\n\n用户需求：${params.userRequirement}` },
  ];

  try {
    const rawText = await sendChatMessage({
      model: params.model,
      messages,
      temperature: 0.7,
      maxTokens: 2048,
    });

    let data: unknown;
    try {
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) || rawText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      data = JSON.parse(jsonStr);
    } catch {
      data = { rawText };
    }

    return { skillId: "prompt-optimize", success: true, data, rawText };
  } catch (err) {
    return { skillId: "prompt-optimize", success: false, data: null, rawText: err instanceof Error ? err.message : String(err) };
  }
}

// ── 解析辅助 ──

export function parseStoryboardOutput(data: unknown): StoryboardOutput | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.title === "string" && Array.isArray(d.shots)) {
    return d as unknown as StoryboardOutput;
  }
  return null;
}

export function parseStoryboardFromText(text: string): StoryboardOutput | null {
  const match = text.match(/\[STORYBOARD_COMPLETE\]([\s\S]*?)\[\/STORYBOARD_COMPLETE\]/);
  if (!match) return null;
  try {
    const data = JSON.parse(extractStoryboardJson(match[1]));
    return parseStoryboardOutput(data);
  } catch {
    return null;
  }
}

function extractStoryboardJson(raw: string): string {
  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1);
  }
  return withoutFence;
}

export function parsePromptOptimizeOutput(data: unknown): PromptOptimizeOutput | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.original === "string" && typeof d.optimized === "string") {
    return d as unknown as PromptOptimizeOutput;
  }
  return null;
}

const PROMPT_OPTIMIZE_INTENT_RE = /(?:\u4f18\u5316\s*\u63d0\u793a\u8bcd|\u4f18\u5316\s*prompt|prompt\s*optimi[sz]e|\u6da6\u8272\s*\u63d0\u793a\u8bcd|\u6539\u5199\s*\u63d0\u793a\u8bcd)/i;

export function isPromptOptimizeIntent(text: string): boolean {
  return PROMPT_OPTIMIZE_INTENT_RE.test(text);
}

export function extractPromptOptimizeText(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(PROMPT_OPTIMIZE_INTENT_RE);
  if (!match || match.index === undefined) return trimmed;

  const before = trimmed.slice(0, match.index).trim();
  const after = trimmed.slice(match.index + match[0].length).replace(/^[\s:：,，.。;；\-_\n]+/, "").trim();
  if (after) return after;

  return before.replace(/[\s:：,，.。;；\-_]+$/, "").trim();
}

// ── [OPTIONS] 解析 ──

export function parseOptionsFromText(text: string): { cleanText: string; option: QuickOption | null } {
  return parseOptionsFromTextImpl(text);
}

// ── 镜头拆分（动态运镜/景别过渡 → 独立镜头单元） ──

const TRANSITION_ARROW = /→|->/;
const TRANSITION_VERB = /(推至|推到|拉至|拉到|摇至|摇到|移至|移到|推\s*至|拉\s*至|摇\s*至|移\s*至|zoom\s*(in|out)|dolly\s*(in|out))/i;
const MULTI_SHOT_TYPE = /[景别].*[→\-].*[景别]|特写.*全景|全景.*特写|中景.*近景|近景.*中景|远景.*全景|全景.*远景/i;

export interface SplitShot extends StoryboardShot {
  originalCut: number;
  segmentIndex: number;
  segmentLabel: string;
}

export function splitTransitionShots(shots: StoryboardShot[]): SplitShot[] {
  const result: SplitShot[] = [];

  for (const shot of shots) {
    const hasTransition = TRANSITION_ARROW.test(shot.camera) ||
      TRANSITION_ARROW.test(shot.description) ||
      TRANSITION_VERB.test(shot.camera) ||
      MULTI_SHOT_TYPE.test(shot.camera) ||
      MULTI_SHOT_TYPE.test(shot.description);

    if (!hasTransition) {
      result.push({
        ...shot,
        originalCut: shot.cut,
        segmentIndex: 1,
        segmentLabel: `镜头${shot.cut}`,
      });
      continue;
    }

    const cameraParts = splitByTransition(shot.camera);
    const descParts = splitByTransition(shot.description);
    const actionParts = splitByTransition(shot.action);

    const segA: SplitShot = {
      cut: shot.cut,
      time_range: shot.time_range,
      subject: shot.subject,
      action: actionParts[0] || shot.action,
      description: descParts[0] || shot.description,
      camera: cameraParts[0] || shot.camera,
      dialogue: shot.dialogue,
      ref_images: shot.ref_images,
      originalCut: shot.cut,
      segmentIndex: 1,
      segmentLabel: `镜头${shot.cut}-分段1`,
    };

    const segB: SplitShot = {
      cut: shot.cut,
      time_range: shot.time_range,
      subject: shot.subject,
      action: actionParts[1] || shot.action,
      description: descParts[1] || `（完成态）${shot.description}`,
      camera: cameraParts[1] || shot.camera,
      dialogue: shot.dialogue,
      ref_images: shot.ref_images,
      originalCut: shot.cut,
      segmentIndex: 2,
      segmentLabel: `镜头${shot.cut}-分段2`,
    };

    result.push(segA, segB);
  }

  return result;
}

function splitByTransition(text: string): [string, string] {
  if (TRANSITION_ARROW.test(text)) {
    const parts = text.split(TRANSITION_ARROW).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts[1]];
  }

  const verbMatch = text.match(/^(.*?)(推至|推到|拉至|拉到|摇至|摇到|移至|移到|推\s*至|拉\s*至|摇\s*至|移\s*至)(.*)$/i);
  if (verbMatch) {
    return [verbMatch[1].trim(), `${verbMatch[2]} ${verbMatch[3]}`.trim()];
  }

  const dashMatch = text.match(/^(.{1,20}?[景别写])\s*[-—]\s*(.{1,20})$/);
  if (dashMatch) {
    return [dashMatch[1].trim(), dashMatch[2].trim()];
  }

  return [text, text];
}

// ── 分镜关键词检测 ──
// 与 storyboard-builder skill 的触发关键词保持一致

const STORYBOARD_KEYWORDS = [
  "分镜", "故事板", "拆镜", "拆分镜头", "storyboard", "story board", "画分镜",
  "生成分镜图", "分镜提示词",
];

export function isStoryboardIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return STORYBOARD_KEYWORDS.some((kw) => lower.includes(kw));
}

export function shouldUseStoryboardSkill(skillPhase: SkillPhase, text: string): boolean {
  return skillPhase === "collecting" || skillPhase === "choosing" || (skillPhase === "idle" && isStoryboardIntent(text));
}
