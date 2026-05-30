import { useWorkspaceStore } from "../stores/workspaceStore";
import { useGraphStore } from "../stores/graphStore";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function getHttpFetch(): Promise<typeof globalThis.fetch> {
  if (isTauri) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch as typeof globalThis.fetch;
  }
  return globalThis.fetch;
}

export interface ChatMessageParam {
  role: "system" | "user" | "assistant";
  content: ChatMessageContent;
}

export type ChatMessageContent = string | ChatMessageContentPart[];

export type ChatMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

// Non-streaming chat completion
export async function sendChatMessage(params: {
  model: string;
  messages: ChatMessageParam[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { chatBaseUrl, chatApiKey, baseUrl, apiKey } = useWorkspaceStore.getState();
  const url_base = chatBaseUrl || baseUrl;
  const key = chatApiKey || apiKey;
  if (!url_base) throw new Error("API 地址未配置");

  const url = `${url_base}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const body = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 2048,
    stream: false,
  };

  const httpFetch = await getHttpFetch();
  const response = await httpFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat API 错误 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Streaming chat completion (SSE)
export async function streamChatMessage(params: {
  model: string;
  messages: ChatMessageParam[];
  temperature?: number;
  maxTokens?: number;
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}): Promise<void> {
  const { chatBaseUrl, chatApiKey, baseUrl, apiKey } = useWorkspaceStore.getState();
  const url_base = chatBaseUrl || baseUrl;
  const key = chatApiKey || apiKey;
  if (!url_base) {
    params.onError(new Error("API 地址未配置"));
    return;
  }

  const url = `${url_base}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const body = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 2048,
    stream: true,
  };

  try {
    const httpFetch = await getHttpFetch();
    const response = await httpFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API 错误 (${response.status}): ${errorText}`);
    }

    // Tauri HTTP plugin may not support ReadableStream the same way
    // Fall back to reading full response if streaming is not available
    if (!response.body) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      params.onChunk(content);
      params.onDone(content);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            params.onChunk(fullText);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    params.onDone(fullText);
  } catch (err) {
    params.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// Build canvas context string from current graph state
export function buildCanvasContext(): string {
  const { nodes, edges } = useGraphStore.getState();
  if (nodes.length === 0) return "当前画布为空。";

  const lines: string[] = ["当前画布内容："];

  for (const node of nodes.slice(0, 30)) {
    const label = node.nodeName || node.type;
    let desc = `  - [${node.type}] ${label}`;
    if (node.prompt) desc += ` | 提示词: ${node.prompt.slice(0, 100)}`;
    if (node.content && node.content.startsWith("data:")) {
      desc += " | (含上传图片)";
    } else if (node.content && node.content.startsWith("http")) {
      desc += " | (含远程图片)";
    } else if (node.content && node.content.length < 200) {
      desc += ` | 内容: ${node.content}`;
    }
    lines.push(desc);
  }

  if (edges.length > 0) {
    lines.push(`  共 ${edges.length} 条连线`);
  }

  return lines.join("\n");
}
