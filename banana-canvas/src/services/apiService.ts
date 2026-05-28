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
  overrideBaseUrl?: string;
  overrideApiKey?: string;
}

async function apiRequest<T>(options: ApiRequestOptions): Promise<T> {
  const baseUrl = options.overrideBaseUrl ?? useWorkspaceStore.getState().baseUrl;
  const apiKey = options.overrideApiKey ?? useWorkspaceStore.getState().apiKey;
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
  ratio?: string;
  generateAudio?: boolean;
  smartDuration?: boolean;
  referenceMode?: string;
  // Reference materials from connected/@mentioned nodes
  referenceImageUrl?: string;
  referenceVideoUrl?: string;
  referenceAudioUrl?: string;
  images?: string[];
}

export async function generateVideo(req: VideoGenerateRequest): Promise<TaskResponse> {
  const videoBaseUrl = useWorkspaceStore.getState().videoBaseUrl;
  const videoApiKey = useWorkspaceStore.getState().videoApiKey;
  const opts = {
    ...(videoBaseUrl ? { overrideBaseUrl: videoBaseUrl, overrideApiKey: videoApiKey || undefined } : {}),
  };

  // Build body with compatibility aliases for one-api/new-api proxies
  const body: Record<string, unknown> = {
    ...req,
    // one-api uses "size" for aspect ratio (same as OpenAI image API)
    size: req.ratio || "16:9",
    // Seedance/Volcengine uses "image_url" for reference/first-frame image
    image_url: req.startImage || req.referenceImageUrl || undefined,
    // Last frame image for Seedance
    lastframe_image: req.endImage || undefined,
    // Audio reference URL
    audio_url: req.referenceAudioUrl || undefined,
    // Video reference URL
    video_url: req.referenceVideoUrl || undefined,
    // Some proxies use "audio" instead of "generateAudio"
    audio: req.generateAudio,
  };

  // Try video endpoint first, then fall back to image endpoint
  try {
    const raw = await apiRequest<Record<string, unknown>>({
      method: "POST",
      path: "/v1/video/generations",
      body,
      ...opts,
    });
    return normalizeVideoResponse(raw);
  } catch (primaryErr) {
    // 404 = endpoint doesn't exist; 400 = model not supported on this endpoint
    const msg = primaryErr instanceof Error ? primaryErr.message : "";
    const isRecoverable = /\(404\)/.test(msg) || /\(400\)/.test(msg);
    if (isRecoverable) {
      try {
        return await generateVideoViaImageEndpoint(req, opts);
      } catch {
        throw primaryErr;
      }
    }
    throw primaryErr;
  }
}

function normalizeVideoResponse(raw: Record<string, unknown>): TaskResponse {
  const taskId = String(raw.taskId || raw.id || raw.task_id || "");
  const status = String(raw.status || "pending");

  // Extract video URL from various locations
  let videoUrl = String(raw.videoUrl ?? raw.video_url ?? "");
  if (!videoUrl) {
    const output = raw.output as Record<string, unknown> | undefined;
    videoUrl = String(output?.video_url ?? output?.videoUrl ?? output?.url ?? "");
  }
  if (!videoUrl && raw.data && Array.isArray(raw.data)) {
    const first = raw.data[0] as Record<string, unknown> | undefined;
    videoUrl = String(first?.url ?? first?.video_url ?? "");
  }
  if (!videoUrl) {
    videoUrl = String(raw.url ?? "");
  }

  const error = raw.error
    ? (typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error))
    : undefined;

  return {
    taskId,
    status: status as TaskResponse["status"],
    videoUrl: videoUrl || undefined,
    imageUrl: videoUrl || undefined,
    error,
  };
}

async function generateVideoViaImageEndpoint(
  req: VideoGenerateRequest,
  opts: { overrideBaseUrl?: string; overrideApiKey?: string },
): Promise<TaskResponse> {
  // Build image-generation-style body with video-specific fields
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    n: 1,
    size: req.ratio || "16:9",
  };
  if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
  if (req.duration) body.duration = req.duration;
  if (req.fps) body.fps = req.fps;
  if (req.resolution) body.resolution = req.resolution;
  if (req.seed !== undefined) body.seed = req.seed;
  if (req.startImage) body.startImage = req.startImage;
  if (req.endImage) body.endImage = req.endImage;
  if (req.generateAudio !== undefined) body.generateAudio = req.generateAudio;
  if (req.smartDuration !== undefined) body.smartDuration = req.smartDuration;
  if (req.referenceMode) body.referenceMode = req.referenceMode;
  // Reference materials
  if (req.referenceImageUrl) body.image_url = req.referenceImageUrl;
  if (req.referenceVideoUrl) body.video_url = req.referenceVideoUrl;
  if (req.referenceAudioUrl) body.audio_url = req.referenceAudioUrl;
  if (req.images && req.images.length > 0) body.images = req.images;
  // Compatibility aliases
  if (req.startImage || req.referenceImageUrl) body.image_url = req.startImage || req.referenceImageUrl;
  if (req.endImage) body.lastframe_image = req.endImage;
  if (req.generateAudio !== undefined) body.audio = req.generateAudio;

  const result = await apiRequest<{ data?: Array<{ url?: string; b64_json?: string }>; taskId?: string; status?: string; videoUrl?: string; imageUrl?: string; error?: string }>({
    method: "POST",
    path: "/v1/images/generations",
    body,
    ...opts,
  });

  // Direct response with data array
  if ("data" in result && Array.isArray(result.data)) {
    const first = result.data[0];
    const url = first?.url || (first?.b64_json ? `data:video/mp4;base64,${first.b64_json}` : "");
    return { taskId: "", status: "succeeded", videoUrl: url, imageUrl: url };
  }

  // Async task response — check taskId, id, task_id
  const rawRes = result as unknown as Record<string, unknown>;
  const effectiveTaskId = String(rawRes.taskId || rawRes.id || rawRes.task_id || "");
  if (effectiveTaskId) {
    return normalizeVideoResponse(rawRes);
  }

  // Already a TaskResponse shape
  if ("status" in result) {
    return result as TaskResponse;
  }

  return { taskId: "", status: "failed", error: "无法解析视频生成结果" };
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

// Cache which polling endpoint works for each base URL
const pollEndpointCache = new Map<string, string>();

// Normalize various API response formats into a consistent TaskResponse
function normalizePollResponse(raw: Record<string, unknown>): TaskResponse & { _raw?: Record<string, unknown> } {
  // Some APIs wrap the task info in a "data" object (not array) or "result" object.
  // Merge inner fields with outer fields so we don't lose outer-level status/URL fields.
  let source = raw;
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
    source = { ...(raw.data as Record<string, unknown>), ...raw };
  }
  if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
    source = { ...(raw.result as Record<string, unknown>), ...raw };
  }

  // Extract status from various possible field names
  const rawStatus = String(
    source.status ?? source.state ?? source.task_status ?? source.task_state ?? "unknown"
  ).toLowerCase();

  // Map various status values to our standard statuses
  let mappedStatus: TaskResponse["status"];
  if (["succeeded", "completed", "done", "success", "finished", "complete"].includes(rawStatus)) {
    mappedStatus = "succeeded";
  } else if (["failed", "error", "cancelled", "canceled", "expired"].includes(rawStatus)) {
    mappedStatus = "failed";
  } else if (["processing", "running", "in_progress", "in-progress", "generating", "active"].includes(rawStatus)) {
    mappedStatus = "processing";
  } else {
    mappedStatus = "pending"; // queued, pending, waiting, unknown, etc.
  }

  // Extract task ID
  const taskId = String(source.taskId || source.id || source.task_id || raw.taskId || raw.id || "");

  // Extract video/image URL from various locations
  let videoUrl = String(source.videoUrl ?? source.video_url ?? source.download_url ?? source.result_url ?? source.resultUrl ?? "");
  let imageUrl = String(source.imageUrl ?? source.image_url ?? "");

  if (!videoUrl) {
    const output = source.output as Record<string, unknown> | undefined;
    videoUrl = String(output?.video_url ?? output?.videoUrl ?? output?.url ?? output?.download_url ?? output?.result_url ?? "");
    imageUrl = String(output?.image_url ?? output?.imageUrl ?? "");
  }
  if (!videoUrl && source.data && Array.isArray(source.data)) {
    const first = source.data[0] as Record<string, unknown> | undefined;
    videoUrl = String(first?.url ?? first?.video_url ?? first?.download_url ?? first?.result_url ?? "");
    imageUrl = String(first?.url ?? first?.image_url ?? "");
  }
  if (!videoUrl) {
    const resResult = source.result as Record<string, unknown> | undefined;
    videoUrl = String(resResult?.video_url ?? resResult?.videoUrl ?? resResult?.url ?? resResult?.download_url ?? resResult?.result_url ?? "");
  }
  if (!videoUrl) {
    const content = source.content as Record<string, unknown> | undefined;
    videoUrl = String(content?.video_url ?? content?.videoUrl ?? content?.url ?? content?.download_url ?? content?.result_url ?? "");
  }
  if (!videoUrl) {
    videoUrl = String(source.url ?? source.download ?? raw.url ?? raw.result_url ?? "");
  }

  // Error extraction
  let error: string | undefined;
  if (source.error) {
    error = typeof source.error === "string" ? source.error : JSON.stringify(source.error);
  } else if (source.message && mappedStatus === "failed") {
    error = String(source.message);
  } else if (raw.error) {
    error = typeof raw.error === "string" ? raw.error : JSON.stringify(raw.error);
  } else if (raw.message && mappedStatus === "failed") {
    error = String(raw.message);
  }

  return {
    taskId,
    status: mappedStatus,
    videoUrl: videoUrl || undefined,
    imageUrl: imageUrl || videoUrl || undefined,
    error,
    _raw: raw,
  };
}

export async function pollTask(taskId: string, overrideBaseUrl?: string, overrideApiKey?: string): Promise<TaskResponse & { _raw?: Record<string, unknown> }> {
  const baseUrl = overrideBaseUrl ?? useWorkspaceStore.getState().baseUrl;

  // Check cache — skip discovery if we already know the working endpoint
  const cachedPath = pollEndpointCache.get(baseUrl);
  if (cachedPath) {
    try {
      const raw = await apiRequest<Record<string, unknown>>({
        method: "GET",
        path: cachedPath.replace("{taskId}", taskId),
        ...(overrideBaseUrl ? { overrideBaseUrl, overrideApiKey } : {}),
      });
      const result = normalizePollResponse(raw);
      // If succeeded but no URL, try re-fetching from creation endpoint
      if (result.status === "succeeded" && !result.videoUrl && !result.imageUrl) {
        const fetched = await tryFetchResultUrl(taskId, baseUrl, overrideBaseUrl, overrideApiKey);
        if (fetched) {
          result.videoUrl = fetched;
          result.imageUrl = fetched;
        }
      }
      return result;
    } catch {
      pollEndpointCache.delete(baseUrl);
    }
  }

  // Different APIs use different polling endpoints — try each with 404 fallback
  const endpoints = overrideBaseUrl
    ? [
        `/v1/video/generations/${taskId}`,
        `/v1/tasks/${taskId}`,
        `/v1/queries/${taskId}`,
        `/v1/video/tasks/${taskId}`,
      ]
    : [
        `/v1/tasks/${taskId}`,
        `/v1/video/generations/${taskId}`,
        `/v1/queries/${taskId}`,
      ];

  let lastErr: Error | null = null;
  for (const path of endpoints) {
    try {
      const raw = await apiRequest<Record<string, unknown>>({
        method: "GET",
        path,
        ...(overrideBaseUrl ? { overrideBaseUrl, overrideApiKey } : {}),
      });
      pollEndpointCache.set(baseUrl, path.replace(taskId, "{taskId}"));
      const result = normalizePollResponse(raw);
      // If succeeded but no URL, try re-fetching from creation endpoint
      if (result.status === "succeeded" && !result.videoUrl && !result.imageUrl) {
        const fetched = await tryFetchResultUrl(taskId, baseUrl, overrideBaseUrl, overrideApiKey);
        if (fetched) {
          result.videoUrl = fetched;
          result.imageUrl = fetched;
        }
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/\(404\)/.test(msg)) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("所有轮询端点均不可用");
}

// When status is "succeeded" but no URL in poll response, some proxies
// need a separate request to the creation endpoint to get the result.
async function tryFetchResultUrl(
  taskId: string,
  _baseUrl: string,
  overrideBaseUrl?: string,
  overrideApiKey?: string,
): Promise<string | undefined> {
  const resultEndpoints = [
    `/v1/video/generations/${taskId}/result`,
    `/v1/video/generations/${taskId}`,
  ];
  for (const path of resultEndpoints) {
    try {
      const raw = await apiRequest<Record<string, unknown>>({
        method: "GET",
        path,
        ...(overrideBaseUrl ? { overrideBaseUrl, overrideApiKey } : {}),
      });
      // Try to extract URL from this response
      const url = extractUrlFromRaw(raw);
      if (url) return url;
    } catch {
      continue;
    }
  }
  return undefined;
}

function extractUrlFromRaw(raw: Record<string, unknown>): string | undefined {
  // Direct URL fields
  const directUrl = raw.videoUrl ?? raw.video_url ?? raw.download_url ?? raw.result_url ?? raw.resultUrl ?? raw.url ?? raw.image_url ?? raw.imageUrl;
  if (typeof directUrl === "string" && directUrl) return directUrl;

  // Nested in "data" array
  if (raw.data && Array.isArray(raw.data)) {
    const first = raw.data[0] as Record<string, unknown> | undefined;
    const arrUrl = first?.url ?? first?.video_url ?? first?.download_url ?? first?.result_url ?? first?.videoUrl ?? first?.image_url ?? first?.imageUrl;
    if (typeof arrUrl === "string" && arrUrl) return arrUrl;
  }

  // Nested in "data" object (non-array)
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) {
    const dataObj = raw.data as Record<string, unknown>;
    const objUrl = dataObj.videoUrl ?? dataObj.video_url ?? dataObj.download_url ?? dataObj.result_url ?? dataObj.resultUrl ?? dataObj.url ?? dataObj.image_url ?? dataObj.imageUrl;
    if (typeof objUrl === "string" && objUrl) return objUrl;
  }

  // Nested in "output"
  if (raw.output && typeof raw.output === "object") {
    const output = raw.output as Record<string, unknown>;
    const outputUrl = output.videoUrl ?? output.video_url ?? output.download_url ?? output.result_url ?? output.url ?? output.image_url ?? output.imageUrl;
    if (typeof outputUrl === "string" && outputUrl) return outputUrl;
  }

  // Nested in "result"
  if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
    const resObj = raw.result as Record<string, unknown>;
    const resUrl = resObj.videoUrl ?? resObj.video_url ?? resObj.download_url ?? resObj.result_url ?? resObj.url ?? resObj.image_url ?? resObj.imageUrl;
    if (typeof resUrl === "string" && resUrl) return resUrl;
  }

  // Nested in "results" array
  if (raw.results && Array.isArray(raw.results)) {
    const first = raw.results[0] as Record<string, unknown> | undefined;
    const resArrUrl = first?.url ?? first?.video_url ?? first?.download_url ?? first?.result_url;
    if (typeof resArrUrl === "string" && resArrUrl) return resArrUrl;
  }

  return undefined;
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
    let models = parseModelsResponse(data);

    // Also fetch models from video URL if configured
    const { videoBaseUrl, videoApiKey, chatBaseUrl, chatApiKey } = useWorkspaceStore.getState();
    if (videoBaseUrl) {
      try {
        const vidHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (videoApiKey) vidHeaders["Authorization"] = `Bearer ${videoApiKey}`;
        const vidResponse = await httpFetch(`${videoBaseUrl}/v1/models`, { headers: vidHeaders });
        if (vidResponse.ok) {
          const vidData = await vidResponse.json();
          const vidModels = parseModelsResponse(vidData).map((m) => ({
            ...m,
            // Keep original classification if recognized, only default unknown models to video
            type: m.type !== "unknown" ? m.type : "video" as const,
          }));
          // Merge: main URL models take priority (don't overwrite existing chat/image models)
          const mainIds = new Set(models.map((m) => m.id));
          const uniqueVidModels = vidModels.filter((m) => !mainIds.has(m.id));
          models = [...models, ...uniqueVidModels];
        }
      } catch {
        // Video URL fetch failed — non-fatal, continue with main URL models
      }
    }
    // Also fetch models from chat URL if configured
    if (chatBaseUrl) {
      try {
        const chatHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (chatApiKey) chatHeaders["Authorization"] = `Bearer ${chatApiKey}`;
        const chatResponse = await httpFetch(`${chatBaseUrl}/v1/models`, { headers: chatHeaders });
        if (chatResponse.ok) {
          const chatData = await chatResponse.json();
          const chatModelsList = parseModelsResponse(chatData).map((m) => ({
            ...m,
            type: m.type !== "unknown" ? m.type : "chat" as const,
          }));
          const existingIds = new Set(models.map((m) => m.id));
          const uniqueChatModels = chatModelsList.filter((m) => !existingIds.has(m.id));
          models = [...models, ...uniqueChatModels];
        }
      } catch {
        // Chat URL fetch failed — non-fatal
      }
    }

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
  const videoKeywords = ["video", "vid", "veo", "kling", "可灵", "cogvideo", "hailuo", "luma", "pika", "runway", "animate", "gen-vid", "wan-video", "sora", "seedance", "doubao-video", "wanx-video", "minimax-video", "cog-video"];
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
