import { buildPanoramaImageRequest, getPanoramaGenerationSpec } from "./panoramaGeneration.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const equirectSpec = getPanoramaGenerationSpec("equirectangular");
assert(equirectSpec.size === "3840x1920", "equirectangular panorama stays within the image API longest-edge limit");
assert(equirectSpec.ratio === "2:1", "equirectangular panorama keeps a 2:1 ratio");

const cubemapSpec = getPanoramaGenerationSpec("cubemap");
assert(cubemapSpec.size === "3840x640", "cubemap panorama stays within the image API longest-edge limit");
assert(cubemapSpec.ratio === "6:1", "cubemap panorama keeps six horizontal faces");

for (const spec of [equirectSpec, cubemapSpec]) {
  const longestEdge = Math.max(...spec.size.split("x").map((value) => Number(value)));
  assert(longestEdge <= 3840, "panorama generation size respects the API longest-edge limit");
}

const request = buildPanoramaImageRequest({
  model: "gpt-image-2",
  prompt: "forest panorama",
  format: "equirectangular",
  sourceImage: "data:image/png;base64,ref",
});

assert(request.size === "3840x1920", "request sends the largest supported panorama size");
assert(request.quality === "high", "request asks the model for high quality output");
assert(request.output_format === "png", "request asks for a supported lossless output format");
assert(request.referenceImage === "data:image/png;base64,ref", "request keeps the source reference image");
assert(request.requireReferenceImage === true, "panorama scene uploads must be mandatory generation references");
assert(!request.extra || request.extra.high_resolution === undefined, "request does not send non-standard high_resolution parameter");
assert(!request.extra || request.extra.detail_enhance === undefined, "request does not send non-standard detail_enhance parameter");
assert(!request.extra || request.extra.disable_downsampling === undefined, "request does not send non-standard disable_downsampling parameter");
assert(request.prompt.includes("high-frequency texture detail"), "prompt includes detail restoration guidance");
