import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";

type Theme = "dark" | "light";
type ActiveTool = "select" | "brush" | "eraser";

export type MouseButton = "left" | "middle" | "right";
export type ZoomDirection = "normal" | "reverse";

export interface KeybindingConfig {
  selectButton: MouseButton;
  panButton: MouseButton;
  zoomDirection: ZoomDirection;
}

const DEFAULT_KEYBINDING: KeybindingConfig = {
  selectButton: "left",
  panButton: "middle",
  zoomDirection: "normal",
};

function loadKeybinding(): KeybindingConfig {
  try {
    const saved = localStorage.getItem("banana-canvas-keybinding");
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<KeybindingConfig>;
      return { ...DEFAULT_KEYBINDING, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_KEYBINDING };
}

const MOUSE_BUTTON_MAP: Record<MouseButton, number> = {
  left: 0,
  middle: 1,
  right: 2,
};

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  msg: string;
}

interface UIState {
  theme: Theme;
  leftToolbarOpen: boolean;
  rightToolbarOpen: boolean;
  chatPanelOpen: boolean;
  chatPanelMode: "sidebar" | "float";
  historyPanelOpen: boolean;
  activeTool: ActiveTool;
  contextMenu: ContextMenuState | null;
  performanceMode: boolean;
  canvasBgColorDark: string;
  canvasBgColorLight: string;
  toasts: Toast[];
  connectingTarget: string | null;
  keybinding: KeybindingConfig;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleLeftToolbar: () => void;
  toggleRightToolbar: () => void;
  toggleChatPanel: () => void;
  setChatPanelMode: (mode: "sidebar" | "float") => void;
  toggleHistoryPanel: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  showContextMenu: (menu: ContextMenuState) => void;
  hideContextMenu: () => void;
  setPerformanceMode: (on: boolean) => void;
  setCanvasBgColor: (theme: Theme, color: string) => void;
  addToast: (type: Toast["type"], msg: string) => void;
  removeToast: (id: string) => void;
  setConnectingTarget: (id: string | null) => void;
  setKeybinding: (config: Partial<KeybindingConfig>) => void;
}

interface ContextMenuState {
  type: "canvas" | "node" | "edge" | "multi-select" | "preview" | "image-input";
  x: number;
  y: number;
  targetId?: string;
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    theme: "dark",
    leftToolbarOpen: true,
    rightToolbarOpen: false,
    chatPanelOpen: false,
    chatPanelMode: "sidebar",
    historyPanelOpen: false,
    activeTool: "select",
    contextMenu: null,
    performanceMode: false,
    canvasBgColorDark: "#09090b",
    canvasBgColorLight: "#f4f4f5",

    toggleTheme: () =>
      set((state) => {
        state.theme = state.theme === "dark" ? "light" : "dark";
      }),

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),

    toggleLeftToolbar: () =>
      set((state) => {
        state.leftToolbarOpen = !state.leftToolbarOpen;
      }),

    toggleRightToolbar: () =>
      set((state) => {
        state.rightToolbarOpen = !state.rightToolbarOpen;
      }),

    toggleChatPanel: () =>
      set((state) => {
        state.chatPanelOpen = !state.chatPanelOpen;
      }),

    setChatPanelMode: (mode) =>
      set((state) => {
        state.chatPanelMode = mode;
      }),

    toggleHistoryPanel: () =>
      set((state) => {
        state.historyPanelOpen = !state.historyPanelOpen;
      }),

    setActiveTool: (tool) =>
      set((state) => {
        state.activeTool = tool;
      }),

    showContextMenu: (menu) =>
      set((state) => {
        state.contextMenu = menu;
      }),

    hideContextMenu: () =>
      set((state) => {
        state.contextMenu = null;
      }),

    setPerformanceMode: (on) =>
      set((state) => {
        state.performanceMode = on;
      }),

    toasts: [],
    connectingTarget: null,
    keybinding: loadKeybinding(),

    addToast: (type, msg) => {
      const id = uuid();
      set((state) => {
        state.toasts.push({ id, type, msg });
        if (state.toasts.length > 5) state.toasts.shift();
      });
      setTimeout(() => {
        useUIStore.getState().removeToast(id);
      }, 5000);
    },

    removeToast: (id) =>
      set((state) => {
        state.toasts = state.toasts.filter((t) => t.id !== id);
      }),

    setCanvasBgColor: (theme, color) =>
      set((state) => {
        if (theme === "dark") state.canvasBgColorDark = color;
        else state.canvasBgColorLight = color;
      }),

    setConnectingTarget: (id: string | null) =>
      set((state) => {
        state.connectingTarget = id;
      }),

    setKeybinding: (config) =>
      set((state) => {
        Object.assign(state.keybinding, config);
        try {
          localStorage.setItem("banana-canvas-keybinding", JSON.stringify(state.keybinding));
        } catch { /* ignore */ }
      }),
  })),
);

export function getPanDragButtons(): number[] {
  const kb = useUIStore.getState().keybinding;
  return [MOUSE_BUTTON_MAP[kb.panButton]];
}
