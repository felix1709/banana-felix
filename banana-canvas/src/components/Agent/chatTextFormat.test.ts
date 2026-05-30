import { formatAssistantText } from "./chatTextFormat.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const parts = formatAssistantText("那接下来问个关键问题 —— **有没有参考图？**");

assert(parts.map((part) => part.text).join("") === "那接下来问个关键问题 —— 有没有参考图？", "removes markdown emphasis markers");
assert(parts.some((part) => part.text === "有没有参考图？" && part.highlight), "marks emphasized text as highlight");

const singleStar = formatAssistantText("请先选择 *参考图方式* 再继续。");
assert(singleStar.map((part) => part.text).join("") === "请先选择 参考图方式 再继续。", "removes single-star emphasis markers");
assert(singleStar.some((part) => part.text === "参考图方式" && part.highlight), "highlights single-star emphasis");
