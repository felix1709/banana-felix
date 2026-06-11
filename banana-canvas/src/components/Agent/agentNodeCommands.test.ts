import { cleanPromptTextForCanvas, isImageNodeGenerationRequest, parseImageNodeSpecsForAgentCommand, parseRoleImageNodeSpecs } from "./agentNodeCommands.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const sourceText = `角色：女孩
- 外观：年轻女性，黑长直发，冷白肤色，厚质哑光绯红色长袍
- 气质：神秘坚定，与森林和白泽有天然联结
- 动作特征：攀爬果断流畅，对白泽毫无恐惧，像久别重逢

角色：白泽
- 外观：通体雪白的神兽，鹿角，鬃毛柔亮，金色纹路若隐若现
- 气质：古老、温和、强大
- 动作特征：奔跑轻盈，护住女孩`;

assert(isImageNodeGenerationRequest("把角色设定生成图片节点"), "detects image node generation intent");
assert(isImageNodeGenerationRequest("把完整提示词部署到画布节点"), "detects deployment-to-canvas node intent");
assert(!isImageNodeGenerationRequest("帮我聊聊角色设定"), "does not trigger without node creation intent");

const specs = parseRoleImageNodeSpecs(sourceText);
assert(specs.length === 2, "parses two role image node specs");
assert(specs[0].nodeName === "角色：女孩", "uses role name as image node name");
assert(specs[0].prompt.includes("- 外观：年轻女性"), "keeps role appearance in prompt");
assert(specs[0].prompt.includes("- 动作特征：攀爬果断流畅"), "keeps action feature in prompt");
assert(specs[1].nodeName === "角色：白泽", "parses the second role");

const commandSpecs = parseImageNodeSpecsForAgentCommand("请生成节点", sourceText);
assert(commandSpecs.length === 2, "returns role specs for node command");

const ignored = parseImageNodeSpecsForAgentCommand("请总结角色设定", sourceText);
assert(ignored.length === 0, "ignores role specs without node command");

const longPrompt = "镜头描述：" + "森林、光柱、奔跑、衣袍飘动。".repeat(120);
const genericPromptText = `## 白泽密林完整提示词
${longPrompt}

## 山谷追逐完整提示词
主体：女孩穿过山谷，白泽在身后守护。`;

const genericSpecs = parseImageNodeSpecsForAgentCommand("把这些完整提示词生成节点", genericPromptText);
assert(genericSpecs.length === 2, "splits generic complete prompts by markdown titles");
assert(genericSpecs[0].nodeName === "白泽密林完整提示词", "uses title as generic image node name");
assert(genericSpecs[0].prompt === longPrompt, "keeps the full long prompt without truncation");
assert(genericSpecs[1].prompt.includes("主体：女孩穿过山谷"), "keeps second section content");

const noisyPrompt = `我先帮你整理好了，可以直接使用。

## 最终提示词
年轻女孩站在雨夜街口，黑色风衣，霓虹灯反射在湿润地面，电影感构图，冷蓝色光影，高清细节。

需要我把本次整理好的提示词，自动拆分并部署对应画布节点吗？

[OPTIONS]
- 确认部署
- 不用
- ✏️ 自定义
[/OPTIONS]`;

const cleanedPrompt = cleanPromptTextForCanvas(noisyPrompt);
assert(cleanedPrompt.includes("年轻女孩站在雨夜街口"), "keeps effective visual prompt content");
assert(!cleanedPrompt.includes("需要我"), "removes deployment question");
assert(!cleanedPrompt.includes("[OPTIONS]"), "removes options blocks");
assert(!cleanedPrompt.includes("确认部署"), "removes option labels");

const singleSpecs = parseImageNodeSpecsForAgentCommand("确认部署", noisyPrompt);
assert(singleSpecs.length === 1, "creates only one node for one complete image prompt");
assert(singleSpecs[0].prompt === "年轻女孩站在雨夜街口，黑色风衣，霓虹灯反射在湿润地面，电影感构图，冷蓝色光影，高清细节。", "uses only cleaned prompt text");
