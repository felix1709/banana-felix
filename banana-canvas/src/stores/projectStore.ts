import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AutoSaveMode, AutoSaveStatus } from "../services/projectAutoSave";

interface ProjectState {
  projectPath: string | null;
  projectName: string;
  modified: boolean;
  lastSavedAt: number | null;
  lastAutoSavedAt: number | null;
  autoSaveMode: AutoSaveMode;
  autoSaveStatus: AutoSaveStatus;
  autoSaveError: string;

  setProjectPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  markModified: () => void;
  markSaved: () => void;
  markAutoSaving: () => void;
  markAutoSaved: (ts: number, mode: AutoSaveMode) => void;
  markAutoSaveFailed: (message: string) => void;
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
    autoSaveMode: "temporary",
    autoSaveStatus: "idle",
    autoSaveError: "",

    setProjectPath: (path) =>
      set((state) => {
        state.projectPath = path;
        state.autoSaveMode = path ? "project" : "temporary";
      }),

    setProjectName: (name) =>
      set((state) => {
        state.projectName = name;
      }),

    markModified: () =>
      set((state) => {
        state.modified = true;
        if (state.autoSaveStatus === "saved") state.autoSaveStatus = "idle";
      }),

    markSaved: () =>
      set((state) => {
        state.modified = false;
        state.lastSavedAt = Date.now();
        state.lastAutoSavedAt = state.lastSavedAt;
        state.autoSaveMode = state.projectPath ? "project" : "temporary";
        state.autoSaveStatus = state.projectPath ? "saved" : "idle";
        state.autoSaveError = "";
      }),

    markAutoSaving: () =>
      set((state) => {
        state.autoSaveStatus = "saving";
        state.autoSaveError = "";
      }),

    markAutoSaved: (ts, mode) =>
      set((state) => {
        state.modified = false;
        state.lastAutoSavedAt = ts;
        state.autoSaveMode = mode;
        state.autoSaveStatus = "saved";
        state.autoSaveError = "";
      }),

    markAutoSaveFailed: (message) =>
      set((state) => {
        state.modified = true;
        state.autoSaveStatus = "error";
        state.autoSaveError = message;
      }),

    setLastAutoSavedAt: (ts) =>
      set((state) => {
        state.lastAutoSavedAt = ts;
        state.autoSaveStatus = "idle";
      }),

    resetProject: () =>
      set((state) => {
        state.projectPath = null;
        state.projectName = "未命名项目";
        state.modified = false;
        state.lastSavedAt = null;
        state.lastAutoSavedAt = null;
        state.autoSaveMode = "temporary";
        state.autoSaveStatus = "saved";
        state.autoSaveError = "";
      }),
  })),
);
