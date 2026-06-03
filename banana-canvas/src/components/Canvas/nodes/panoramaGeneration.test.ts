import { buildPanoramaImageRequest, getPanoramaGenerationSpec } from "./panoramaGeneration.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const equirectSpec = getPanoramaGenerationSpec("equirectangular");
assert(equirectSpec.size === "4096x2048", "equirectangular panorama uses a 4K 2:1 base size");
assert(equirectSpec.ratio === "2:1", "equirectangular panorama keeps a 2:1 ratio");

const cubemapSpec = getPanoramaGenerationSpec("cubemap");
assert(cubemapSpec.size === "6144x1024", "cubemap panorama uses 1024px faces");
assert(cubemapSpec.ratio === "6:1", "cubemap panorama keeps six horizontal faces");

const request = buildPanoramaImageRequest({
  model: "gpt-image-2",
  prompt: "forest panorama",
  format: "equirectangular",
  sourceImage: "data:image/png;base64,ref",
});

assert(request.size === "4096x2048", "request sends the high-resolution panorama size");
assert(request.quality === "high", "request asks the model for high quality output");
assert(request.output_format === "png", "request asks for a supported lossless output format");
assert(request.referenceImage === "data:image/png;base64,ref", "request keeps the source reference image");
assert(request.extra?.high_resolution === true, "request passes high-resolution enhancement flag");
assert(request.extra?.detail_enhance === true, "request passes detail enhancement flag");
assert(request.extra?.disable_downsampling === true, "request tells the gateway not to downsample");
assert(request.prompt.includes("high-frequency texture detail"), "prompt includes detail restoration guidance");
