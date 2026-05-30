import { parseOptionsFromText } from "./optionsParser.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

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

const shotConfirm = parseOptionsFromText(`好的，镜头3确认 ✅ 进入最后一个镜头 👇
---
## 镜头 4（10-14秒）
主体：白泽载着女孩向密林深处疾驰
动作：白泽四足腾空全力奔跑
描述：镜头逐渐拉远
镜头：全景·后拉跟拍·f/4
---
这是14秒段的最后一个镜头，确认OK吗？如有微调需求请告诉我～`);

assert(shotConfirm.option !== null, "derives clickable options for storyboard shot confirmation text");
assert(shotConfirm.option?.options.length === 2, "shot confirmation only shows OK and edit");
assert(shotConfirm.option?.options[0] === "OK继续", "first derived shot option continues");
assert(shotConfirm.option?.options[1] === "修改", "second derived shot option opens manual edits");

const outputMode = parseOptionsFromText("全部镜头已就绪！选择你想要的输出方式。");
assert(outputMode.option !== null, "derives output mode options when final storyboard prompt omits OPTIONS");
assert(outputMode.option?.options.includes("混合输出：整版和分镜头都生成"), "includes hybrid output fallback");

const apologyOutputMode = parseOptionsFromText(`抱歉，刚才我可能跳得太快了！让我先把系统数据收尾，再请你选择输出方式。

现在请选择你想要的输出方式：`);
assert(apologyOutputMode.option !== null, "derives output mode options from apology-style final prompt");
assert(apologyOutputMode.option?.options[0] === "整版输出：单份完整分镜板提示词", "keeps full-board as first fallback option");
