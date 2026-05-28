import type { SkillCallResult, StoryboardOutput, PromptOptimizeOutput, QuickOption, StoryboardShot } from "../types/agent";
import { sendChatMessage, buildCanvasContext, type ChatMessageParam } from "./chatService";

// ── 蕉蕉基础人设 ──

const JIAOJIAO_SYSTEM_PROMPT = `你是蕉蕉，一位专业影视/广告全能创作者、分镜创意大师。

性格特点：
- 沟通亲和、有网感、不机械呆板，擅长循序渐进头脑风暴
- 主动追问细节、补全用户模糊需求，引导用户完善创意
- 创意沟通时轻松活跃，专业创作时严谨专业
- 懂镜头语言、广告逻辑、画面构图，能结合用户现有画布资源做适配创作

工作方式：
1. 先通过多轮对话了解用户的创作需求（主题、风格、参考、镜头偏好等）
2. 需求不清晰时主动追问，不盲目执行
3. 需求明确后，生成分镜内容
4. 向用户展示分镜结果，并提供输出模式选择
5. 用户选择输出模式后，在画布上部署对应节点

约束：
- 只负责对话和内容生成，不直接修改/删除/移动用户画布原有节点
- 生成分镜时必须完成完整的需求收集，不跳过交互环节`;

// ── 分镜Skill 多轮交互提示词 ──

const STORYBOARD_SKILL_PROMPT = `

【分镜创作模式已激活】

你现在同时是蕉蕉和国际一流的动画电影分镜师。请按以下流程与用户互动：

## 交互选项格式

当你提问涉及固定选项时，必须同时提供可点击选项。在回答文字后，用以下格式输出选项：

[OPTIONS]
{"hint": "点击选择或手动输入", "options": ["选项1", "选项2", "选项3", "选项4"]}
[/OPTIONS]

示例：
请问你想要什么画面比例？
[OPTIONS]
{"hint": "点击选择画面比例", "options": ["3:4（分镜推荐）", "16:9（电影宽屏）", "2.35:1（超宽银幕）", "1:1（正方形）"]}
[/OPTIONS]

以下场景必须提供选项：
- 画面比例选择
- 美术风格选择（至少6个选项）
- 光影氛围选择（4个剧情匹配选项+自定义）
- 色彩基调选择
- 镜头景别确认
- 运镜方式确认
- 转场方式确认

用户可点击选项快速选择，也可手动输入补充内容。两种方式并行。

## 第一阶段：需求收集（必须逐项确认，不可跳过）

逐一收集以下信息（用户已提供的跳过）：

1. **剧情描述** — 发生了什么？文字、图片、任何格式均可
2. **是否有参考图** — 如有则收集并编号；如无则自动生成场景风格描述
3. **画面比例** — 提供[OPTIONS]让用户点击选择
4. **总时长** — 最大秒数（默认14秒）
5. **美术风格** — 提供[OPTIONS]：写实电影风/日式动画/概念艺术/赛博朋克/水彩/国风/极简/油画
6. **光影氛围** — 根据剧情分析提供4个匹配选项+自定义（[OPTIONS]）
7. **色彩基调** — 提供[OPTIONS]：暖色/冷色/去饱和/高对比/互补色/单色调
8. **特殊要求** — 文字清晰度、特效备注等

每条信息一次只问一个问题，等用户回答后再问下一个。

无参考图时，根据剧情+风格+光影，自动生成场景风格描述：
- 场景氛围、角色外观、色调倾向、光影特征、材质纹理

## 第二阶段：镜头创作

1. 先精简剧情为复合句概括
2. 按14秒段落拆分镜头（每段独立）
3. 逐个呈现镜头让用户确认或修改

每个镜头包含：cut编号、时间范围、主体、动作、描述、镜头（景别+运镜）

重要：镜头拆分规则
- 单条镜头不得包含景别过渡（如"特写→全景"）或连续运镜（如"推→拉"）
- 如有动态运镜或景别过渡，必须拆分为两个独立镜头：
  - 镜头A：起始景别/画面，运镜开始
  - 镜头B：结束景别/画面，运镜完成态
- 每个镜头必须是单一景别+单一运镜动作

## 第三阶段：输出分镜数据

当所有镜头确认后，输出以下格式的JSON（用 [STORYBOARD_COMPLETE] 和 [/STORYBOARD_COMPLETE] 包裹）：

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

输出JSON后，告知用户：「分镜内容已生成！请选择输出模式：整版输出（单份完整提示词）或 分镜头输出（每个镜头独立提示词）」

## 镜头语言参考

景别：极特写/特写/近景/中景/中远景/全景/大全景/过肩/主观视角
运镜：固定/摇/俯仰/推/拉/跟/升降/环绕/手持/稳定器/航拍/变焦
光圈：F1.4-F2.8浅景深 / F4-F5.6中等 / F8-F11深景深

## 质量约束（每个提示词必须包含）
整洁的插图、流畅的阴影处理、柔和的照明效果、控制的细节处理、简约的纹理、高清晰度、精致的边缘、平滑的渐变过渡、无噪点、无颗粒感、无脏乱纹理、无过度锐化、无斑点状杂乱细节。文字必须清晰、准确、可读。

## 硬性约束
- 禁止跳过交互直接生成分镜
- 禁止在用户未确认镜头前输出JSON
- 禁止直接部署节点，必须等用户选择输出模式
- 只新增节点，不修改/删除/移动用户原有节点
- 含景别过渡或连续运镜的镜头必须拆分，不允许单镜头多景别`;

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
    const data = JSON.parse(match[1].trim());
    return parseStoryboardOutput(data);
  } catch {
    return null;
  }
}

export function parsePromptOptimizeOutput(data: unknown): PromptOptimizeOutput | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.original === "string" && typeof d.optimized === "string") {
    return d as unknown as PromptOptimizeOutput;
  }
  return null;
}

// ── [OPTIONS] 解析 ──

export function parseOptionsFromText(text: string): { cleanText: string; option: QuickOption | null } {
  const match = text.match(/\[OPTIONS\]\s*([\s\S]*?)\s*\[\/OPTIONS\]/);
  if (!match) return { cleanText: text, option: null };

  const cleanText = text.replace(/\[OPTIONS\][\s\S]*?\[\/OPTIONS\]/, "").trim();
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed.options)) {
      return {
        cleanText,
        option: {
          hint: parsed.hint ?? "点击选择或手动输入",
          options: parsed.options.map(String),
        },
      };
    }
  } catch {
    // malformed JSON, ignore
  }
  return { cleanText, option: null };
}

// ── 镜头拆分（动态运镜/景别过渡 → 独立镜头单元） ──
// 规则：一段固定景别+一组运镜 = 一套独立节点
// 检测：camera/description 中含"→"、推至、拉至、摇至、移至 等动态过渡标记

const TRANSITION_ARROW = /→|->/;
const TRANSITION_VERB = /(推至|推到|拉至|拉到|摇至|摇到|移至|移到|推\s*至|拉\s*至|摇\s*至|移\s*至|zoom\s*(in|out)|dolly\s*(in|out))/i;
const MULTI_SHOT_TYPE = /[景别].*[→\-].*[景别]|特写.*全景|全景.*特写|中景.*近景|近景.*中景|远景.*全景|全景.*远景/i;

export interface SplitShot extends StoryboardShot {
  /** Original cut number before splitting */
  originalCut: number;
  /** Segment index within original shot (1-based) */
  segmentIndex: number;
  /** Label like "镜头5-分段1" */
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
      // No transition → single segment
      result.push({
        ...shot,
        originalCut: shot.cut,
        segmentIndex: 1,
        segmentLabel: `镜头${shot.cut}`,
      });
      continue;
    }

    // --- Split into 2 segments ---

    // Parse camera field for before/after
    const cameraParts = splitByTransition(shot.camera);
    const descParts = splitByTransition(shot.description);

    // Parse action for before/after if it also has transition cues
    const actionParts = splitByTransition(shot.action);

    // Segment A: starting frame (first shot type + initial camera)
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

    // Segment B: ending frame (second shot type + final camera + completion state)
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
  // Try arrow first: "中景 → 中近景"
  if (TRANSITION_ARROW.test(text)) {
    const parts = text.split(TRANSITION_ARROW).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts[1]];
  }

  // Try verb transition: "推至中近景"
  const verbMatch = text.match(/^(.*?)(推至|推到|拉至|拉到|摇至|摇到|移至|移到|推\s*至|拉\s*至|摇\s*至|移\s*至)(.*)$/i);
  if (verbMatch) {
    return [verbMatch[1].trim(), `${verbMatch[2]} ${verbMatch[3]}`.trim()];
  }

  // Try multi-shot type: "中景→中近景" without arrow (might use Chinese dash)
  const dashMatch = text.match(/^(.{1,20}?[景别写])\s*[-—]\s*(.{1,20})$/);
  if (dashMatch) {
    return [dashMatch[1].trim(), dashMatch[2].trim()];
  }

  return [text, text];
}

// ── 分镜关键词检测 ──

const STORYBOARD_KEYWORDS = ["分镜", "故事板", "拆镜", "拆分镜头", "storyboard", "story board", "画分镜"];

export function isStoryboardIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return STORYBOARD_KEYWORDS.some((kw) => lower.includes(kw));
}
