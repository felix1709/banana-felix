import { useWorkspaceStore } from "../stores/workspaceStore";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function getHttpFetch(): Promise<typeof globalThis.fetch> {
  if (isTauri) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch as typeof globalThis.fetch;
  }
  return globalThis.fetch;
}

interface ApiRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}

async function apiRequest<T>(options: ApiRequestOptions): Promise<T> {
  const { baseUrl, apiKey } = useWorkspaceStore.getState();
  if (!baseUrl) throw new Error("API 地址未配置，请先点击右上角「API 设置」配置");

  const url = `${baseUrl}${options.path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const httpFetch = await getHttpFetch();
  const response = await httpFetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// --- Image Generation ---

export interface ImageGenerateRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
  output_format?: string;
  moderation?: string;
  referenceImage?: string;
  referenceImages?: string[];
  sref?: string;
  oref?: string;
}

export interface TaskResponse {
  taskId: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
}

// OpenAI /v1/images/generations response
interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export async function generateImage(req: ImageGenerateRequest): Promise<TaskResponse> {
  // Collect all reference images
  const refImages: string[] = [];
  if (req.referenceImage) refImages.push(req.referenceImage);
  if (req.referenceImages) refImages.push(...req.referenceImages);

  // Build request body — gpt-image-2 uses /v1/images/generations with image[] array
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    n: req.n ?? 1,
    size: req.size ?? "1024x1024",
  };
  if (req.quality) body.quality = req.quality;
  if (req.style) body.style = req.style;
  if (req.output_format) body.output_format = req.output_format;
  if (req.moderation) body.moderation = req.moderation;

  // gpt-image-2 format: image is an array of { type: "input_image", image_url: "..." }
  if (refImages.length > 0) {
    body.image = refImages.map((url) => ({
      type: "input_image",
      image_url: url,
    }));
  }

  try {
    const result = await apiRequest<OpenAIImageResponse | TaskResponse>({
      method: "POST",
      path: "/v1/images/generations",
      body,
    });

    if ("data" in result && Array.isArray(result.data)) {
      const first = result.data[0];
      const imageUrl = first?.url
        || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
      return { taskId: "", status: "succeeded", imageUrl };
    }

    return result as TaskResponse;
  } catch (err) {
    // Fallback 1: try /v1/images/edits with FormData (for APIs that don't support image[] in generations)
    if (refImages.length > 0) {
      try {
        return await generateImageViaEdits(req, refImages);
      } catch {
        // Fall through to next fallback
      }
    }
    // Fallback 2: try /api/v1/image/generate — include images as array
    try {
      const fallbackBody: Record<string, unknown> = {
        model: req.model,
        prompt: req.prompt,
        n: req.n ?? 1,
        size: req.size ?? "1024x1024",
      };
      if (req.referenceImage) fallbackBody.referenceImage = req.referenceImage;
      if (req.referenceImages && req.referenceImages.length > 0) {
        fallbackBody.images = req.referenceImages;
      }
      if (req.quality) fallbackBody.quality = req.quality;
      if (req.style) fallbackBody.style = req.style;

      return await apiRequest<TaskResponse>({
        method: "POST",
        path: "/api/v1/image/generate",
        body: fallbackBody,
      });
    } catch {
      throw err;
    }
  }
}

async function generateImageViaEdits(req: ImageGenerateRequest, refImages: string[]): Promise<TaskResponse> {
  const { baseUrl, apiKey } = useWorkspaceStore.getState();
  if (!baseUrl) throw new Error("API 地址未配置");

  const formData = new FormData();
  formData.append("model", req.model);
  formData.append("prompt", req.prompt);
  formData.append("n", String(req.n ?? 1));
  formData.append("size", req.size ?? "1024x1024");
  if (req.quality) formData.append("quality", req.quality);
  if (req.style) formData.append("style", req.style);
  if (req.output_format) formData.append("output_format", req.output_format);
  if (req.moderation) formData.append("moderation", req.moderation);

  // Attach ALL reference images
  for (let i = 0; i < refImages.length; i++) {
    formData.append("image", dataUrlToBlob(refImages[i]), `image_${i}.png`);
  }

  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const httpFetch = await getHttpFetch();
  const response = await httpFetch(`${baseUrl}/v1/images/edits`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if ("data" in result && Array.isArray(result.data)) {
    const first = result.data[0];
    const imageUrl = first?.url
      || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
    return { taskId: "", status: "succeeded", imageUrl };
  }

  if ("taskId" in result && result.taskId) {
    return { taskId: result.taskId, status: "pending" };
  }

  return result as TaskResponse;
}

// --- Video Generation ---

export interface VideoGenerateRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  duration: number;
  fps: number;
  resolution: string;
  seed?: number;
  startImage?: string;
  endImage?: string;
}

export async function generateVideo(req: VideoGenerateRequest): Promise<TaskResponse> {
  return apiRequest<TaskResponse>({
    method: "POST",
    path: "/v1/videos/generations",
    body: req,
  });
}

// --- Video Analysis ---

export interface VideoAnalyzeRequest {
  model: string;
  videoUrl: string;
  frameImageUrls: string[];
  prompt: string;
}

interface ChatCompletionResponse {
  id: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  taskId?: string;
  status?: string;
}

export async function analyzeVideo(req: VideoAnalyzeRequest): Promise<{ taskId: string; status: string; result: string }> {
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  for (const frameUrl of req.frameImageUrls) {
    contentParts.push({ type: "image_url", image_url: { url: frameUrl } });
  }
  contentParts.push({ type: "text", text: req.prompt });

  const body = {
    model: req.model,
    messages: [
      { role: "user", content: contentParts },
    ],
  };

  const result = await apiRequest<ChatCompletionResponse | TaskResponse>({
    method: "POST",
    path: "/v1/chat/completions",
    body,
  });

  // Sync response: direct chat completion
  if ("choices" in result && result.choices?.[0]?.message?.content) {
    return {
      taskId: "",
      status: "succeeded",
      result: result.choices[0].message.content,
    };
  }

  // Async task response
  if ("taskId" in result && result.taskId) {
    return { taskId: result.taskId, status: "pending", result: "" };
  }

  return { taskId: "", status: "failed", result: "无法解析分析结果" };
}

// --- Image Inpainting ---

export interface InpaintRequest {
  model: string;
  prompt: string;
  image: string;  // base64 data URL
  mask: string;   // base64 data URL, white = repaint area
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function inpaintImage(req: InpaintRequest): Promise<TaskResponse> {
  const { baseUrl, apiKey } = useWorkspaceStore.getState();
  if (!baseUrl) throw new Error("API 地址未配置，请先点击右上角「API 设置」配置");

  const formData = new FormData();
  formData.append("model", req.model);
  formData.append("prompt", req.prompt);
  formData.append("image", dataUrlToBlob(req.image), "image.png");
  formData.append("mask", dataUrlToBlob(req.mask), "mask.png");

  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const httpFetch = await getHttpFetch();

  // Try OpenAI /v1/images/edits first
  try {
    const response = await httpFetch(`${baseUrl}/v1/images/edits`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 错误 (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    // OpenAI direct response
    if ("data" in result && Array.isArray(result.data)) {
      const first = result.data[0];
      const imageUrl = first?.url
        || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
      return { taskId: "", status: "succeeded", imageUrl };
    }

    // Async task response
    if ("taskId" in result && result.taskId) {
      return { taskId: result.taskId, status: "pending" };
    }

    return result as TaskResponse;
  } catch (err) {
    // Fallback: try /api/v1/image/inpaint
    try {
      const fallbackData = new FormData();
      fallbackData.append("model", req.model);
      fallbackData.append("prompt", req.prompt);
      fallbackData.append("image", dataUrlToBlob(req.image), "image.png");
      fallbackData.append("mask", dataUrlToBlob(req.mask), "mask.png");

      const response = await httpFetch(`${baseUrl}/api/v1/image/inpaint`, {
        method: "POST",
        headers,
        body: fallbackData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 错误 (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      if ("data" in result && Array.isArray(result.data)) {
        const first = result.data[0];
        const imageUrl = first?.url
          || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
        return { taskId: "", status: "succeeded", imageUrl };
      }

      return result as TaskResponse;
    } catch {
      throw err;
    }
  }
}

// --- Task Polling ---

export async function pollTask(taskId: string): Promise<TaskResponse> {
  return apiRequest<TaskResponse>({
    method: "GET",
    path: `/v1/tasks/${taskId}`,
  });
}

// --- Connection Test ---

export async function testConnection(): Promise<{ ok: boolean; error?: string; models?: RemoteModel[] }> {
  try {
    const { baseUrl, apiKey } = useWorkspaceStore.getState();
    if (!baseUrl) return { ok: false, error: "API 地址未配置" };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const httpFetch = await getHttpFetch();
    const response = await httpFetch(`${baseUrl}/v1/models`, { headers });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { ok: false, error: `连接失败 (${response.status}): ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();
    const models = parseModelsResponse(data);
    return { ok: true, models };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "连接失败" };
  }
}

// --- Dynamic Model Fetching ---

export interface RemoteModel {
  id: string;
  name: string;
  type: "image" | "video" | "chat" | "unknown";
}

interface OpenAIModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created?: number;
    owned_by?: string;
  }>;
}

// Classify model by its ID keywords
function classifyModel(id: string): "image" | "video" | "chat" | "unknown" {
  const lower = id.toLowerCase();
  const imageKeywords = ["image", "img", "dall", "gpt-image", "flux", "sd", "stable", "midjourney", "mj", "jimeng", "即梦", "seedream", "wan", "z-image", "qwen-image", "grok-image", "gemini-image", "nano-banana", "doubao-image", "paint", "draw", "gen-img", "sdxl", "kontext", "imagen", "imagegeneration"];
  const videoKeywords = ["video", "vid", "veo", "kling", "可灵", "cogvideo", "hailuo", "luma", "pika", "runway", "animate", "gen-vid", "wan-video", "sora"];
  const chatKeywords = ["gpt-4", "gpt-3", "chat", "claude", "llama", "qwen", "gemini-pro", "gemini-flash", "deepseek", "yi", "mistral", "codestral"];

  if (videoKeywords.some((k) => lower.includes(k))) return "video";
  if (chatKeywords.some((k) => lower.includes(k))) return "chat";
  if (imageKeywords.some((k) => lower.includes(k))) return "image";
  // Models not matching any known keyword default to "image" — most API models are generation models
  return "image";
}

export function parseModelsResponse(data: unknown): RemoteModel[] {
  if (!data || typeof data !== "object") return [];

  // OpenAI format: { object: "list", data: [{ id: "model-name", ... }] }
  const resp = data as OpenAIModelsResponse;
  if (resp.data && Array.isArray(resp.data)) {
    return resp.data.map((m) => ({
      id: m.id,
      name: m.id,
      type: classifyModel(m.id),
    }));
  }

  return [];
}

export async function fetchModels(): Promise<RemoteModel[]> {
  const result = await testConnection();
  return result.models ?? [];
}
