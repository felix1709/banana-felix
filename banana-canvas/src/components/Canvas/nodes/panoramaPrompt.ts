export type PanoramaFormat = "equirectangular" | "cubemap";

interface BuildPanoramaPromptParams {
  userPrompt: string;
  hasSourceImage: boolean;
  format: PanoramaFormat;
}

export function buildPanoramaPrompt({
  userPrompt,
  hasSourceImage,
  format,
}: BuildPanoramaPromptParams): string {
  const sourceGuidance = hasSourceImage
    ? "Use the provided reference image as the target scene to extend into a 360 panorama. Preserve its main subject, spatial layout, materials, lighting, color palette, and visual identity; expand the unseen surroundings from that exact scene instead of inventing an unrelated environment."
    : "Create the scene entirely from the text description.";
  const formatGuidance = format === "cubemap"
    ? [
        "Panorama format: cubemap.",
        "The output must be one single horizontal strip containing six equal square cube faces.",
        "The face order must be left to right: front, right, back, left, up, down.",
        "Keep lighting, horizon, scale, and object continuity consistent across every cube face.",
        "Do not add labels, separators, margins, text, logos, watermarks, UI panels, or borders between faces.",
      ]
    : [
        "Panorama format: equirectangular.",
        "The output must be a seamless 2:1 equirectangular panorama, with left and right edges matching perfectly.",
        "Avoid visible seams, stretched objects, duplicated horizons, text, logos, watermarks, UI panels, or black borders.",
      ];

  return [
    "Generate a 360 degree panorama image for immersive scene viewing.",
    ...formatGuidance,
    "Keep the horizon stable and the environment continuous in every direction.",
    sourceGuidance,
    `Scene description: ${userPrompt.trim() || "cinematic immersive environment"}`,
  ].join("\n");
}
