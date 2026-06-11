import { useWorkspaceStore } from "../stores/workspaceStore";
import { extractChatCompletionText, formatImageReversePrompt } from "./imagePromptReverse";

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
    if (response.status === 413) {
      throw new Error("请求体过大 (413)：当前提交的图片/视频数据超过了服务器限制。已尽量减少重复传参；如果仍然出现，请改用在线图片 URL，或在你自己的 Nginx/网关中调高 client_max_body_size。");
    }
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
  ratio?: string;
  quality?: string;
  style?: string;
  output_format?: string;
  moderation?: string;
  referenceImage?: string;
  referenceImages?: string[];
  sref?: string;
  oref?: string;
  requireReferenceImage?: boolean;
  extra?: Record<string, unknown>;
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

export function buildImageGenerationBody(req: ImageGenerateRequest, defaultSize = "1024x1024"): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
    n: req.n ?? 1,
    size: req.size ?? defaultSize,
  };
  if (req.quality) body.quality = req.quality;
  if (req.style) body.style = req.style;
  if (req.output_format) body.output_format = req.output_format.toLowerCase();
  if (req.moderation) body.moderation = req.moderation;
  if (req.extra) {
    for (const [key, value] of Object.entries(req.extra)) {
      if (value !== undefined && value !== null) body[key] = value;
    }
  }
  return body;
}

export function canUseTextOnlyImageGenerationFallback(req: ImageGenerateRequest, refImages: string[]): boolean {
  return !(req.requireReferenceImage && refImages.length > 0);
}

export function canUseLegacyImageGenerateFallback(req: ImageGenerateRequest, refImages: string[]): boolean {
  return !(req.requireReferenceImage && refImages.length > 0);
}

function buildImageGenerationBodyWithReferences(req: ImageGenerateRequest): Record<string, unknown> {
  const body = buildImageGenerationBody(req);
  if (req.referenceImage) body.referenceImage = req.referenceImage;
  if (req.referenceImages && req.referenceImages.length > 0) {
    body.images = req.referenceImages;
  }
  return body;
}

function appendImageGenerationFormFields(formData: FormData, req: ImageGenerateRequest, defaultSize = "1024x1024"): void {
  const body = buildImageGenerationBody(req, defaultSize);
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
}

export async function generateImage(req: ImageGenerateRequest): Promise<TaskResponse> {
  // Collect all reference images
  const refImages: string[] = [];
  if (req.referenceImage) refImages.push(req.referenceImage);
  if (req.referenceImages) refImages.push(...req.referenceImages);

  const isGemini = isGeminiImageModel(req.model);

  console.log(`[Image Gen] model=${req.model} size=${req.size} ratio=${req.ratio ?? "N/A"} n=${req.n} refImages=${refImages.length} gemini=${isGemini}`);

  // ════════════════════════════════════════════════════════════════
  // Route 1: Gemini models → /v1/chat/completions (with multimodal)
  // These models are NOT supported by the proxy's /v1/images/generations
  // ════════════════════════════════════════════════════════════════
  if (isGemini) {
    return await generateImageGemini(req, refImages);
  }

  // ════════════════════════════════════════════════════════════════
  // Route 2: Non-Gemini models (Imagen, GPT, Flux, etc.)
  // ════════════════════════════════════════════════════════════════
  return await generateImageStandard(req, refImages);
}

// ── Route 2: Standard image generation (Imagen, GPT, Flux, etc.) ──
async function generateImageStandard(req: ImageGenerateRequest, refImages: string[]): Promise<TaskResponse> {
  // Build standard request body (NO 'image' param — many proxies reject it)
  const body = buildImageGenerationBody(req);

  // ── When reference images exist, try /v1/images/edits FIRST (FormData) ──
  if (refImages.length > 0) {
    try {
      console.log(`[Standard] Attempt: /v1/images/edits (with ${refImages.length} ref images via FormData)`);
      return await generateImageViaEdits(req, refImages);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[Standard] /v1/images/edits FAILED: ${errMsg.slice(0, 200)}`);
      if (!canUseTextOnlyImageGenerationFallback(req, refImages)) {
        throw new Error(`参考图是必需的，但当前 API 的 /v1/images/edits 带图生成失败：${errMsg}`);
      }
    }
  }

  // ── Standard generation via /v1/images/generations ──
  try {
    console.log(`[Standard] Attempt: /v1/images/generations`);
    const result = await apiRequest<OpenAIImageResponse | TaskResponse>({
      method: "POST",
      path: "/v1/images/generations",
      body,
    });

    if ("data" in result && Array.isArray(result.data)) {
      const first = result.data[0];
      const imageUrl = first?.url
        || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
      console.log(`[Standard] /v1/images/generations SUCCEEDED`);
      return { taskId: "", status: "succeeded", imageUrl };
    }

    return result as TaskResponse;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(`[Standard] /v1/images/generations FAILED: ${errMsg.slice(0, 200)}`);

    // ── Fallback: /api/v1/image/generate ──
    try {
      if (!canUseLegacyImageGenerateFallback(req, refImages)) {
        throw err;
      }
      return await apiRequest<TaskResponse>({
        method: "POST",
        path: "/api/v1/image/generate",
        body: buildImageGenerationBodyWithReferences(req),
      });
    } catch {
      throw err;
    }
  }
}

// ── Route 1: Gemini image generation ──
async function generateImageGemini(req: ImageGenerateRequest, refImages: string[]): Promise<TaskResponse> {
  const geminiBaseUrl = useWorkspaceStore.getState().geminiBaseUrl;
  const geminiApiKey = useWorkspaceStore.getState().geminiApiKey;
  const defaultBaseUrl = useWorkspaceStore.getState().baseUrl;
  const opts = geminiBaseUrl
    ? { overrideBaseUrl: geminiBaseUrl, overrideApiKey: geminiApiKey || undefined }
    : {};

  // Build URLs to try — geminiBaseUrl first (if configured), then default
  const urlsToTry: Array<{ url: string; key: string; label: string }> = [];
  if (geminiBaseUrl && canUseTextOnlyImageGenerationFallback(req, refImages)) {
    urlsToTry.push({ url: geminiBaseUrl, key: geminiApiKey || "", label: "geminiBaseUrl" });
  }
  if (defaultBaseUrl && defaultBaseUrl !== geminiBaseUrl) {
    urlsToTry.push({ url: defaultBaseUrl, key: useWorkspaceStore.getState().apiKey, label: "defaultBaseUrl" });
  }
  if (urlsToTry.length === 0) {
    throw new Error("API 地址未配置，请先在 API 设置中配置地址");
  }

  // ── Attempt 1: /v1/images/edits with FormData (ref images + size in same request) ──
  // This endpoint sends BOTH reference images (as file attachments) AND size param
  // If the proxy supports Gemini here, both bugs are fixed at once
  for (const { url, key, label } of urlsToTry) {
    try {
      console.log(`[Gemini] Attempt edits: /v1/images/edits (${label}, refImages=${refImages.length}, size=${req.size})`);
      return await generateImageViaEdits(req, refImages, { overrideBaseUrl: url, overrideApiKey: key || undefined });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[Gemini] /v1/images/edits on ${label} FAILED: ${errMsg.slice(0, 150)}`);
    }
  }

  // ── Attempt 2: /v1/images/generations on geminiBaseUrl (if configured) ──
  if (geminiBaseUrl) {
    try {
      const body = buildImageGenerationBody(req);

      console.log(`[Gemini] Attempt generations: /v1/images/generations (geminiBaseUrl, no ref images, size=${req.size})`);
      const result = await apiRequest<OpenAIImageResponse | TaskResponse>({
        method: "POST",
        path: "/v1/images/generations",
        body,
        ...opts,
      });

      if ("data" in result && Array.isArray(result.data)) {
        const first = result.data[0];
        const imageUrl = first?.url
          || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
        console.log(`[Gemini] /v1/images/generations SUCCEEDED (size param works!)`);
        return { taskId: "", status: "succeeded", imageUrl };
      }

      const raw = result as unknown as Record<string, unknown>;
      const taskId = String(raw.taskId || raw.id || raw.task_id || "");
      if (taskId) {
        console.log(`[Gemini] /v1/images/generations returned task: ${taskId}`);
        return result as TaskResponse;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`[Gemini] /v1/images/generations FAILED: ${errMsg.slice(0, 150)}`);
    }
  }

  // ── Attempt 3: /v1/chat/completions (multimodal — ref images work, size is prompt-based) ──
  try {
    console.log(`[Gemini] Attempt chat: /v1/chat/completions (multimodal, refImages=${refImages.length}, size=${req.size})`);
    return await generateImageViaChatCompletions(req, opts);
  } catch (chatErr) {
    const chatErrMsg = chatErr instanceof Error ? chatErr.message : String(chatErr);
    console.log(`[Gemini] /v1/chat/completions FAILED: ${chatErrMsg.slice(0, 150)}`);
  }

  throw new Error(`Gemini 图片生成失败。建议：1) 使用 Imagen 模型（参考图+比例均正常）；2) 联系代理团队让 /v1/images/edits 支持 Gemini 模型。`);
}

// ── Helper: derive aspect ratio string from size (e.g., "1280x720" → "16:9") ──
function deriveAspectRatio(size?: string): string | undefined {
  if (!size) return undefined;
  const parts = size.split("x").map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return undefined;
  const [w, h] = parts;
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

// ── Helper: detect Gemini image models by ID ──
function isGeminiImageModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith("gemini-") && lower.includes("-image");
}

// ── Gemini image generation via /v1/chat/completions ──
async function generateImageViaChatCompletions(
  req: ImageGenerateRequest,
  opts: { overrideBaseUrl?: string; overrideApiKey?: string },
): Promise<TaskResponse> {
  const refImages: string[] = [];
  if (req.referenceImage) refImages.push(req.referenceImage);
  if (req.referenceImages) refImages.push(...req.referenceImages);

  // Build multimodal content parts
  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  // Reference images first
  for (const url of refImages) {
    contentParts.push({ type: "image_url", image_url: { url } });
  }

  // Build user prompt
  const userPrompt = req.prompt || "";

  // Then the text prompt
  contentParts.push({ type: "text", text: userPrompt });

  // Build system message with aspect ratio enforcement
  const aspectRatio = req.ratio || deriveAspectRatio(req.size) || "1:1";
  const systemParts: string[] = [
    "You are an image generation assistant. You MUST generate images.",
  ];
  if (aspectRatio !== "1:1") {
    systemParts.push(`CRITICAL REQUIREMENT: The generated image MUST have an exact ${aspectRatio} aspect ratio (width:height). For example, 16:9 means the image is wide (landscape), 9:16 means it is tall (portrait). Do NOT generate a square image. Do NOT ignore this ratio.`);
  }
  if (req.size) {
    systemParts.push(`Target resolution: ${req.size} pixels.`);
  }

  // Build the request body — try multiple parameter formats for proxy compatibility
  const body: Record<string, unknown> = {
    model: req.model,
    messages: [
      // System message for aspect ratio enforcement
      {
        role: "system",
        content: systemParts.join(" "),
      },
      // User message with prompt + reference images
      {
        role: "user",
        content: contentParts.length > 1 ? contentParts : userPrompt,
      },
    ],
    // Pass through size/n/quality/style for proxies that support them
    n: req.n ?? 1,
    size: req.size ?? "1024x1024",
    // Various aspect ratio field names for different proxy compatibility
    aspect_ratio: aspectRatio,
    aspectRatio: aspectRatio,
    // Google native Gemini API format
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      aspectRatio: aspectRatio,
    },
  };
  if (req.quality) body.quality = req.quality;
  if (req.style) body.style = req.style;

  // Debug: log key parameters
  console.log(`[Gemini Image] model=${req.model} ratio=${req.ratio ?? "N/A"} aspectRatio=${aspectRatio} size=${req.size} n=${req.n} quality=${req.quality ?? "N/A"} style=${req.style ?? "N/A"} refImages=${refImages.length} promptLen=${userPrompt.length}`);

  const result = await apiRequest<ChatCompletionResponse | TaskResponse>({
    method: "POST",
    path: "/v1/chat/completions",
    body,
    ...opts,
  });

  // ── Try to extract image from various response formats ──

  // Format 1: Standard OpenAI image generation shape (some proxies return this from chat endpoint)
  if ("data" in result && Array.isArray((result as Record<string, unknown>).data)) {
    const data = (result as Record<string, unknown>).data as Array<{ url?: string; b64_json?: string }>;
    const first = data[0];
    const imageUrl = first?.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
    if (imageUrl) return { taskId: "", status: "succeeded", imageUrl };
  }

  // Format 2: Chat completions with multimodal content in choices[0].message.content
  if ("choices" in result && result.choices?.[0]?.message?.content) {
    const content = result.choices[0].message.content;

    // Content is an array of multimodal parts
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === "object" && part !== null) {
          // OpenAI-style: { type: "image_url", image_url: { url: "..." } }
          const imgPart = part as Record<string, unknown>;
          if (imgPart.type === "image_url" && typeof imgPart.image_url === "object" && imgPart.image_url !== null) {
            const url = (imgPart.image_url as Record<string, unknown>).url as string | undefined;
            if (url) return { taskId: "", status: "succeeded", imageUrl: url };
          }
          // Google-style inline_data: { type: "inline_data", data: "...", mime_type: "..." }
          if (imgPart.type === "inline_data" && typeof imgPart.data === "string") {
            const mime = (typeof imgPart.mime_type === "string" ? imgPart.mime_type : "image/png");
            return { taskId: "", status: "succeeded", imageUrl: `data:${mime};base64,${imgPart.data}` };
          }
        }
      }
    }

    // Content is a string — may contain image URL or base64 data
    if (typeof content === "string") {
      // Try parsing as JSON array of multimodal parts
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          for (const part of parsed) {
            if (typeof part === "object" && part !== null) {
              const p = part as Record<string, unknown>;
              if (p.type === "image_url" && typeof p.image_url === "object" && p.image_url !== null) {
                const url = (p.image_url as Record<string, unknown>).url as string | undefined;
                if (url) return { taskId: "", status: "succeeded", imageUrl: url };
              }
              if (p.type === "inline_data" && typeof p.data === "string") {
                const mime = (typeof p.mime_type === "string" ? p.mime_type : "image/png");
                return { taskId: "", status: "succeeded", imageUrl: `data:${mime};base64,${p.data}` };
              }
            }
          }
        }
      } catch {
        // Not JSON — check for image URLs in the text
      }

      // Check for markdown image syntax: ![alt](url)
      const mdMatch = content.match(/!\[.*?\]\((data:image\/[^;]+;base64,[^\s)]+|https?:\/\/[^\s)]+)\)/);
      if (mdMatch?.[1]) return { taskId: "", status: "succeeded", imageUrl: mdMatch[1] };

      // Check for bare data:image URL
      const dataUrlMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/);
      if (dataUrlMatch) return { taskId: "", status: "succeeded", imageUrl: dataUrlMatch[0] };

      // Check for bare https:// image URL
      const httpsMatch = content.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|gif)[^\s"'<>]*/i);
      if (httpsMatch) return { taskId: "", status: "succeeded", imageUrl: httpsMatch[0] };

      // Check for any URL-like pattern in content
      const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch) return { taskId: "", status: "succeeded", imageUrl: urlMatch[0] };
    }
  }

  // Format 3: Async task response (some proxies return taskId for long-running generation)
  const raw = result as unknown as Record<string, unknown>;
  const effectiveTaskId = String(raw.taskId || raw.id || raw.task_id || "");
  if (effectiveTaskId) {
    return { taskId: effectiveTaskId, status: "pending" };
  }

  // No image found — include diagnostic info in the error
  const snippet = JSON.stringify(result).slice(0, 300);
  return { taskId: "", status: "failed", error: `Gemini 未返回图片内容 (响应: ${snippet})` };
}

async function generateImageViaEdits(
  req: ImageGenerateRequest,
  refImages: string[],
  opts?: { overrideBaseUrl?: string; overrideApiKey?: string },
): Promise<TaskResponse> {
  const store = useWorkspaceStore.getState();
  const effectiveUrl = opts?.overrideBaseUrl ?? store.baseUrl;
  const effectiveKey = opts?.overrideApiKey ?? store.apiKey;
  if (!effectiveUrl) throw new Error("API 地址未配置");

  const formData = new FormData();
  appendImageGenerationFormFields(formData, req);

  // Attach ALL reference images
  for (let i = 0; i < refImages.length; i++) {
    formData.append("image", dataUrlToBlob(refImages[i]), `image_${i}.png`);
  }

  const headers: Record<string, string> = {};
  if (effectiveKey) headers["Authorization"] = `Bearer ${effectiveKey}`;

  const httpFetch = await getHttpFetch();
  const response = await httpFetch(`${effectiveUrl}/v1/images/edits`, {
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

type VideoContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role: "user" | "reference" };

function isInlineMediaUrl(url: string | undefined): boolean {
  return typeof url === "string" && /^data:/i.test(url);
}

function hasInlineVideoMedia(req: VideoGenerateRequest): boolean {
  return [
    req.startImage,
    req.endImage,
    req.referenceImageUrl,
    req.referenceVideoUrl,
    req.referenceAudioUrl,
    ...(req.images ?? []),
  ].some(isInlineMediaUrl);
}

function buildVideoInstructionPrompt(req: VideoGenerateRequest): string {
  const settings = [
    `duration=${req.duration}s`,
    `fps=${req.fps}`,
    `resolution=${req.resolution}`,
    `aspect_ratio=${req.ratio || "16:9"}`,
  ];
  if (req.generateAudio !== undefined) settings.push(`audio=${req.generateAudio ? "on" : "off"}`);
  return `Video generation settings: ${settings.join(", ")}. Follow these settings exactly.\n${req.prompt}`;
}

function buildVideoContentParts(req: VideoGenerateRequest): VideoContentPart[] {
  const parts: VideoContentPart[] = [{ type: "text", text: buildVideoInstructionPrompt(req) }];
  const pushImage = (url: string | undefined, role: "user" | "reference") => {
    if (!url) return;
    if (parts.some((part) => part.type === "image_url" && part.image_url.url === url && part.role === role)) return;
    parts.push({ type: "image_url", image_url: { url }, role });
  };

  pushImage(req.startImage, "user");
  pushImage(req.endImage, "user");
  pushImage(req.referenceImageUrl, "reference");
  for (const image of req.images ?? []) {
    pushImage(image, "reference");
  }
  return parts;
}

function uniqueMediaUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

export function buildVideoGenerationBody(req: VideoGenerateRequest): Record<string, unknown> {
  const firstFrameImage = req.startImage || req.referenceImageUrl || undefined;
  const promptWithSettings = buildVideoInstructionPrompt(req);
  const contentParts = buildVideoContentParts(req);
  const compactMediaAliases = hasInlineVideoMedia(req);
  const shouldAliasMedia = (url: string | undefined) => !!url;
  const aliasImages = uniqueMediaUrls([req.referenceImageUrl, ...(req.images ?? [])]);
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: promptWithSettings,
    negative_prompt: req.negativePrompt || undefined,
    duration: req.duration,
    duration_seconds: req.duration,
    duration_s: req.duration,
    duration_sec: req.duration,
    durationSeconds: req.duration,
    video_duration: req.duration,
    videoDuration: req.duration,
    seconds: String(req.duration),
    fps: req.fps,
    resolution: req.resolution,
    seed: req.seed,
    ratio: req.ratio || "16:9",
    size: req.ratio || "16:9",
    aspect_ratio: req.ratio || "16:9",
    generateAudio: req.generateAudio,
    generate_audio: req.generateAudio,
    audio: req.generateAudio,
    smartDuration: req.smartDuration,
    smart_duration: req.smartDuration,
    referenceMode: req.referenceMode,
    reference_mode: req.referenceMode,
    image_url: shouldAliasMedia(firstFrameImage) ? firstFrameImage : undefined,
    first_frame_image: shouldAliasMedia(firstFrameImage) ? firstFrameImage : undefined,
    start_image: shouldAliasMedia(firstFrameImage) ? firstFrameImage : undefined,
    endImage: shouldAliasMedia(req.endImage) ? req.endImage : undefined,
    end_image: shouldAliasMedia(req.endImage) ? req.endImage : undefined,
    lastframe_image: shouldAliasMedia(req.endImage) ? req.endImage : undefined,
    last_frame_image: shouldAliasMedia(req.endImage) ? req.endImage : undefined,
    audio_url: shouldAliasMedia(req.referenceAudioUrl) ? req.referenceAudioUrl : undefined,
    video_url: shouldAliasMedia(req.referenceVideoUrl) ? req.referenceVideoUrl : undefined,
    images: aliasImages.length > 0 ? aliasImages : undefined,
    image_urls: aliasImages.length > 0 ? aliasImages : undefined,
    reference_images: aliasImages.length > 0 ? aliasImages : undefined,
    reference_image_urls: aliasImages.length > 0 ? aliasImages : undefined,
    content: contentParts.length > 1 ? contentParts : undefined,
    contents: !compactMediaAliases && contentParts.length > 1 ? contentParts : undefined,
  };

  for (const key of Object.keys(body)) {
    if (body[key] === undefined || body[key] === "") {
      delete body[key];
    }
  }
  return body;
}

export async function generateVideo(req: VideoGenerateRequest): Promise<TaskResponse> {
  const videoBaseUrl = useWorkspaceStore.getState().videoBaseUrl;
  const videoApiKey = useWorkspaceStore.getState().videoApiKey;
  const opts = {
    ...(videoBaseUrl ? { overrideBaseUrl: videoBaseUrl, overrideApiKey: videoApiKey || undefined } : {}),
  };

  const body = buildVideoGenerationBody(req);

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
  const contentParts = buildVideoContentParts(req);
  const compactMediaAliases = hasInlineVideoMedia(req);
  const aliasImages = uniqueMediaUrls([req.referenceImageUrl, ...(req.images ?? [])]);
  // Build image-generation-style body with video-specific fields
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: buildVideoInstructionPrompt(req),
    n: 1,
    size: req.ratio || "16:9",
    aspect_ratio: req.ratio || "16:9",
    ratio: req.ratio || "16:9",
    content: contentParts.length > 1 ? contentParts : undefined,
    contents: !compactMediaAliases && contentParts.length > 1 ? contentParts : undefined,
  };
  if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
  if (req.duration) body.duration = req.duration;
  if (req.duration) body.duration_seconds = req.duration;
  if (req.duration) body.duration_s = req.duration;
  if (req.duration) body.duration_sec = req.duration;
  if (req.duration) body.durationSeconds = req.duration;
  if (req.duration) body.video_duration = req.duration;
  if (req.duration) body.videoDuration = req.duration;
  if (req.duration) body.seconds = String(req.duration);
  if (req.fps) body.fps = req.fps;
  if (req.resolution) body.resolution = req.resolution;
  if (req.seed !== undefined) body.seed = req.seed;
  if (req.startImage) body.startImage = req.startImage;
  if (req.startImage) body.start_image = req.startImage;
  if (req.startImage) body.first_frame_image = req.startImage;
  if (req.endImage) body.endImage = req.endImage;
  if (req.endImage) body.end_image = req.endImage;
  if (req.generateAudio !== undefined) body.generateAudio = req.generateAudio;
  if (req.generateAudio !== undefined) body.generate_audio = req.generateAudio;
  if (req.smartDuration !== undefined) body.smartDuration = req.smartDuration;
  if (req.smartDuration !== undefined) body.smart_duration = req.smartDuration;
  if (req.referenceMode) body.referenceMode = req.referenceMode;
  if (req.referenceMode) body.reference_mode = req.referenceMode;
  // Reference materials
  if (req.referenceImageUrl) body.image_url = req.referenceImageUrl;
  if (req.referenceVideoUrl) body.video_url = req.referenceVideoUrl;
  if (req.referenceAudioUrl) body.audio_url = req.referenceAudioUrl;
  if (aliasImages.length > 0) body.images = aliasImages;
  if (aliasImages.length > 0) body.image_urls = aliasImages;
  if (aliasImages.length > 0) body.reference_images = aliasImages;
  if (aliasImages.length > 0) body.reference_image_urls = aliasImages;
  // Compatibility aliases
  if (req.startImage || req.referenceImageUrl) body.image_url = req.startImage || req.referenceImageUrl;
  if (req.endImage) body.lastframe_image = req.endImage;
  if (req.endImage) body.last_frame_image = req.endImage;
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

export interface ImageReversePromptRequest {
  model?: string;
  image: string;
}

interface ChatCompletionResponse {
  id: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
        data?: string;
        mime_type?: string;
      }>;
    };
    finish_reason?: string;
  }>;
  taskId?: string;
  status?: string;
}

export async function reverseImagePrompt(req: ImageReversePromptRequest): Promise<string> {
  const workspace = useWorkspaceStore.getState();
  const model = req.model?.trim() || workspace.getVisionModel();
  const prompt = [
    "请分析用户提供的图片，生成可直接用于图片生成模型的结构化中文提示词。",
    "只允许按以下五项输出，不要输出 JSON、代码块、解释、编号或多余文字：",
    "主体描述：",
    "环境描述：",
    "光线效果：",
    "风格标签：",
    "质量增强词：",
  ].join("\n");

  const result = await apiRequest<ChatCompletionResponse>({
    method: "POST",
    path: "/v1/chat/completions",
    overrideBaseUrl: workspace.getChatApiUrl(),
    overrideApiKey: workspace.getChatApiKey(),
    body: {
      model,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: req.image } },
          ],
        },
      ],
    },
  });

  const text = extractChatCompletionText(result);
  if (!text.trim()) throw new Error("视觉模型没有返回可用内容");
  return formatImageReversePrompt(text);
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
    const content = result.choices[0].message.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter((p): p is { type: string; text?: string } => typeof p === "object" && "text" in p).map((p) => p.text ?? "").join("\n")
        : String(content);
    return {
      taskId: "",
      status: "succeeded",
      result: text,
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

    // Also fetch models from Gemini URL if configured
    const { geminiBaseUrl, geminiApiKey } = useWorkspaceStore.getState();
    if (geminiBaseUrl) {
      try {
        const geminiHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (geminiApiKey) geminiHeaders["Authorization"] = `Bearer ${geminiApiKey}`;
        const geminiResponse = await httpFetch(`${geminiBaseUrl}/v1/models`, { headers: geminiHeaders });
        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const geminiModelsList = parseModelsResponse(geminiData).map((m) => ({
            ...m,
            type: m.type !== "unknown" ? m.type : "image" as const,
          }));
          const existingIds = new Set(models.map((m) => m.id));
          const uniqueGeminiModels = geminiModelsList.filter((m) => !existingIds.has(m.id));
          models = [...models, ...uniqueGeminiModels];
        }
      } catch {
        // Gemini URL fetch failed — non-fatal
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
  if (imageKeywords.some((k) => lower.includes(k))) return "image";
  if (chatKeywords.some((k) => lower.includes(k))) return "chat";
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
