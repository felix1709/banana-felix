import type { SkillCallResult, StoryboardOutput, PromptOptimizeOutput, QuickOption, StoryboardShot, SkillPhase, SkillDefinition } from "../types/agent";
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

const CANVAS_CONTROL_PROMPT = `

【画布全局控制规则】
- 每次对话都要结合当前画布完整状态：节点数量、节点类型、已有连线、空白画布位置、上下游关系。
- 文本输入节点只存放单一类提示词，只向下游生成节点传递文本内容；多文本节点可以并联给同一个生成节点。
- 图片生成节点接收上游文本节点提示词生成图片；视频生成节点接收分镜、画面、动作、情绪表演描述生成视频；图片输入节点用于参考图和图源素材；360全景节点专门生成全景环绕场景画面。
- 整理、优化、拆分提示词后，必须主动询问：需要我把本次整理好的提示词，自动拆分并部署对应画布节点吗？
- 部署前必须先完成内容甄别和清洗：删除聊天引导语、互动问句、说明文字、示例、表情符号、操作选项、沟通话术，只保留纯画面描述、角色、场景、风格、光影、构图、画质、动作、情绪等有效提示词。
- 单条完整出图提示词只创建1个对应节点，禁止重复拆分、禁止把对话内容单独生成节点。
- 只有内容明确分为角色、场景、主体构图、情绪表演等独立模块时，才按规则拆分多节点。
- 用户明确回复“是、确认、部署”后，才能自动新建节点、填充文案、规整排版、完成连线。
- 用户回复“否、不用、手动”时，只输出文字内容，禁止操作画布任何节点。
- 海报、主视觉、宣传画面、封面需求必须拆为三个独立文本节点：角色描述、场景环境描述、画面主体构图描述，禁止混在一个节点。
- 普通单画面或单文案需求没有多维内容时，可生成单个文本节点。
- 自动部署时只新增节点，不改动用户画布上原有已经做好的节点、连线、内容。`;

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
表演：{performance}（20字以内）
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
    { "cut": 1, "time_range": "0-3秒", "subject": "主体", "action": "动作", "performance": "眼神紧绷，手指微颤", "description": "描述", "camera": "景别+运镜+光圈" }
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

export type JiaojiaoSkillId = "prompt-library" | "line-art-storyboard" | "emotion-director";

export const PROMPT_LIBRARY_SKILL_PATH = "C:\\Users\\admin\\.claude\\skills\\提示词库";
export const LINE_ART_STORYBOARD_SKILL_PATH = "C:\\Users\\admin\\.claude\\skills\\storyboard-prompt-optimizer";
export const EMOTION_DIRECTOR_SKILL_PATH = "C:\\Users\\admin\\.claude\\skills\\seedance-emotion-director\\SKILL.md";

const PROMPT_LIBRARY_SKILL_PROMPT = `

【提示词库 Skill 已激活】
本功能对应本地 Skill：${PROMPT_LIBRARY_SKILL_PATH}
你现在按“提示词库”原有流程工作：根据用户需求，在 GPT-Image2 提示词案例库的 503 个案例和 13 大分类中匹配最合适的方向，再定制成可直接使用的完整提示词。

工作规则：
- 用户需求详细时，直接匹配并定制；需求模糊时，只问 1-2 个关键问题。
- 分类优先按：UI与界面、海报与排版、插画与艺术、图表与信息可视化、建筑与空间、文档与出版物、商品与电商、摄影与写实、人物与角色、历史与古风题材、其他应用场景、品牌与标志、场景与叙事。
- 输出必须包含匹配结果、最终提示词、使用说明；提示词要完整、具体、中文优先。
- 保留蕉蕉的 [OPTIONS] 可点击选项交互，每次询问都给出选项。
`;

const LINE_ART_STORYBOARD_SKILL_PROMPT = `

【线稿故事板 Skill 已激活】
本功能对应本地 Skill：${LINE_ART_STORYBOARD_SKILL_PATH}
对外展示名称固定为“线稿故事板”。你是影视分镜提示词优化师，从一句话故事出发，逐步生成线稿故事板提示词和视频生成提示词。

必须保留的原 Skill 规则：
- 第一步强制让用户在四种全局渲染风格中选一：CG电影级渲染、二维动画风格、真人写实实拍风格、艺术风格化画面。
- 用户选定后，全部分镜统一使用同一套画质、风格、光影、渲染关键词，禁止单镜头随机变风格。
- 角色动作表演描述必须严格控制在 20 字以内，补充表情、眼神、嘴角、手部、体态等细节。
- 文戏版和动作戏版都必须同步遵守上述规则。
- 每个镜头必须单独输出“表演”字段，并在最终部署时拆成独立情绪表演文本节点。
- 本 Skill 只产出优化后的提示词文本；不直接修改画布节点。
- 全程保留蕉蕉的 [OPTIONS] 可点击选项交互。
`;

const EMOTION_DIRECTOR_SKILL_PROMPT = `

【情绪表演导演 Skill 已激活】
本功能对应本地 Skill：${EMOTION_DIRECTOR_SKILL_PATH}
你现在联动“情绪表演导演”技能，专门负责角色精细化情绪、微表情、肢体表演调度，补足画面和视频人物情绪张力。

自动联动规则：
- 用户制作分镜、视频镜头、动态人物画面时，必须自动联动本技能。
- 海报静态人物画面按需补充贴合画面的静态情绪神态。
- 和线稿故事板联动时，每个镜头必须拆为两类文案：画面内容描述 + 独立情绪表演描述。

输出硬性约束：
- 所有情绪表演文案严格控制在20字以内，简洁精准，不冗余。
- 文戏侧重细腻内敛微表情；武戏侧重亢奋、紧绷、激烈情绪神态。
- 全篇所有镜头或画面情绪风格统一，不出现前后割裂。
- 生成的情绪表演内容，必须单独拆分独立文本节点，和画面、风格节点分开部署，并联接入生成节点。
`;

export const JIAOJIAO_HOME_OPTIONS = [
  "帮我画分镜",
  "提示词库",
  "线稿故事板",
  "优化提示词",
  "聊聊创作想法",
];

const REGISTERED_SKILLS: SkillDefinition[] = [
  {
    id: "prompt-library",
    name: "提示词库",
    description: "GPT-Image2 提示词库入口，挂载本地原 Skill 流程。",
    icon: "📦",
    systemPrompt: PROMPT_LIBRARY_SKILL_PROMPT,
    outputFormat: "匹配结果 + 最终提示词 + 使用说明",
    sourcePath: PROMPT_LIBRARY_SKILL_PATH,
  },
  {
    id: "line-art-storyboard",
    name: "线稿故事板",
    description: "原 storyboard-prompt-optimizer 入口，用于线稿故事板提示词优化。",
    icon: "🎬",
    systemPrompt: LINE_ART_STORYBOARD_SKILL_PROMPT,
    outputFormat: "文戏版/动作戏版线稿故事板提示词",
    sourcePath: LINE_ART_STORYBOARD_SKILL_PATH,
  },
  {
    id: "emotion-director",
    name: "情绪表演导演",
    description: "Seedance 情绪表演导演入口，用于角色微表情、肢体表演和视频镜头情绪调度。",
    icon: "🎭",
    systemPrompt: EMOTION_DIRECTOR_SKILL_PROMPT,
    outputFormat: "20字以内情绪表演文案，可拆为独立文本节点",
    sourcePath: EMOTION_DIRECTOR_SKILL_PATH,
  },
];

export function getJiaojiaoSystemPrompt(activeSkill: boolean, activeSkillId: JiaojiaoSkillId | null = null): string {
  let prompt = JIAOJIAO_SYSTEM_PROMPT + CANVAS_CONTROL_PROMPT;
  if (activeSkillId === "prompt-library") {
    prompt += PROMPT_LIBRARY_SKILL_PROMPT;
  } else if (activeSkillId === "line-art-storyboard") {
    prompt += LINE_ART_STORYBOARD_SKILL_PROMPT + EMOTION_DIRECTOR_SKILL_PROMPT;
  } else if (activeSkillId === "emotion-director") {
    prompt += EMOTION_DIRECTOR_SKILL_PROMPT;
  } else if (activeSkill) {
    prompt += STORYBOARD_SKILL_PROMPT + EMOTION_DIRECTOR_SKILL_PROMPT;
  }
  return prompt;
}

// ── Skill 定义（保留给提示词优化，分镜走聊天流） ──

export function getSkill(id: string): SkillDefinition | undefined {
  return REGISTERED_SKILLS.find((skill) => skill.id === id);
}

export function getAllSkills(): SkillDefinition[] {
  return [...REGISTERED_SKILLS];
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
const PROMPT_LIBRARY_INTENT_RE = /(?:提示词库|prompt\s*library)/i;
const LINE_ART_STORYBOARD_INTENT_RE = /(?:线稿故事板|线稿提示词|故事板提示词|storyboard-prompt-optimizer|line[-\s]*art\s*storyboard)/i;
const EMOTION_DIRECTOR_REQUIRED_RE = /(?:分镜|故事板|线稿故事板|视频|镜头|动态人物|人物动作|角色表演|情绪表演|微表情|肢体表演|文戏|武戏|seedance|video|shot|storyboard)/i;
const NON_CHARACTER_SCENE_RE = /(?:空旷|无人|无人物|纯场景|室内场景|建筑|风景|全景|空间|环境)$/i;

export function isPromptOptimizeIntent(text: string): boolean {
  return PROMPT_OPTIMIZE_INTENT_RE.test(text);
}

export function isPromptLibraryIntent(text: string): boolean {
  return PROMPT_LIBRARY_INTENT_RE.test(text);
}

export function isLineArtStoryboardIntent(text: string): boolean {
  return LINE_ART_STORYBOARD_INTENT_RE.test(text);
}

export function isEmotionDirectorRequired(text: string): boolean {
  const trimmed = text.trim();
  if (!EMOTION_DIRECTOR_REQUIRED_RE.test(trimmed)) return false;
  return !NON_CHARACTER_SCENE_RE.test(trimmed);
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
      performance: shot.performance,
      emotion: shot.emotion,
      emotion_performance: shot.emotion_performance,
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
      performance: shot.performance,
      emotion: shot.emotion,
      emotion_performance: shot.emotion_performance,
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
  "线稿故事板", "线稿提示词", "故事板提示词", "文戏分镜", "动作分镜",
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
