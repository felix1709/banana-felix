import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

type JobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

interface GenerationJob {
  id: string;
  nodeId: string;
  type: "image" | "video" | "music" | "chat" | "analyze" | "inpaint" | "upscale" | "extract" | "agent" | "gen-music" | "custom-agent" | "inpaint-crop" | "inpaint-stitch" | "jimeng-super-resolution" | "topaz-upscale" | "extract-characters-scenes" | "character-description" | "scene-description" | "generate-character-video" | "generate-scene-video" | "generate-character-image" | "generate-scene-image" | "canvas-gen-image";
  taskId: string; // empty string = not yet assigned; real ID = async task from API
  status: JobStatus;
  progress: number;
  createdAt: number;
  error?: string;
  resultUrl?: string;
  apiBaseUrl?: string;
  apiApiKey?: string;
  log?: string[];
}

interface JobState {
  jobs: GenerationJob[];
  activeJobId: string | null;

  addJob: (job: GenerationJob) => string;
  updateJob: (id: string, patch: Partial<GenerationJob>) => void;
  appendJobLog: (id: string, entry: string) => void;
  removeJob: (id: string) => void;
  setActiveJob: (id: string | null) => void;
  getJobsByNodeId: (nodeId: string) => GenerationJob[];
  getLatestJobByNodeId: (nodeId: string) => GenerationJob | undefined;
  clearCompletedJobs: () => void;
}

export const useJobStore = create<JobState>()(
  immer((set, get) => ({
    jobs: [],
    activeJobId: null,

    addJob: (job) => {
      set((state) => {
        state.jobs.push(job);
      });
      return job.id;
    },

    updateJob: (id, patch) =>
      set((state) => {
        const idx = state.jobs.findIndex((j) => j.id === id);
        if (idx !== -1) Object.assign(state.jobs[idx], patch);
      }),

    appendJobLog: (id, entry) =>
      set((state) => {
        const idx = state.jobs.findIndex((j) => j.id === id);
        if (idx !== -1) {
          if (!state.jobs[idx].log) state.jobs[idx].log = [];
          state.jobs[idx].log!.push(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${entry}`);
        }
      }),

    removeJob: (id) =>
      set((state) => {
        state.jobs = state.jobs.filter((j) => j.id !== id);
        if (state.activeJobId === id) state.activeJobId = null;
      }),

    setActiveJob: (id) =>
      set((state) => {
        state.activeJobId = id;
      }),

    getJobsByNodeId: (nodeId) => {
      return get().jobs.filter((j) => j.nodeId === nodeId);
    },

    getLatestJobByNodeId: (nodeId) => {
      const nodeJobs = get().jobs.filter((j) => j.nodeId === nodeId);
      return nodeJobs.length > 0
        ? nodeJobs.reduce((a, b) => (a.createdAt > b.createdAt ? a : b))
        : undefined;
    },

    clearCompletedJobs: () =>
      set((state) => {
        state.jobs = state.jobs.filter(
          (j) => j.status !== "succeeded" && j.status !== "failed" && j.status !== "cancelled",
        );
      }),
  })),
);
