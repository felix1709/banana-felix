import { formatImageReversePrompt, extractChatCompletionText } from "./imagePromptReverse.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const messyMarkdown = `
\`\`\`json
{
  "主体描述": "一位穿红色斗篷的年轻女孩站在白色神兽旁边",
  "环境描述": "森林深处，地面覆盖落叶",
  "光线效果": "丁达尔光从树冠斜射进入画面",
  "风格标签": "电影感，东方奇幻",
  "质量增强词": "高细节，真实质感"
}
\`\`\`
`;

assert(
  formatImageReversePrompt(messyMarkdown) === [
    "主体描述：一位穿红色斗篷的年轻女孩站在白色神兽旁边",
    "环境描述：森林深处，地面覆盖落叶",
    "光线效果：丁达尔光从树冠斜射进入画面",
    "风格标签：电影感，东方奇幻",
    "质量增强词：高细节，真实质感",
  ].join("\n"),
  "formats JSON-like model output into the required five headings",
);

assert(
  formatImageReversePrompt("画面是一只白色神兽在密林中奔跑，阳光穿过树叶，电影感，高质量。") === [
    "主体描述：画面是一只白色神兽在密林中奔跑，阳光穿过树叶，电影感，高质量。",
    "环境描述：",
    "光线效果：",
    "风格标签：",
    "质量增强词：",
  ].join("\n"),
  "falls back to putting unstructured text under the subject heading",
);

assert(
  extractChatCompletionText({
    choices: [
      {
        message: {
          content: [
            { type: "text", text: "主体描述：女孩" },
            { type: "text", text: "环境描述：森林" },
          ],
        },
      },
    ],
  }) === "主体描述：女孩\n环境描述：森林",
  "extracts text from array-style chat completion content",
);
