import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { RemoteModel } from "../services/apiService";

interface WorkspaceState {
  projectName: string;
  baseUrl: string;
  apiKey: string;
  chatBaseUrl: string;
  chatApiKey: string;
  videoBaseUrl: string;
  videoApiKey: string;
  lastSavedAt: number | null;
  autoSaveInterval: number; // minutes
  autoSaveEnabled: boolean;
  downloadDir: string;
  remoteModels: RemoteModel[];
  modelsLoading: boolean;

  setProjectName: (name: string) => void;
  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setChatBaseUrl: (url: string) => void;
  setChatApiKey: (key: string) => void;
  setVideoBaseUrl: (url: string) => void;
  setVideoApiKey: (key: string) => void;
  setLastSavedAt: (ts: number) => void;
  setAutoSaveInterval: (minutes: number) => void;
  setAutoSaveEnabled: (on: boolean) => void;
  setDownloadDir: (dir: string) => void;
  setRemoteModels: (models: RemoteModel[]) => void;
  setModelsLoading: (loading: boolean) => void;
  getImageModels: () => RemoteModel[];
  getVideoModels: () => RemoteModel[];
  getChatApiUrl: () => string;
  getChatApiKey: () => string;
  getVideoApiUrl: () => string;
  getVideoApiKey: () => string;
  loadWorkspace: (data: Partial<WorkspaceState>) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set, get) => {
    const ls = (key: string) => typeof localStorage !== "undefined"
      ? localStorage.getItem(key) || ""
      : "";

    return {
      projectName: "未命名项目",
      baseUrl: ls("banana_canvas_global_base_url"),
      apiKey: ls("banana_canvas_global_key"),
      chatBaseUrl: ls("banana_canvas_chat_base_url"),
      chatApiKey: ls("banana_canvas_chat_key"),
      videoBaseUrl: ls("banana_canvas_video_base_url"),
      videoApiKey: ls("banana_canvas_video_key"),
      lastSavedAt: null,
      autoSaveInterval: 5,
      autoSaveEnabled: true,
      downloadDir: "",
      remoteModels: [],
      modelsLoading: false,

      setProjectName: (name) =>
        set((state) => { state.projectName = name; }),

      setBaseUrl: (url) =>
        set((state) => {
          state.baseUrl = url;
          if (typeof localStorage !== "undefined") localStorage.setItem("banana_canvas_global_base_url", url);
        }),

      setApiKey: (key) =>
        set((state) => {
          state.apiKey = key;
          if (typeof localStorage !== "undefined") localStorage.setItem("banana_canvas_global_key", key);
        }),

      setChatBaseUrl: (url) =>
        set((state) => {
          state.chatBaseUrl = url;
          if (typeof localStorage !== "undefined") localStorage.setItem("banana_canvas_chat_base_url", url);
        }),

      setChatApiKey: (key) =>
        set((state) => {
          state.chatApiKey = key;
          if (typeof localStorage !== "undefined") localStorage.setItem("banana_canvas_chat_key", key);
        }),

      setVideoBaseUrl: (url) =>
        set((state) => {
          state.videoBaseUrl = url;
          if (typeof localStorage !== "undefined") localStorage.setItem("banana_canvas_video_base_url", url);
        }),

      setVideoApiKey: (key) =>
        set((state) => {
          state.videoApiKey = key;
          if (typeof localStorage !== "undefined") localStorage.setItem("banana_canvas_video_key", key);
        }),

      setLastSavedAt: (ts) =>
        set((state) => { state.lastSavedAt = ts; }),

      setAutoSaveInterval: (minutes) =>
        set((state) => { state.autoSaveInterval = minutes; }),

      setAutoSaveEnabled: (on) =>
        set((state) => { state.autoSaveEnabled = on; }),

      setDownloadDir: (dir) =>
        set((state) => { state.downloadDir = dir; }),

      setRemoteModels: (models) =>
        set((state) => { state.remoteModels = models; }),

      setModelsLoading: (loading) =>
        set((state) => { state.modelsLoading = loading; }),

      getImageModels: () => {
        return get().remoteModels.filter((m) => m.type === "image");
      },

      getVideoModels: () => {
        return get().remoteModels.filter((m) => m.type === "video");
      },

      getChatApiUrl: () => {
        return get().chatBaseUrl || get().baseUrl;
      },

      getChatApiKey: () => {
        return get().chatApiKey || get().apiKey;
      },

      getVideoApiUrl: () => {
        return get().videoBaseUrl || get().baseUrl;
      },

      getVideoApiKey: () => {
        return get().videoApiKey || get().apiKey;
      },

      loadWorkspace: (data) =>
        set((state) => {
          Object.assign(state, data);
        }),
    };
  }),
);
