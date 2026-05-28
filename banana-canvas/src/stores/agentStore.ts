import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import type { ChatMessage, AgentStatus, DeployPreview, SkillPhase, StoryboardOutput, SessionIndexEntry } from "../types/agent";
import {
  getSessionIndex, saveSessionIndex,
  loadSessionData, saveSessionData, deleteSessionData,
  migrateFromLegacy,
} from "../services/sessionStorage";

const MAX_MESSAGES = 200;

// Run legacy migration on first load
migrateFromLegacy();

// Initialize: load session index, pick most recent session
const initialIndex = getSessionIndex();
const initialSession = initialIndex.length > 0 ? initialIndex[0] : null;
const initialData = initialSession ? loadSessionData(initialSession.id) : null;

function persistCurrentSession(state: { activeSessionId: string | null; messages: ChatMessage[]; selectedModel: string }) {
  if (!state.activeSessionId) return;
  saveSessionData(state.activeSessionId, {
    messages: state.messages,
    selectedModel: state.selectedModel,
  });
  // Update index entry
  const index = getSessionIndex();
  const entry = index.find((e) => e.id === state.activeSessionId);
  if (entry) {
    entry.updatedAt = Date.now();
    entry.messageCount = state.messages.length;
    saveSessionIndex(index);
  }
}

interface AgentState {
  panelOpen: boolean;
  // Session management
  sessions: SessionIndexEntry[];
  activeSessionId: string | null;
  // Current session data
  messages: ChatMessage[];
  status: AgentStatus;
  selectedModel: string;
  skillPhase: SkillPhase;
  storyboardData: StoryboardOutput | null;
  pendingDeploy: DeployPreview | null;
  streamingText: string;

  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateLastAssistant: (content: string) => void;
  clearMessages: () => void;
  setStatus: (status: AgentStatus) => void;

  setSelectedModel: (model: string) => void;

  setSkillPhase: (phase: SkillPhase) => void;
  setStoryboardData: (data: StoryboardOutput | null) => void;
  resetSkill: () => void;

  setPendingDeploy: (preview: DeployPreview | null) => void;
  setStreamingText: (text: string) => void;
  commitStreamingText: () => void;

  // Session actions
  createNewSession: () => void;
  switchToSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
}

export const useAgentStore = create<AgentState>()(
  immer((set, _get) => ({
    panelOpen: false,
    sessions: initialIndex,
    activeSessionId: initialSession?.id ?? null,
    messages: (initialData?.messages ?? []).slice(-MAX_MESSAGES),
    status: "idle",
    selectedModel: initialData?.selectedModel ?? "",
    skillPhase: "idle",
    storyboardData: null,
    pendingDeploy: null,
    streamingText: "",

    openPanel: () =>
      set((state) => {
        state.panelOpen = true;
      }),

    closePanel: () =>
      set((state) => {
        state.panelOpen = false;
      }),

    togglePanel: () =>
      set((state) => {
        state.panelOpen = !state.panelOpen;
      }),

    addMessage: (msg) =>
      set((state) => {
        const full: ChatMessage = { ...msg, id: uuid(), timestamp: Date.now() };
        state.messages.push(full);
        if (state.messages.length > MAX_MESSAGES) {
          state.messages = state.messages.slice(-MAX_MESSAGES);
        }
        persistCurrentSession(state);

        // Auto-title on first user message
        if (msg.role === "user" && state.activeSessionId) {
          const index = getSessionIndex();
          const entry = index.find((e) => e.id === state.activeSessionId);
          if (entry && (entry.title === "新对话" || entry.title === "旧对话")) {
            const title = msg.content.slice(0, 30) + (msg.content.length > 30 ? "..." : "");
            entry.title = title;
            saveSessionIndex(index);
            state.sessions = index;
          }
        }
      }),

    updateLastAssistant: (content) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === "assistant") {
          last.content = content;
        }
      }),

    clearMessages: () =>
      set((state) => {
        state.messages = [];
        state.skillPhase = "idle";
        state.storyboardData = null;
        persistCurrentSession(state);
      }),

    setStatus: (status) =>
      set((state) => {
        state.status = status;
      }),

    setSelectedModel: (model) =>
      set((state) => {
        state.selectedModel = model;
        persistCurrentSession(state);
      }),

    setSkillPhase: (phase) =>
      set((state) => {
        state.skillPhase = phase;
      }),

    setStoryboardData: (data) =>
      set((state) => {
        state.storyboardData = data;
      }),

    resetSkill: () =>
      set((state) => {
        state.skillPhase = "idle";
        state.storyboardData = null;
        state.pendingDeploy = null;
      }),

    setPendingDeploy: (preview) =>
      set((state) => {
        state.pendingDeploy = preview;
      }),

    setStreamingText: (text) =>
      set((state) => {
        state.streamingText = text;
      }),

    commitStreamingText: () =>
      set((state) => {
        if (state.streamingText) {
          const last = state.messages[state.messages.length - 1];
          if (last && last.role === "assistant") {
            last.content = state.streamingText;
          }
          state.streamingText = "";
          persistCurrentSession(state);
        }
      }),

    // ── Session management ──

    createNewSession: () =>
      set((state) => {
        // Save current session first
        persistCurrentSession(state);

        const newId = uuid();
        const now = Date.now();
        const newEntry: SessionIndexEntry = {
          id: newId,
          title: "新对话",
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
        };

        // Add to front of index
        const index = [newEntry, ...getSessionIndex()];
        saveSessionIndex(index);

        saveSessionData(newId, { messages: [], selectedModel: state.selectedModel });

        state.sessions = index;
        state.activeSessionId = newId;
        state.messages = [];
        state.skillPhase = "idle";
        state.storyboardData = null;
        state.pendingDeploy = null;
        state.streamingText = "";
        state.status = "idle";
      }),

    switchToSession: (sessionId) =>
      set((state) => {
        // Save current session
        persistCurrentSession(state);

        // Load target session
        const data = loadSessionData(sessionId);
        state.activeSessionId = sessionId;
        state.messages = (data?.messages ?? []).slice(-MAX_MESSAGES);
        state.selectedModel = data?.selectedModel ?? state.selectedModel;
        state.skillPhase = "idle";
        state.storyboardData = null;
        state.pendingDeploy = null;
        state.streamingText = "";
        state.status = "idle";
      }),

    deleteSession: (sessionId) =>
      set((state) => {
        const index = getSessionIndex().filter((e) => e.id !== sessionId);
        saveSessionIndex(index);
        deleteSessionData(sessionId);
        state.sessions = index;

        // If deleting the active session, switch to the most recent remaining
        if (state.activeSessionId === sessionId) {
          if (index.length > 0) {
            const nextSession = index[0];
            const data = loadSessionData(nextSession.id);
            state.activeSessionId = nextSession.id;
            state.messages = (data?.messages ?? []).slice(-MAX_MESSAGES);
            state.selectedModel = data?.selectedModel ?? state.selectedModel;
          } else {
            // No sessions left — create a new one
            const newId = uuid();
            const now = Date.now();
            const newEntry: SessionIndexEntry = { id: newId, title: "新对话", createdAt: now, updatedAt: now, messageCount: 0 };
            saveSessionIndex([newEntry]);
            saveSessionData(newId, { messages: [], selectedModel: state.selectedModel });
            state.sessions = [newEntry];
            state.activeSessionId = newId;
            state.messages = [];
          }
          state.skillPhase = "idle";
          state.storyboardData = null;
          state.pendingDeploy = null;
          state.streamingText = "";
          state.status = "idle";
        }
      }),

    renameSession: (sessionId, title) =>
      set((state) => {
        const index = getSessionIndex();
        const entry = index.find((e) => e.id === sessionId);
        if (entry) {
          entry.title = title;
          saveSessionIndex(index);
          state.sessions = index;
        }
      }),
  })),
);
