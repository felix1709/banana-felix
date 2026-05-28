export interface ModelDefinition {
  id: string;
  label: string;
  provider: string;
  type: "image" | "video";
  features?: {
    quality?: boolean;     // GPT: low/medium/high
    style?: boolean;       // GPT: natural/vivid
    outputFormat?: boolean; // GPT: PNG/JPEG/WEBP
    moderation?: boolean;  // GPT: Auto/Low
    sref?: boolean;        // MJ: style reference
    oref?: boolean;        // MJ: original reference
    batchMax?: number;     // max parallel images
  };
}

// --- Image Models (40+) ---

export const IMAGE_MODELS: ModelDefinition[] = [
  // OpenAI
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai", type: "image", features: { quality: true, style: true, outputFormat: true, moderation: true, batchMax: 4 } },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai", type: "image", features: { outputFormat: true, batchMax: 4 } },
  { id: "gpt-image-1", label: "GPT Image 1", provider: "openai", type: "image", features: { batchMax: 4 } },

  // Google Gemini
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", provider: "google", type: "image", features: { batchMax: 1 } },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "google", type: "image", features: { batchMax: 1 } },
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro Image", provider: "google", type: "image", features: { batchMax: 1 } },

  // Google Imagen
  { id: "imagen-4.0-generate-001", label: "Imagen 4.0", provider: "google", type: "image", features: { batchMax: 1 } },
  { id: "imagen-3.0-generate-002", label: "Imagen 3.0", provider: "google", type: "image", features: { batchMax: 1 } },
  { id: "imagen-3.0-fast-generate-001", label: "Imagen 3.0 Fast", provider: "google", type: "image", features: { batchMax: 1 } },

  // DashScope (阿里)
  { id: "qwen-image-edit", label: "通义万相 编辑", provider: "dashscope", type: "image", features: { batchMax: 4 } },
  { id: "wan-2.6-image", label: "万相 2.6", provider: "dashscope", type: "image", features: { batchMax: 4 } },
  { id: "z-image-official", label: "Z Image 官方", provider: "dashscope", type: "image", features: { batchMax: 4 } },
  { id: "z-image-turbo", label: "Z Image 极速", provider: "dashscope", type: "image", features: { batchMax: 4 } },

  // 即梦 (字节)
  { id: "jimeng-5.0", label: "即梦 5.0", provider: "jimeng", type: "image", features: { batchMax: 4 } },
  { id: "jimeng-4.0", label: "即梦 4.0", provider: "jimeng", type: "image", features: { batchMax: 4 } },
  { id: "jimeng-3.1", label: "即梦 3.1", provider: "jimeng", type: "image", features: { batchMax: 4 } },
  { id: "jimeng-2.1", label: "即梦 2.1", provider: "jimeng", type: "image", features: { batchMax: 4 } },

  // Seedream (字节)
  { id: "seedream-5.0-api", label: "Seedream 5.0", provider: "bytedance", type: "image", features: { batchMax: 4 } },
  { id: "seedream-4.0", label: "Seedream 4.0", provider: "bytedance", type: "image", features: { batchMax: 4 } },

  // Flux (Fal.ai)
  { id: "flux-kontext", label: "Flux Kontext", provider: "fal", type: "image", features: { batchMax: 1 } },
  { id: "flux-pro-1.1", label: "Flux Pro 1.1", provider: "fal", type: "image", features: { batchMax: 1 } },
  { id: "flux-dev", label: "Flux Dev", provider: "fal", type: "image", features: { batchMax: 1 } },
  { id: "flux-schnell", label: "Flux Schnell", provider: "fal", type: "image", features: { batchMax: 1 } },

  // xAI
  { id: "grok-4.1-image", label: "Grok 4.1 Image", provider: "xai", type: "image", features: { batchMax: 1 } },
  { id: "grok-4.2-image", label: "Grok 4.2 Image", provider: "xai", type: "image", features: { batchMax: 1 } },

  // Midjourney
  { id: "mj-v6", label: "Midjourney V6", provider: "midjourney", type: "image", features: { sref: true, oref: true, batchMax: 1 } },
];

// --- Video Models ---

export const VIDEO_MODELS: ModelDefinition[] = [
  { id: "seedance-2.0", label: "Seedance 2.0", provider: "bytedance", type: "video" },
  { id: "veo-2", label: "Veo 2", provider: "google", type: "video" },
  { id: "kling-v1.5", label: "可灵 V1.5", provider: "kling", type: "video" },
  { id: "kling-v1", label: "可灵 V1", provider: "kling", type: "video" },
  { id: "hailuo-video", label: "海螺视频", provider: "minimax", type: "video" },
  { id: "cogvideox", label: "CogVideoX", provider: "zhipu", type: "video" },
  { id: "wan-2.6-video", label: "万相 2.6 视频", provider: "dashscope", type: "video" },
  { id: "luma-dream-machine", label: "Luma Dream Machine", provider: "luma", type: "video" },
  { id: "pika-1.5", label: "Pika 1.5", provider: "pika", type: "video" },
];

export const ALL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS];

export function getModelById(id: string): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

// --- Ratio / Resolution mapping ---

export const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1" },
  { id: "4:3", label: "4:3" },
  { id: "3:4", label: "3:4" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "3:2", label: "3:2" },
  { id: "2:3", label: "2:3" },
  { id: "21:9", label: "21:9" },
] as const;

export const RESOLUTIONS = ["Auto", "1K", "2K", "4K"] as const;

// Pixel mapping: [ratio][resolution] = "WxH"
export const RATIO_RESOLUTION_MAP: Record<string, Record<string, string>> = {
  "1:1":  { Auto: "1024x1024", "1K": "1024x1024", "2K": "2048x2048", "4K": "4096x4096" },
  "4:3":  { Auto: "1152x864",  "1K": "1152x864",  "2K": "2304x1728", "4K": "4704x3520" },
  "3:4":  { Auto: "864x1152",  "1K": "864x1152",  "2K": "1728x2304", "4K": "3520x4704" },
  "16:9": { Auto: "1280x720",  "1K": "1280x720",  "2K": "2848x1600", "4K": "5504x3040" },
  "9:16": { Auto: "720x1280",  "1K": "720x1280",  "2K": "1600x2848", "4K": "3040x5500" },
  "3:2":  { Auto: "1248x832",  "1K": "1248x832",  "2K": "2496x1664", "4K": "4992x3328" },
  "2:3":  { Auto: "832x1248",  "1K": "832x1248",  "2K": "1664x2496", "4K": "3328x4992" },
  "21:9": { Auto: "1512x648",  "1K": "1512x648",  "2K": "3136x1344", "4K": "6240x2656" },
};

export function getPixelSize(ratio: string, resolution: string): { width: number; height: number } {
  const entry = RATIO_RESOLUTION_MAP[ratio]?.[resolution] ?? RATIO_RESOLUTION_MAP["1:1"]["Auto"];
  const [w, h] = entry.split("x").map(Number);
  return { width: w, height: h };
}
