import { useGraphStore } from "../stores/graphStore";
import type { CanvasNode, CanvasEdge, Group, ViewState, TextBox, DoodleStroke } from "../types/node";

const isTauri = () => "__TAURI_INTERNALS__" in window;
const AUTOSAVE_KEY = "banana_canvas_autosave";

export interface ProjectData {
  version: number;
  appName: string;
  projectName: string;
  savedAt: number;
  view: ViewState;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: Group[];
  canvasTextBoxes: TextBox[];
  canvasDoodleStrokes: DoodleStroke[];
}

export function serializeProject(projectName: string): string {
  const gs = useGraphStore.getState();
  const data: ProjectData = {
    version: 1,
    appName: "banana-canvas",
    projectName,
    savedAt: Date.now(),
    view: JSON.parse(JSON.stringify(gs.view)),
    nodes: JSON.parse(JSON.stringify(gs.nodes)),
    edges: JSON.parse(JSON.stringify(gs.edges)),
    groups: JSON.parse(JSON.stringify(gs.groups)),
    canvasTextBoxes: JSON.parse(JSON.stringify(gs.canvasTextBoxes)),
    canvasDoodleStrokes: JSON.parse(JSON.stringify(gs.canvasDoodleStrokes)),
  };
  return JSON.stringify(data, null, 2);
}

export function deserializeProject(json: string): ProjectData {
  const data = JSON.parse(json) as ProjectData;
  if (data.version !== 1) {
    throw new Error(`不支持的项目版本: ${data.version}`);
  }
  return data;
}

export async function showSaveDialog(projectName: string): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const result = await save({
      defaultPath: `${projectName}.gaga`,
      filters: [{ name: "香蕉画布项目", extensions: ["gaga"] }],
    });
    return result ?? null;
  }
  return null;
}

export async function showOpenDialog(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      filters: [{ name: "香蕉画布项目", extensions: ["gaga"] }],
      multiple: false,
    });
    if (!result) return null;
    return typeof result === "string" ? result : null;
  }
  return null;
}

export async function writeProjectFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const encoder = new TextEncoder();
    await writeFile(path, encoder.encode(content));
  }
}

export async function readProjectFile(path: string): Promise<string> {
  if (isTauri()) {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(path);
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  }
  throw new Error("非 Tauri 环境无法读取本地文件");
}

// Browser fallback: save as download
export function browserDownloadProject(content: string, projectName: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName}.gaga`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Browser fallback: open file picker
export function browserOpenProject(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gaga";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

export function autoSaveToLocal(): void {
  try {
    const content = serializeProject(
      useGraphStore.getState().nodes.length > 0 ? "autosave" : "empty"
    );
    const withTimestamp = JSON.stringify({
      ...JSON.parse(content),
      autoSavedAt: Date.now(),
    });
    localStorage.setItem(AUTOSAVE_KEY, withTimestamp);
  } catch {
    // localStorage might be full or unavailable
  }
}

export function getLocalAutoSave(): string | null {
  try {
    return localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
}

export function clearLocalAutoSave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
