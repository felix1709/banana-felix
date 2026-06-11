import { parseOptionsFromText } from "./optionsParser.js";
import {
  EMOTION_DIRECTOR_SKILL_PATH,
  extractPromptOptimizeText,
  getAllSkills,
  getJiaojiaoSystemPrompt,
  getSkill,
  JIAOJIAO_HOME_OPTIONS,
  isEmotionDirectorRequired,
  isLineArtStoryboardIntent,
  isPromptLibraryIntent,
  isPromptOptimizeIntent,
  isStoryboardIntent,
  parseStoryboardFromText,
  shouldUseStoryboardSkill,
} from "./skillRegistry.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const parsed = parseOptionsFromText(`请选择下一步：

[OPTIONS]
- 确认，继续拆分
- 修改剧情
- 自定义
[/OPTIONS]`);

assert(parsed.cleanText === "请选择下一步：", "removes the options block from visible text");
assert(parsed.option !== null, "parses non-JSON options blocks");
assert(parsed.option?.options[0] === "确认，继续拆分", "extracts the first option");
assert(parsed.option?.options[parsed.option.options.length - 1] === "✏️ 自定义", "normalizes custom option to the end");

const openEnded = parseOptionsFromText(`嗨，我是蕉蕉～想聊分镜？先告诉我大方向。
[OPTIONS]
- 🎬 视频广告（15-60秒）
- 📺 剧情短片（带故事线）
- 🧱 短视频/抖音快闪
- 🎞️ 动画/MG动态图形
- 🖼️ 平面海报/插画分镜
- 🖊️ 自定义（你描述场景）`);

assert(openEnded.cleanText === "嗨，我是蕉蕉～想聊分镜？先告诉我大方向。", "removes an open-ended options block");
assert(openEnded.option !== null, "parses options without a closing tag");
assert(openEnded.option?.options[0] === "🎬 视频广告（15-60秒）", "keeps emoji option text clickable");
assert(openEnded.option?.options[openEnded.option.options.length - 1] === "✏️ 自定义", "normalizes custom from open-ended block");

assert(isStoryboardIntent("帮我做一个分镜"), "detects Chinese storyboard intent");
const promptLibraryName = "\u63d0\u793a\u8bcd\u5e93";
const lineArtStoryboardName = "\u7ebf\u7a3f\u6545\u4e8b\u677f";
const emotionDirectorName = "\u60c5\u7eea\u8868\u6f14\u5bfc\u6f14";

assert(JIAOJIAO_HOME_OPTIONS.includes(promptLibraryName), "shows prompt library on Jiaojiao startup");
assert(JIAOJIAO_HOME_OPTIONS.includes(lineArtStoryboardName), "shows line-art storyboard on Jiaojiao startup");
assert(isPromptLibraryIntent(promptLibraryName), "detects prompt library entry click");
assert(isLineArtStoryboardIntent(lineArtStoryboardName), "detects line-art storyboard entry click");
assert(isStoryboardIntent(lineArtStoryboardName), "line-art storyboard entry activates storyboard flow");
assert(getSkill("prompt-library")?.name === promptLibraryName, "registers prompt library skill metadata");
assert(getSkill("line-art-storyboard")?.name === lineArtStoryboardName, "registers line-art storyboard display name");
assert(getSkill("emotion-director")?.name === emotionDirectorName, "registers emotion director skill metadata");
assert(getSkill("emotion-director")?.sourcePath === EMOTION_DIRECTOR_SKILL_PATH, "keeps emotion director local skill path");
assert(getAllSkills().some((skill) => skill.id === "prompt-library"), "includes prompt library in skill list");
assert(getAllSkills().some((skill) => skill.id === "line-art-storyboard"), "includes line-art storyboard in skill list");
assert(getAllSkills().some((skill) => skill.id === "emotion-director"), "includes emotion director in skill list");
assert(isEmotionDirectorRequired("制作一个视频镜头，角色转身落泪"), "auto-links emotion director for video shots");
assert(isEmotionDirectorRequired("帮我做线稿故事板"), "auto-links emotion director for line-art storyboard");
assert(!isEmotionDirectorRequired("生成一个空旷室内场景"), "does not force emotion director for non-character scene requests");
const lineArtPrompt = getJiaojiaoSystemPrompt(true, "line-art-storyboard");
assert(lineArtPrompt.includes(emotionDirectorName), "line-art storyboard prompt links emotion director");
assert(lineArtPrompt.includes("20字以内"), "emotion performance stays under 20 Chinese characters");
assert(lineArtPrompt.includes("单独拆分独立文本节点"), "requires separate emotion text nodes for deployment");

assert(isStoryboardIntent("Please create a storyboard"), "detects English storyboard intent");
assert(isStoryboardIntent("把这个故事拆镜"), "detects shot breakdown intent");
assert(!isStoryboardIntent("帮我生成一张产品海报图"), "does not trigger for plain image generation");
assert(!isStoryboardIntent("给我一个创作方案"), "does not trigger broad creative-plan wording");

assert(shouldUseStoryboardSkill("idle", "帮我画分镜"), "activates storyboard skill for the first triggering message");
assert(shouldUseStoryboardSkill("collecting", "确认，继续"), "keeps storyboard skill active while collecting");
assert(shouldUseStoryboardSkill("choosing", "整版输出"), "keeps storyboard skill active while choosing output mode");
assert(!shouldUseStoryboardSkill("idle", "优化提示词"), "does not activate storyboard skill for unrelated idle chat");
assert(isPromptOptimizeIntent("优化提示词：一只猫坐在窗边"), "detects direct prompt optimization with inline content");
assert(isPromptOptimizeIntent("please prompt optimize a cinematic city shot"), "detects English prompt optimize intent");
assert(extractPromptOptimizeText("优化提示词：一只猫坐在窗边") === "一只猫坐在窗边", "extracts prompt text after optimize intent");
assert(extractPromptOptimizeText("一只猫坐在窗边，优化提示词") === "一只猫坐在窗边", "extracts prompt text before trailing optimize intent");
assert(extractPromptOptimizeText("优化提示词") === "", "returns empty text for bare optimize intent");

const fencedStoryboard = parseStoryboardFromText(`[STORYBOARD_COMPLETE]
\`\`\`json
{
  "title": "白泽密林",
  "genre": "动画短片",
  "aspect_ratio": "3:4",
  "total_duration_s": 14,
  "style": { "art_style": "国风动画", "color_palette": "冷暖交错", "lighting": "丁达尔光" },
  "shots": [
    { "cut": 1, "time_range": "0-3秒", "subject": "女孩", "action": "回头", "description": "密林中回头", "camera": "近景·固定·f/4" }
  ]
}
\`\`\`
[/STORYBOARD_COMPLETE]`);

assert(fencedStoryboard !== null, "parses storyboard data wrapped in a markdown json fence");
assert(fencedStoryboard?.title === "白泽密林", "keeps parsed storyboard title");
