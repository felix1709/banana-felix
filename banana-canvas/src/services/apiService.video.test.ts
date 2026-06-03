import { buildVideoGenerationBody, type VideoGenerateRequest } from "./apiService.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const request: VideoGenerateRequest = {
  model: "seedance-2.0",
  prompt: "女孩奔跑，@参考图",
  negativePrompt: "低清，抖动",
  duration: 15,
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
assert(typeof body.prompt === "string" && body.prompt.includes(request.prompt), "keeps full prompt");
assert(typeof body.prompt === "string" && body.prompt.includes("duration=15s"), "embeds selected duration in prompt instructions");
assert(body.duration === 15, "passes selected duration");
assert(body.duration_seconds === 15, "adds mainstream duration alias");
assert(body.duration_s === 15, "adds duration_s alias");
assert(body.duration_sec === 15, "adds duration_sec alias");
assert(body.durationSeconds === 15, "adds camelCase duration alias");
assert(body.video_duration === 15, "adds video_duration alias");
assert(body.videoDuration === 15, "adds videoDuration alias");
assert(body.seconds === "15", "adds string seconds alias for Go gateway compatibility");
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
assert(body.image_url === undefined, "does not duplicate inline base64 image_url aliases");
assert(body.first_frame_image === undefined, "does not duplicate inline base64 first frame aliases");
assert(body.lastframe_image === undefined, "does not duplicate inline base64 last frame aliases");
assert(body.last_frame_image === undefined, "does not duplicate inline base64 last frame aliases");
assert(body.video_url === request.referenceVideoUrl, "passes reference video");
assert(body.audio_url === request.referenceAudioUrl, "passes reference audio");
assert(body.images === undefined, "does not duplicate inline base64 images array");
assert(body.image_urls === undefined, "does not duplicate inline base64 image_urls array");
assert(Array.isArray(body.content), "adds multimodal content parts");
assert(body.contents === undefined, "does not duplicate inline base64 content into contents");
const imageParts = (body.content as Array<{ type: string; role?: string }>).filter((part) => part.type === "image_url");
assert(imageParts.length >= 3, "adds image content parts for start/end/reference images");
assert(imageParts.every((part) => part.role === "user" || part.role === "reference"), "all image content parts include role");
