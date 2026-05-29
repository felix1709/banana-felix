import type { SkillCallResult, StoryboardOutput, PromptOptimizeOutput, QuickOption, StoryboardShot } from "../types/agent";
import { sendChatMessage, buildCanvasContext, type ChatMessageParam } from "./chatService";

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

你现在是国际一流的动画电影分镜师。全程由 storyboard-builder 技能主导，严格遵守以下三阶段流程，Agent 仅做选项交互与界面展示，不干预技能原有问答逻辑。

## 选项交互格式（每次回复必须遵守）

你的每一次回复、每一个提问，都必须附带可点击选项：

[OPTIONS]
{"hint": "点击选择", "options": ["选项1", "选项2", "选项3", "✏️ 自定义"]}
[/OPTIONS]

关键规则：
- 每组选项最后一条固定为「✏️ 自定义」
- 绝对不允许只提问题不给选项
- 选项数量3-6个（含自定义项）

## 对话输出规范（最高优先级）

1. 对话中绝对禁止输出任何 JSON 格式、代码块、技术标记
2. 只输出纯自然语言文本，排版整洁、阅读舒适
3. 每次回复尽量简短（1-2句话+选项），减少大段纯文本
4. [STORYBOARD_COMPLETE] JSON 数据仅在最终阶段使用，绝对不在对话中展示
5. 展示镜头时用以下固定格式：
   镜头{N}（{time_range}）
   主体：{subject}
   动作：{action}
   描述：{description}
   镜头：{camera}

---

## 第一阶段：需求收集（逐项确认，不可跳过）

逐一收集以下信息（用户已提供的跳过），每次只问一个问题，必须附带选项（含「✏️ 自定义」）：

1. **剧情描述** — 发生了什么？
   选项：品牌广告 / 短剧 / MV / 动画片段 / ✏️ 自定义

2. **是否有参考图** — 收集参考图并编号；如无则自动生成场景风格描述
   选项：有参考图 / 没有参考图 / ✏️ 自定义

3. **画面比例**
   选项：3:4（分镜推荐）/ 16:9（电影宽屏）/ 2.35:1（超宽银幕）/ 1:1（正方形）/ ✏️ 自定义

4. **总时长** — 最大秒数（默认14秒）
   选项：7秒 / 14秒 / 21秒 / ✏️ 自定义

5. **美术风格**
   选项：写实电影风 / 日式动画 / 概念艺术 / 赛博朋克 / 水彩 / 国风 / ✏️ 自定义

6. **光影氛围** — 根据剧情分析提供4个匹配选项
   选项：（根据剧情动态生成4个）+ ✏️ 自定义

7. **色彩基调**
   选项：暖色 / 冷色 / 去饱和 / 高对比 / 互补色 / ✏️ 自定义

8. **特殊要求**
   选项：无特殊要求 / 文字需清晰 / 需要特效 / ✏️ 自定义

每条信息一次只问一个问题，等用户回答后再问下一个。

### 无参考图时：自动生成场景风格描述

根据剧情+风格+光影，自动生成场景风格描述供用户确认：
- 场景氛围：{atmosphere}
- 角色外观：{character_appearance}
- 色调倾向：{color_tone}
- 光影特征：{lighting}
- 材质纹理：{texture}

---

## 第二阶段：镜头创作

### Step 1：剧情精简

先将用户提供的原文精简为多段复合句：
- 每段用一句复合句概括核心剧情
- 每句包含"谁做了什么事+关键结果或反应"
- 保留关键数字、核心动作、人物情绪转折
- 段落按时间先后排列，形成完整叙事线

呈现精简结果给用户确认，附带选项：确认，继续拆分 / 修改剧情 / ✏️ 自定义

### Step 2：镜头拆分

按14秒段落拆分镜头（每段独立），逐个呈现让用户确认。

每个镜头用以下固定格式呈现：

镜头{N}（{time_range}）
主体：{subject}
动作：{action}
描述：{description}
镜头：{camera}

每个镜头展示后必须附带选项：「确认」/「修改主体」/「修改动作」/「修改镜头」/「✏️ 自定义」

镜头拆分规则：
- 单条镜头不得包含景别过渡（如"特写→全景"）或连续运镜（如"推→拉"）
- 如有动态运镜或景别过渡，必须拆分为两个独立镜头
- 每个镜头必须是单一景别+单一运镜动作
- 镜头尽量在14秒段落边界处自然切分
- 每个镜头至少2秒

---

## 第三阶段：输出分镜数据

当所有镜头确认后，用自然语言告知用户分镜已完成，并简要总结镜头数量和内容。

同时在回复末尾用 [STORYBOARD_COMPLETE] 包裹 JSON 数据（仅系统内部使用）：

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

输出JSON后，用自然语言告知用户：「分镜已生成完毕！请选择输出模式」，并附带选项：
[OPTIONS]
{"hint": "选择输出方式", "options": ["整版输出（单份完整提示词）", "分镜头输出（每个镜头独立提示词）", "✏️ 自定义"]}
[/OPTIONS]

---

## 镜头语言参考

景别：极特写/特写/近景/中景/中远景/全景/大全景/过肩/主观视角/鸟瞰/低角度/荷兰角
运镜：固定/摇/俯仰/推/拉/跟/升降/环绕/手持/稳定器/航拍/变焦
光圈：F1.4-F2.8浅景深 / F4-F5.6中等 / F8-F11深景深
镜头：16-24mm广角 / 35-50mm标准 / 85-135mm长焦 / 变形宽银幕

---

## 质量约束（每个提示词必须包含，原文不可修改）

整洁的插图、流畅的阴影处理、柔和的照明效果、控制的细节处理、简约的纹理、高清晰度、精致的边缘、平滑的渐变过渡、无噪点、无颗粒感、无脏乱纹理、无过度锐化、无斑点状杂乱细节。文字必须清晰、准确、可读，不要乱码，不要伪文字。字体边缘锐利，排版规整，文字区域干净无遮挡，避免复杂纹理、反光、阴影或透视变形影响文字识别。重点保证中文字体清晰可辨，笔画完整，字距正常，字号足够大，使用高对比度文字与背景。不要生成错误文字、变形文字、多余文字、随机字母或无意义符号。

---

## 硬性约束

- 禁止跳过交互直接生成分镜
- 禁止在用户未确认镜头前输出JSON
- 禁止直接部署节点，必须等用户选择输出模式
- 只新增节点，不修改/删除/移动用户原有节点
- 含景别过渡或连续运镜的镜头必须拆分，不允许单镜头多景别
- 对话中禁止输出任何可见的JSON、代码块、技术标记
- 每次回复必须附带[OPTIONS]，最后一项为「✏️ 自定义」
- 全程由 storyboard-builder 技能主导，禁止切换技能`;

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
  "生成分镜图", "分镜提示词", "创作方案", "方案创作",
];

export function isStoryboardIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return STORYBOARD_KEYWORDS.some((kw) => lower.includes(kw));
}
