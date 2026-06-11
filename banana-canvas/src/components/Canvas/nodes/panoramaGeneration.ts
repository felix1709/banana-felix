import type { ImageGenerateRequest } from "../../../services/apiService";
import type { PanoramaFormat } from "./panoramaPrompt";

interface BuildPanoramaImageRequestParams {
  model: string;
  prompt: string;
  format: PanoramaFormat;
  sourceImage?: string;
}

interface PanoramaGenerationSpec {
  size: string;
  ratio: string;
}

const PANORAMA_GENERATION_SPECS: Record<PanoramaFormat, PanoramaGenerationSpec> = {
  equirectangular: { size: "3840x1920", ratio: "2:1" },
  cubemap: { size: "3840x640", ratio: "6:1" },
};

const PANORAMA_HD_PROMPT = [
  "Render at high resolution with crisp far-distance detail and clean edge continuity.",
  "Apply lightweight high-definition restoration for high-frequency texture detail.",
  "Preserve fine foliage, architectural edges, surface grain, and corner detail without waxy smoothing.",
].join("\n");

export function getPanoramaGenerationSpec(format: PanoramaFormat): PanoramaGenerationSpec {
  return PANORAMA_GENERATION_SPECS[format];
}

export function buildPanoramaImageRequest({
  model,
  prompt,
  format,
  sourceImage,
}: BuildPanoramaImageRequestParams): ImageGenerateRequest {
  const spec = getPanoramaGenerationSpec(format);
  return {
    model,
    prompt: `${prompt}\n${PANORAMA_HD_PROMPT}`,
    n: 1,
    size: spec.size,
    ratio: spec.ratio,
    quality: "high",
    output_format: "png",
    referenceImage: sourceImage || undefined,
    requireReferenceImage: !!sourceImage,
  };
}
