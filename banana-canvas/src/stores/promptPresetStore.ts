import { create } from "zustand";

export interface PromptPreset {
  id: string;
  name: string;
  positivePrompt: string;
  negativePrompt: string;
  qualityPrompt: string;
  createdAt: number;
}

const STORAGE_KEY = "banana_canvas_prompt_presets";

function loadPresets(): PromptPreset[] {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function savePresets(presets: PromptPreset[]) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    }
  } catch {
    // localStorage full or unavailable
  }
}

interface PresetState {
  presets: PromptPreset[];
  addPreset: (preset: Omit<PromptPreset, "id" | "createdAt">) => string;
  updatePreset: (id: string, patch: Partial<Omit<PromptPreset, "id" | "createdAt">>) => void;
  deletePreset: (id: string) => void;
}

export const usePresetStore = create<PresetState>((set) => ({
  presets: loadPresets(),

  addPreset: (preset) => {
    const id = `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: PromptPreset = {
      ...preset,
      id,
      createdAt: Date.now(),
    };
    set((state) => {
      const next = [...state.presets, entry];
      savePresets(next);
      return { presets: next };
    });
    return id;
  },

  updatePreset: (id, patch) => {
    set((state) => {
      const next = state.presets.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      );
      savePresets(next);
      return { presets: next };
    });
  },

  deletePreset: (id) => {
    set((state) => {
      const next = state.presets.filter((p) => p.id !== id);
      savePresets(next);
      return { presets: next };
    });
  },
}));
