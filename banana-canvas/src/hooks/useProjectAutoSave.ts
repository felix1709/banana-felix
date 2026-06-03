import { useEffect, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";
import { useGraphStore } from "../stores/graphStore";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";
import { getAutoSaveDestination } from "../services/projectAutoSave";
import {
  clearTemporaryProject,
  deserializeProject,
  getTemporaryProject,
  saveTemporaryProject,
  serializeProject,
  writeProjectFile,
} from "../services/projectService";
import { toXyEdge, toXyNode } from "../utils/nodeConvert";
import { dedupeCanvasEdges } from "../utils/edgeDedup";

const AUTO_SAVE_DELAY_MS = 3 * 60 * 1000;

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function saveTemporarySnapshotNow(projectName?: string): number {
  const content = serializeProject(projectName || useProjectStore.getState().projectName);
  const savedAt = saveTemporaryProject(content);
  useProjectStore.getState().markAutoSaved(savedAt, "temporary");
  return savedAt;
}

export function useProjectAutoSave(
  setNodes: (payload: Node[] | ((nodes: Node[]) => Node[])) => void,
  setEdges: (payload: Edge[] | ((edges: Edge[]) => Edge[])) => void,
  setViewport?: (viewport: { x: number; y: number; zoom: number }) => void,
): void {
  const addToast = useUIStore((s) => s.addToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeVersionRef = useRef(0);
  const restoringRef = useRef(false);
  const lastErrorRef = useRef("");

  useEffect(() => {
    const tempProject = getTemporaryProject();
    const ps = useProjectStore.getState();
    if (!tempProject || ps.projectPath) return;

    try {
      restoringRef.current = true;
      const data = deserializeProject(tempProject);
      useGraphStore.getState().loadGraph(data.nodes, data.edges, data.groups, {
        view: data.view,
        canvasTextBoxes: data.canvasTextBoxes ?? [],
        canvasDoodleStrokes: data.canvasDoodleStrokes ?? [],
      });
      setNodes(data.nodes.map(toXyNode));
      setEdges(dedupeCanvasEdges(data.edges).map(toXyEdge));
      setViewport?.(data.view);
      ps.setProjectPath(null);
      ps.setProjectName(data.projectName || "未命名项目");
      ps.markAutoSaved(Date.now(), "temporary");
      if (data.nodes.length > 0 || data.edges.length > 0) {
        addToast("success", "已恢复临时文件");
      }
    } catch {
      clearTemporaryProject();
    } finally {
      restoringRef.current = false;
    }
  }, [addToast, setEdges, setNodes, setViewport]);

  useEffect(() => {
    const runAutoSave = async () => {
      const startedVersion = changeVersionRef.current;
      const ps = useProjectStore.getState();
      if (!ps.modified && ps.autoSaveStatus === "saved") return;

      ps.markAutoSaving();
      try {
        const content = serializeProject(ps.projectName);
        const destination = getAutoSaveDestination({
          projectPath: ps.projectPath,
          isTauri: isTauri(),
        });

        let savedAt = Date.now();
        if (destination.kind === "project-file") {
          await writeProjectFile(destination.path, content);
          clearTemporaryProject();
        } else {
          savedAt = saveTemporaryProject(content);
        }

        const mode = destination.kind === "project-file" ? "project" : "temporary";
        ps.markAutoSaved(savedAt, mode);
        lastErrorRef.current = "";

        if (changeVersionRef.current !== startedVersion) {
          ps.markModified();
          scheduleAutoSave();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        ps.markAutoSaveFailed(message);
        if (lastErrorRef.current !== message) {
          addToast("error", `自动保存失败: ${message}`);
          lastErrorRef.current = message;
        }
      }
    };

    const scheduleAutoSave = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void runAutoSave();
      }, AUTO_SAVE_DELAY_MS);
    };

    const recordChange = () => {
      if (restoringRef.current) return;
      changeVersionRef.current += 1;
      useProjectStore.getState().markModified();
      scheduleAutoSave();
    };

    const unsubscribeGraph = useGraphStore.subscribe((state, prev) => {
      const hasProjectDataChange =
        state.nodes !== prev.nodes ||
        state.edges !== prev.edges ||
        state.groups !== prev.groups ||
        state.view !== prev.view ||
        state.canvasTextBoxes !== prev.canvasTextBoxes ||
        state.canvasDoodleStrokes !== prev.canvasDoodleStrokes;
      if (hasProjectDataChange) recordChange();
    });
    const unsubscribeProject = useProjectStore.subscribe((state, prev) => {
      if (!state.modified) return;
      const shouldSchedule =
        state.modified !== prev.modified ||
        state.projectName !== prev.projectName ||
        state.projectPath !== prev.projectPath;
      if (shouldSchedule) {
        changeVersionRef.current += 1;
        scheduleAutoSave();
      }
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribeGraph();
      unsubscribeProject();
    };
  }, [addToast]);
}
