import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface ProjectState {
  projectPath: string | null;
  projectName: string;
  modified: boolean;
  lastSavedAt: number | null;
  lastAutoSavedAt: number | null;

  setProjectPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  markModified: () => void;
  markSaved: () => void;
  setLastAutoSavedAt: (ts: number) => void;
  resetProject: () => void;
}

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    projectPath: null,
    projectName: "未命名项目",
    modified: false,
    lastSavedAt: null,
    lastAutoSavedAt: null,

    setProjectPath: (path) =>
      set((state) => {
        state.projectPath = path;
      }),

    setProjectName: (name) =>
      set((state) => {
        state.projectName = name;
      }),

    markModified: () =>
      set((state) => {
        state.modified = true;
      }),

    markSaved: () =>
      set((state) => {
        state.modified = false;
        state.lastSavedAt = Date.now();
      }),

    setLastAutoSavedAt: (ts) =>
      set((state) => {
        state.lastAutoSavedAt = ts;
      }),

    resetProject: () =>
      set((state) => {
        state.projectPath = null;
        state.projectName = "未命名项目";
        state.modified = false;
        state.lastSavedAt = null;
        state.lastAutoSavedAt = null;
      }),
  })),
);
