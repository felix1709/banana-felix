import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface HistoryEntry {
  nodes: string; // JSON serialized
  edges: string;
  groups: string;
  timestamp: number;
  label?: string;
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  maxSize: number;

  push: (entry: Omit<HistoryEntry, "timestamp">) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>()(
  immer((set, get) => ({
    past: [],
    future: [],
    maxSize: 60,

    push: (entry) =>
      set((state) => {
        state.past.push({ ...entry, timestamp: Date.now() });
        if (state.past.length > state.maxSize) {
          state.past.shift();
        }
        state.future = [];
      }),

    undo: () => {
      const { past } = get();
      if (past.length === 0) return null;
      const entry = { ...past[past.length - 1] };
      set((state) => {
        state.future.push(state.past.pop()!);
      });
      return entry;
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) return null;
      const entry = { ...future[future.length - 1] };
      set((state) => {
        state.past.push(state.future.pop()!);
      });
      return entry;
    },

    clear: () =>
      set((state) => {
        state.past = [];
        state.future = [];
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  })),
);
