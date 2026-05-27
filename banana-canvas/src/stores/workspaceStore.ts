import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { RemoteModel } from "../services/apiService";

interface WorkspaceState {
  projectName: string;
  baseUrl: string;
  apiKey: string;
  lastSavedAt: number | null;
  autoSaveInterval: number; // minutes
  autoSaveEnabled: boolean;
  downloadDir: string;
  remoteModels: RemoteModel[];
  modelsLoading: boolean;

  setProjectName: (name: string) => void;
  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setLastSavedAt: (ts: number) => void;
  setAutoSaveInterval: (minutes: number) => void;
  setAutoSaveEnabled: (on: boolean) => void;
  setDownloadDir: (dir: string) => void;
  setRemoteModels: (models: RemoteModel[]) => void;
  setModelsLoading: (loading: boolean) => void;
  getImageModels: () => RemoteModel[];
  getVideoModels: () => RemoteModel[];
  loadWorkspace: (data: Partial<WorkspaceState>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set, get) => {
    const savedBaseUrl = typeof localStorage !== "undefined"
      ? localStorage.getItem("banana_canvas_global_base_url") || ""
      : "";
    const savedApiKey = typeof localStorage !== "undefined"
      ? localStorage.getItem("banana_canvas_global_key") || ""
      : "";

    return {
      projectName: "未命名项目",
      baseUrl: savedBaseUrl,
      apiKey: savedApiKey,
      lastSavedAt: null,
      autoSaveInterval: 5,
      autoSaveEnabled: true,
      downloadDir: "",
      remoteModels: [],
      modelsLoading: false,

      setProjectName: (name) =>
        set((state) => {
          state.projectName = name;
        }),

      setBaseUrl: (url) =>
        set((state) => {
          state.baseUrl = url;
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("banana_canvas_global_base_url", url);
          }
        }),

      setApiKey: (key) =>
        set((state) => {
          state.apiKey = key;
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("banana_canvas_global_key", key);
          }
        }),

      setLastSavedAt: (ts) =>
        set((state) => {
          state.lastSavedAt = ts;
        }),

      setAutoSaveInterval: (minutes) =>
        set((state) => {
          state.autoSaveInterval = minutes;
        }),

      setAutoSaveEnabled: (on) =>
        set((state) => {
          state.autoSaveEnabled = on;
        }),

      setDownloadDir: (dir) =>
        set((state) => {
          state.downloadDir = dir;
        }),

      setRemoteModels: (models) =>
        set((state) => {
          state.remoteModels = models;
        }),

      setModelsLoading: (loading) =>
        set((state) => {
          state.modelsLoading = loading;
        }),

      getImageModels: () => {
        return get().remoteModels.filter((m) => m.type === "image");
      },

      getVideoModels: () => {
        return get().remoteModels.filter((m) => m.type === "video");
      },

      loadWorkspace: (data) =>
        set((state) => {
          Object.assign(state, data);
        }),
    };
  }),
);
