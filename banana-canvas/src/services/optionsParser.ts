import type { QuickOption } from "../types/agent";
import { ensureCustomOption } from "../components/Agent/quickReplyOptionsUtils.js";

export function parseOptionsFromText(text: string): { cleanText: string; option: QuickOption | null } {
  const textWithoutStoryboard = text.replace(/\[STORYBOARD_COMPLETE\][\s\S]*?\[\/STORYBOARD_COMPLETE\]/, "").trim();
  const match =
    textWithoutStoryboard.match(/\[OPTIONS\]\s*([\s\S]*?)\s*\[\/OPTIONS\]/) ??
    textWithoutStoryboard.match(/\[OPTIONS\]\s*([\s\S]*)$/);

  if (!match) {
    return { cleanText: textWithoutStoryboard, option: deriveImplicitOptions(textWithoutStoryboard) };
  }

  const cleanText = textWithoutStoryboard
    .replace(/\[OPTIONS\][\s\S]*?(?:\[\/OPTIONS\]|$)/, "")
    .trim();
  const optionBlock = match[1].trim();

  try {
    const parsed = JSON.parse(optionBlock);
    if (Array.isArray(parsed.options)) {
      return {
        cleanText,
        option: {
          hint: parsed.hint ?? "点击选择",
          options: ensureCustomOption(parsed.options.map(String)),
        },
      };
    }
  } catch {
    const fallbackOptions = optionBlock
      .split(/\r?\n|[|｜]/)
      .map((line) => line.replace(/^[-*•\d.、\s]+/, "").trim())
      .filter((line) => line.length > 0 && !line.startsWith("{") && !line.startsWith("}"));

    if (fallbackOptions.length > 0) {
      return {
        cleanText,
        option: {
          hint: "点击选择",
          options: ensureCustomOption(fallbackOptions),
        },
      };
    }
  }

  return { cleanText, option: null };
}

function deriveImplicitOptions(text: string): QuickOption | null {
  if (isStoryboardShotConfirmation(text)) {
    return {
      hint: "确认这个镜头",
      options: ensureCustomOption(["OK继续", "修改"]),
    };
  }

  if (isStoryboardOutputModePrompt(text)) {
    return {
      hint: "选择输出方式",
      options: ensureCustomOption([
        "整版输出：单份完整分镜板提示词",
        "分镜头输出：每个镜头独立提示词",
        "混合输出：整版和分镜头都生成",
      ]),
    };
  }

  return null;
}

function isStoryboardShotConfirmation(text: string): boolean {
  return /镜头\s*\d+|镜头[一二三四五六七八九十]/.test(text) &&
    /(确认\s*OK|确认OK|OK\s*吗|确认\s*吗|微调需求|确认这个镜头)/i.test(text);
}

function isStoryboardOutputModePrompt(text: string): boolean {
  return /(全部镜头已就绪|分镜已生成完毕|选择你想要的输出方式|请选择输出模式|选择输出方式)/.test(text);
}
