export type AutoSaveMode = "temporary" | "project";
export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export type AutoSaveDestination =
  | { kind: "disabled" }
  | { kind: "project-file"; path: string };

export function getAutoSaveDestination(params: {
  projectPath: string | null;
  isTauri: boolean;
}): AutoSaveDestination {
  if (params.isTauri && params.projectPath) {
    return { kind: "project-file", path: params.projectPath };
  }
  return { kind: "disabled" };
}

export function getAutoSaveStatusText(params: {
  mode: AutoSaveMode;
  projectName: string;
  status: AutoSaveStatus;
}): string {
  if (params.mode === "temporary") {
    return "\u4e34\u65f6\u6587\u4ef6";
  }

  const statusText: Record<AutoSaveStatus, string> = {
    idle: "\u5f85\u4fdd\u5b58",
    saving: "\u81ea\u52a8\u4fdd\u5b58\u4e2d",
    saved: "\u5df2\u4fdd\u5b58",
    error: "\u4fdd\u5b58\u5f02\u5e38",
  };

  return `${params.projectName || "\u672a\u547d\u540d\u9879\u76ee"} \u00b7 ${statusText[params.status]}`;
}
