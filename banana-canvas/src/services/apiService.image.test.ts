import { buildImageGenerationBody, type ImageGenerateRequest } from "./apiService.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const request: ImageGenerateRequest = {
  model: "gpt-image-2",
  prompt: "high quality panorama",
  n: 1,
  size: "4096x2048",
  quality: "high",
  output_format: "PNG",
  extra: {
    high_resolution: true,
    detail_enhance: true,
    steps: 40,
    disable_downsampling: true,
  },
};

const body = buildImageGenerationBody(request);

assert(body.model === "gpt-image-2", "keeps selected image model");
assert(body.prompt === "high quality panorama", "keeps full prompt");
assert(body.size === "4096x2048", "keeps requested high-resolution size");
assert(body.quality === "high", "keeps high quality setting");
assert(body.output_format === "png", "normalizes output format to the API-supported lowercase value");
assert(body.high_resolution === true, "passes high-resolution enhancement flag");
assert(body.detail_enhance === true, "passes detail enhancement flag");
assert(body.steps === 40, "passes sampling steps");
assert(body.disable_downsampling === true, "passes no-downsampling flag");
