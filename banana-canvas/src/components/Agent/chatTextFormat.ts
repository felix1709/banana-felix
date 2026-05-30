export interface FormattedTextPart {
  text: string;
  highlight: boolean;
}

export function cleanAssistantText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\[STORYBOARD_COMPLETE\][\s\S]*?\[\/STORYBOARD_COMPLETE\]/g, "");
  cleaned = cleaned.replace(/\[OPTIONS\][\s\S]*?(?:\[\/OPTIONS\]|$)/g, "");
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.split("\n").filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("{") && !trimmed.startsWith("}") && !trimmed.startsWith('"') && trimmed !== "";
  }).join("\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

export function formatAssistantText(text: string): FormattedTextPart[] {
  const cleaned = cleanAssistantText(text);
  const parts: FormattedTextPart[] = [];
  const emphasis = /(\*\*([^*]+)\*\*|__([^_]+)__|(?<!\*)\*([^*\n]+)\*(?!\*))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = emphasis.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: cleaned.slice(lastIndex, match.index), highlight: false });
    }
    parts.push({ text: match[2] || match[3] || match[4] || "", highlight: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    parts.push({ text: cleaned.slice(lastIndex), highlight: false });
  }

  return parts.length > 0 ? parts : [{ text: cleaned, highlight: false }];
}
