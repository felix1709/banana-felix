export const CUSTOM_OPTION = "✏️ 自定义";

export function isCustomOption(option: string): boolean {
  return option.replace(/\s/g, "").includes("自定义");
}

export function isManualInputOption(option: string): boolean {
  const compact = option.replace(/\s/g, "");
  return isCustomOption(option) || compact === "修改";
}

export function ensureCustomOption(options: string[]): string[] {
  const normalized = options
    .map((option) => option.trim())
    .filter((option) => option.length > 0 && !isCustomOption(option));

  if (normalized.some((option) => option.replace(/\s/g, "") === "修改")) {
    return normalized;
  }

  return [...normalized, CUSTOM_OPTION];
}

export function shouldShowInlineOptions(skillPhase: string, hasStoryboardData: boolean): boolean {
  return skillPhase !== "choosing" || !hasStoryboardData;
}
