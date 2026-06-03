import { useEffect, useRef } from "react";
import type { Edge, Node } from "@xyflow/react";
import { useGraphStore } from "../stores/graphStore";
import { useProjectStore } from "../stores/projectStore";
import { useUIStore } from "../stores/uiStore";
import { getAutoSaveDestination } from "../services/projectAutoSave";
import {
  clearTemporaryProject,
  serializeProject,
  writeProjectFile,
} from "../services/projectService";

const AUTO_SAVE_DELAY_MS = 3 * 60 * 1000;

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function useProjectAutoSave(
  _setNodes: (payload: Node[] | ((nodes: Node[]) => Node[])) => void,
  _setEdges: (payload: Edge[] | ((edges: Edge[]) => Edge[])) => void,
  _setViewport?: (viewport: { x: number; y: number; zoom: number }) => void,
): void {
  const addToast = useUIStore((s) => s.addToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeVersionRef = useRef(0);
  const lastErrorRef = useRef("");

  useEffect(() => {
    if (!useProjectStore.getState().projectPath) {
      clearTemporaryProject();
    }
  }, []);

  useEffect(() => {
    const hasWritableProject = () => {
      const ps = useProjectStore.getState();
      return getAutoSaveDestination({
        projectPath: ps.projectPath,
        isTauri: isTauri(),
      }).kind === "project-file";
    };

    const runAutoSave = async () => {
      const startedVersion = changeVersionRef.current;
      const ps = useProjectStore.getState();
      if (!hasWritableProject()) return;
      if (!ps.modified && ps.autoSaveStatus === "saved") return;

      ps.markAutoSaving();
      try {
        const content = serializeProject(ps.projectName);
        const destination = getAutoSaveDestination({
          projectPath: ps.projectPath,
          isTauri: isTauri(),
        });

        if (destination.kind !== "project-file") return;

        await writeProjectFile(destination.path, content);
        clearTemporaryProject();

        ps.markAutoSaved(Date.now(), "project");
        lastErrorRef.current = "";

        if (changeVersionRef.current !== startedVersion) {
          ps.markModified();
          scheduleAutoSave();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "\u672a\u77e5\u9519\u8bef";
        ps.markAutoSaveFailed(message);
        if (lastErrorRef.current !== message) {
          addToast("error", `\u81ea\u52a8\u4fdd\u5b58\u5931\u8d25: ${message}`);
          lastErrorRef.current = message;
        }
      }
    };

    const scheduleAutoSave = () => {
      if (!hasWritableProject()) {
        if (timerRef.current) clearTimeout(timerRef.current);
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void runAutoSave();
      }, AUTO_SAVE_DELAY_MS);
    };

    const recordChange = () => {
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
