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
  equirectangular: { size: "4096x2048", ratio: "2:1" },
  cubemap: { size: "6144x1024", ratio: "6:1" },
};

const PANORAMA_HD_EXTRA: Record<string, unknown> = {
  high_resolution: true,
  hd: true,
  detail_enhance: true,
  enhance_details: true,
  hires_fix: true,
  hiresFix: true,
  super_resolution: true,
  preserve_original_resolution: true,
  disable_downsampling: true,
  sampling_steps: 40,
  steps: 40,
  cfg_scale: 7,
  guidance_scale: 7,
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
    extra: { ...PANORAMA_HD_EXTRA },
  };
}
