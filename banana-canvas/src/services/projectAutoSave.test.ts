import {
  getAutoSaveDestination,
  getAutoSaveStatusText,
  type AutoSaveStatus,
} from "./projectAutoSave.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  getAutoSaveDestination({ projectPath: null, isTauri: true }).kind === "disabled",
  "disables autosave before a formal project path exists",
);

const projectDestination = getAutoSaveDestination({ projectPath: "C:/work/demo.gaga", isTauri: true });
assert(
  projectDestination.kind === "project-file" && projectDestination.path === "C:/work/demo.gaga",
  "uses project file autosave when a formal Tauri project path exists",
);

assert(
  getAutoSaveDestination({ projectPath: "C:/work/demo.gaga", isTauri: false }).kind === "disabled",
  "browser fallback cannot silently write back to a chosen file path",
);

assert(
  getAutoSaveStatusText({ mode: "temporary", projectName: "Demo", status: "saved" }) === "\u4e34\u65f6\u6587\u4ef6",
  "temporary status label does not imply saved persistence",
);

const statusCases: Array<[AutoSaveStatus, string]> = [
  ["idle", "Demo \u00b7 \u5f85\u4fdd\u5b58"],
  ["saving", "Demo \u00b7 \u81ea\u52a8\u4fdd\u5b58\u4e2d"],
  ["saved", "Demo \u00b7 \u5df2\u4fdd\u5b58"],
  ["error", "Demo \u00b7 \u4fdd\u5b58\u5f02\u5e38"],
];

for (const [status, expected] of statusCases) {
  assert(
    getAutoSaveStatusText({ mode: "project", projectName: "Demo", status }) === expected,
    `project status label for ${status}`,
  );
}
