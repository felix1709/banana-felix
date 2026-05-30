import { buildVideoGenerationBody, type VideoGenerateRequest } from "./apiService.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const request: VideoGenerateRequest = {
  model: "seedance-2.0",
  prompt: "女孩奔跑，@参考图",
  negativePrompt: "低清，抖动",
  duration: 8,
  fps: 24,
  resolution: "720p",
  seed: 12345,
  startImage: "data:image/png;base64,start",
  endImage: "data:image/png;base64,end",
  ratio: "9:16",
  generateAudio: true,
  smartDuration: false,
  referenceMode: "multimodal",
  referenceImageUrl: "data:image/png;base64,ref",
  referenceVideoUrl: "https://example.com/ref.mp4",
  referenceAudioUrl: "https://example.com/ref.mp3",
  images: ["data:image/png;base64,ref", "data:image/png;base64,second"],
};

const body = buildVideoGenerationBody(request);

assert(body.model === "seedance-2.0", "keeps selected video model");
assert(body.prompt === request.prompt, "keeps full prompt");
assert(body.duration === 8, "passes selected duration");
assert(body.duration_seconds === 8, "adds mainstream duration alias");
assert(body.fps === 24, "passes fps");
assert(body.resolution === "720p", "passes selected resolution");
assert(body.seed === 12345, "passes seed");
assert(body.ratio === "9:16", "passes ratio");
assert(body.size === "9:16", "adds one-api size ratio alias");
assert(body.aspect_ratio === "9:16", "adds aspect ratio alias");
assert(body.generateAudio === true, "passes camelCase audio flag");
assert(body.generate_audio === true, "adds snake_case audio flag");
assert(body.audio === true, "adds short audio flag");
assert(body.referenceMode === "multimodal", "passes reference mode");
assert(body.reference_mode === "multimodal", "adds reference mode alias");
assert(body.image_url === request.startImage, "uses start image as first-frame image");
assert(body.first_frame_image === request.startImage, "adds first frame alias");
assert(body.lastframe_image === request.endImage, "adds seedance last frame alias");
assert(body.last_frame_image === request.endImage, "adds mainstream last frame alias");
assert(body.video_url === request.referenceVideoUrl, "passes reference video");
assert(body.audio_url === request.referenceAudioUrl, "passes reference audio");
assert(Array.isArray(body.images) && body.images.length === 2, "passes all reference images");
assert(Array.isArray(body.image_urls) && body.image_urls.length === 2, "adds image_urls alias");
