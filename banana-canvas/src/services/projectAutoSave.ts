export type AutoSaveMode = "temporary" | "project";
export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export type AutoSaveDestination =
  | { kind: "temporary" }
  | { kind: "project-file"; path: string };

export function getAutoSaveDestination(params: {
  projectPath: string | null;
  isTauri: boolean;
}): AutoSaveDestination {
  if (params.isTauri && params.projectPath) {
    return { kind: "project-file", path: params.projectPath };
  }
  return { kind: "temporary" };
}

export function getAutoSaveStatusText(params: {
  mode: AutoSaveMode;
  projectName: string;
  status: AutoSaveStatus;
}): string {
  const statusText: Record<AutoSaveStatus, string> = {
    idle: "待保存",
    saving: "自动保存中",
    saved: "已保存",
    error: "保存异常",
  };

  if (params.mode === "temporary") {
    return `临时文件 · ${statusText[params.status]}`;
  }
  return `${params.projectName || "未命名项目"} · ${statusText[params.status]}`;
}
