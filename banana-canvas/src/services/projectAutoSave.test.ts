import {
  getAutoSaveDestination,
  getAutoSaveStatusText,
  type AutoSaveStatus,
} from "./projectAutoSave.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  getAutoSaveDestination({ projectPath: null, isTauri: true }).kind === "temporary",
  "uses temporary autosave before a formal project path exists",
);

const projectDestination = getAutoSaveDestination({ projectPath: "C:/work/demo.gaga", isTauri: true });
assert(
  projectDestination.kind === "project-file" && projectDestination.path === "C:/work/demo.gaga",
  "uses project file autosave when a formal Tauri project path exists",
);

assert(
  getAutoSaveDestination({ projectPath: "C:/work/demo.gaga", isTauri: false }).kind === "temporary",
  "browser fallback cannot silently write back to a chosen file path",
);

assert(
  getAutoSaveStatusText({ mode: "temporary", projectName: "Demo", status: "saved" }) === "临时文件 · 已保存",
  "temporary status label is explicit",
);

const statusCases: Array<[AutoSaveStatus, string]> = [
  ["idle", "Demo · 待保存"],
  ["saving", "Demo · 自动保存中"],
  ["saved", "Demo · 已保存"],
  ["error", "Demo · 保存异常"],
];

for (const [status, expected] of statusCases) {
  assert(
    getAutoSaveStatusText({ mode: "project", projectName: "Demo", status }) === expected,
    `project status label for ${status}`,
  );
}
