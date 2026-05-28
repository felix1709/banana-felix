import type { SessionIndexEntry, ChatMessage } from "../types/agent";
import { v4 as uuid } from "uuid";

const SESSION_INDEX_KEY = "banana_canvas_sessions";
const SESSION_DATA_PREFIX = "banana_canvas_session_";

// ── Session index (lightweight metadata list) ──

export function getSessionIndex(): SessionIndexEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSessionIndex(entries: SessionIndexEntry[]): void {
  localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(entries));
}

// ── Per-session data (messages + model) ──

export interface SessionData {
  messages: ChatMessage[];
  selectedModel: string;
}

export function loadSessionData(sessionId: string): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_DATA_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSessionData(sessionId: string, data: SessionData): void {
  try {
    localStorage.setItem(SESSION_DATA_PREFIX + sessionId, JSON.stringify(data));
  } catch {
    // localStorage full — prune oldest sessions beyond 10
    const index = getSessionIndex();
    if (index.length > 10) {
      const toRemove = index.slice(10);
      toRemove.forEach((s) => deleteSessionData(s.id));
      saveSessionIndex(index.slice(0, 10));
      try {
        localStorage.setItem(SESSION_DATA_PREFIX + sessionId, JSON.stringify(data));
      } catch { /* give up */ }
    }
  }
}

export function deleteSessionData(sessionId: string): void {
  localStorage.removeItem(SESSION_DATA_PREFIX + sessionId);
}

// ── Legacy migration ──

export function migrateFromLegacy(): void {
  const legacyRaw = localStorage.getItem("banana_canvas_agent");
  if (!legacyRaw) return;
  try {
    const parsed = JSON.parse(legacyRaw);
    if (parsed.messages && parsed.messages.length > 0) {
      const sessionId = uuid();
      const now = Date.now();
      const firstUserMsg = (parsed.messages as ChatMessage[]).find((m) => m.role === "user");
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "..." : "")
        : "旧对话";

      saveSessionData(sessionId, { messages: parsed.messages, selectedModel: parsed.selectedModel ?? "" });
      saveSessionIndex([{ id: sessionId, title, createdAt: now, updatedAt: now, messageCount: parsed.messages.length }]);
    }
    localStorage.removeItem("banana_canvas_agent");
  } catch { /* ignore */ }
}
