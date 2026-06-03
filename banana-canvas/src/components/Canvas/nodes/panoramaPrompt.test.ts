import { buildPanoramaPrompt } from "./panoramaPrompt.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const prompt = buildPanoramaPrompt({
  userPrompt: "雨后竹林，薄雾，石阶小路",
  hasSourceImage: true,
  format: "equirectangular",
});

assert(prompt.includes("雨后竹林"), "keeps the user's scene prompt");
assert(prompt.includes("360"), "requires a 360 panorama");
assert(prompt.includes("equirectangular"), "includes the selected panorama format");
assert(prompt.includes("2:1"), "requires a 2:1 panorama aspect ratio");
assert(prompt.includes("seamless"), "requires seamless left-right edges");
assert(prompt.includes("reference image"), "mentions source image guidance when provided");

const cubemapPrompt = buildPanoramaPrompt({
  userPrompt: "雪山营地",
  hasSourceImage: false,
  format: "cubemap",
});

assert(cubemapPrompt.includes("six equal square cube faces"), "describes cubemap face requirements");
assert(cubemapPrompt.includes("front, right, back, left, up, down"), "fixes a predictable cubemap face order");
assert(cubemapPrompt.includes("horizontal strip"), "requests a preview-friendly cubemap layout");
assert(!cubemapPrompt.includes("2:1 equirectangular"), "does not mix equirectangular constraints into cubemap output");
