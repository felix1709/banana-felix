const REQUIRED_SECTIONS = [
  "主体描述",
  "环境描述",
  "光线效果",
  "风格标签",
  "质量增强词",
] as const;

type ReverseSection = (typeof REQUIRED_SECTIONS)[number];

type ChatContentPart = {
  type?: string;
  text?: string;
};

export interface ChatCompletionTextLike {
  choices?: Array<{
    message?: {
      content?: string | ChatContentPart[];
    };
  }>;
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/```(?:json|markdown|text)?/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*[-*#]+\s*/gm, "")
    .replace(/\*\*/g, "")
    .trim();
}

function tryParseObject(raw: string): Partial<Record<ReverseSection, string>> | null {
  const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const sections: Partial<Record<ReverseSection, string>> = {};
    for (const section of REQUIRED_SECTIONS) {
      const value = parsed[section] ?? parsed[`${section}：`] ?? parsed[`${section}:`];
      if (value !== undefined) sections[section] = cleanText(value);
    }
    return sections;
  } catch {
    return null;
  }
}

function parseSectionsFromText(raw: string): Partial<Record<ReverseSection, string>> {
  const sections: Partial<Record<ReverseSection, string>> = {};

  for (let i = 0; i < REQUIRED_SECTIONS.length; i++) {
    const current = REQUIRED_SECTIONS[i];
    const nextHeadings = REQUIRED_SECTIONS.slice(i + 1)
      .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const endPattern = nextHeadings ? `(?=\\n\\s*(?:${nextHeadings})\\s*[：:]|$)` : "$";
    const re = new RegExp(`${current}\\s*[：:]\\s*([\\s\\S]*?)${endPattern}`);
    const match = raw.match(re);
    if (match?.[1] !== undefined) sections[current] = cleanText(match[1]);
  }

  return sections;
}

export function formatImageReversePrompt(raw: string): string {
  const cleaned = cleanText(raw);
  const parsedObject = tryParseObject(cleaned);
  const parsedText = parsedObject ?? parseSectionsFromText(cleaned);
  const hasAnySection = REQUIRED_SECTIONS.some((section) => Boolean(parsedText[section]?.trim()));
  const sections: Record<ReverseSection, string> = {
    主体描述: "",
    环境描述: "",
    光线效果: "",
    风格标签: "",
    质量增强词: "",
  };

  for (const section of REQUIRED_SECTIONS) {
    sections[section] = cleanText(parsedText[section]);
  }

  if (!hasAnySection && cleaned) {
    sections.主体描述 = cleaned;
  }

  return REQUIRED_SECTIONS.map((section) => `${section}：${sections[section]}`).join("\n");
}

export function extractChatCompletionText(result: ChatCompletionTextLike): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part === "object" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}
