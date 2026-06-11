export interface PanoramaViewState {
  yaw: number;
  pitch: number;
  fov: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

export interface PanoramaDragStart {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
}

export type RenderablePanoramaImage = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

export type CubemapFace = "front" | "right" | "back" | "left" | "up" | "down";

export interface CubemapLayout {
  type: "horizontal-strip" | "vertical-strip" | "grid-3x2";
  faceSize: number;
  faces: Record<CubemapFace, { x: number; y: number; size: number }>;
}

export type PanoramaSourceFormat = "equirectangular" | "cubemap";

const DIRECT_PREVIEW_MAX_PIXELS = 96_000_000;

export function normalizeYaw(yaw: number): number {
  return ((yaw % 360) + 360) % 360;
}

export function clampPitch(pitch: number): number {
  return Math.max(-85, Math.min(85, pitch));
}

export function clampFov(fov: number): number {
  return Math.max(30, Math.min(100, fov));
}

export function calculateEquirectangularVerticalFov(
  horizontalFov: number,
  width: number,
  height: number,
): number {
  if (width <= 0 || height <= 0) return clampFov(horizontalFov);
  const horizontalRadians = (clampFov(horizontalFov) * Math.PI) / 180;
  const verticalRadians = 2 * Math.atan(Math.tan(horizontalRadians / 2) * (height / width));
  return (verticalRadians * 180) / Math.PI;
}

export function calculatePanoramaCanvasRenderSize(
  clientWidth: number,
  clientHeight: number,
  visualWidth: number,
  visualHeight: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.floor(visualWidth || clientWidth)),
    height: Math.max(1, Math.floor(visualHeight || clientHeight)),
  };
}

export function getSafeCanvasDpr(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxPixels = 900_000,
): number {
  if (width <= 0 || height <= 0) return 1;
  const desiredDpr = Math.max(1, Math.min(devicePixelRatio || 1, 2));
  const desiredPixels = width * height * desiredDpr * desiredDpr;
  if (desiredPixels <= maxPixels) return desiredDpr;
  return Math.max(0.75, Math.sqrt(maxPixels / (width * height)));
}

export function getDownsampledSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number; scale: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1, scale: 1 };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

export function shouldUseOriginalPanoramaImage(
  width: number,
  height: number,
  _format: PanoramaSourceFormat,
): boolean {
  return width > 0
    && height > 0
    && width * height <= DIRECT_PREVIEW_MAX_PIXELS;
}

export function movePanoramaView(
  view: PanoramaViewState,
  keys: Set<string>,
  step = 1,
): PanoramaViewState {
  let { offsetX, offsetY, offsetZ } = view;
  const amount = 0.04 * step;
  if (keys.has("w")) offsetZ -= amount;
  if (keys.has("s")) offsetZ += amount;
  if (keys.has("a")) offsetX -= amount;
  if (keys.has("d")) offsetX += amount;
  if (keys.has("q")) offsetY += amount;
  if (keys.has("e")) offsetY -= amount;
  return { ...view, offsetX, offsetY, offsetZ };
}

export function rotatePanoramaViewFromDrag(
  view: PanoramaViewState,
  dragStart: PanoramaDragStart,
  clientX: number,
  clientY: number,
): PanoramaViewState {
  const dx = clientX - dragStart.x;
  const dy = clientY - dragStart.y;
  return {
    ...view,
    yaw: normalizeYaw(dragStart.yaw - dx * 0.18),
    pitch: clampPitch(dragStart.pitch + dy * 0.14),
  };
}

function closeTo(a: number, b: number, tolerance = 0.08): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function detectCubemapLayout(width: number, height: number): CubemapLayout | null {
  if (width <= 0 || height <= 0) return null;

  const ratio = width / height;
  const horizontalFace = width / 6;
  if (closeTo(ratio, 6) && Math.abs(horizontalFace - height) <= Math.max(2, height * 0.03)) {
    const size = Math.min(horizontalFace, height);
    const order: CubemapFace[] = ["front", "right", "back", "left", "up", "down"];
    return {
      type: "horizontal-strip",
      faceSize: size,
      faces: Object.fromEntries(order.map((face, index) => [face, { x: index * size, y: 0, size }])) as CubemapLayout["faces"],
    };
  }

  const verticalFace = height / 6;
  if (closeTo(ratio, 1 / 6) && Math.abs(verticalFace - width) <= Math.max(2, width * 0.03)) {
    const size = Math.min(width, verticalFace);
    const order: CubemapFace[] = ["front", "right", "back", "left", "up", "down"];
    return {
      type: "vertical-strip",
      faceSize: size,
      faces: Object.fromEntries(order.map((face, index) => [face, { x: 0, y: index * size, size }])) as CubemapLayout["faces"],
    };
  }

  const gridFaceW = width / 3;
  const gridFaceH = height / 2;
  if (closeTo(ratio, 3 / 2) && Math.abs(gridFaceW - gridFaceH) <= Math.max(2, gridFaceH * 0.03)) {
    const size = Math.min(gridFaceW, gridFaceH);
    const order: CubemapFace[] = ["front", "right", "back", "left", "up", "down"];
    return {
      type: "grid-3x2",
      faceSize: size,
      faces: Object.fromEntries(order.map((face, index) => [face, { x: (index % 3) * size, y: Math.floor(index / 3) * size, size }])) as CubemapLayout["faces"],
    };
  }

  return null;
}

export function directionToCubemapFace(x: number, y: number, z: number): {
  face: CubemapFace;
  u: number;
  v: number;
} {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);

  if (az >= ax && az >= ay) {
    const inv = 1 / Math.max(az, 0.00001);
    return z >= 0
      ? { face: "front", u: x * inv, v: -y * inv }
      : { face: "back", u: -x * inv, v: -y * inv };
  }

  if (ax >= ay && ax >= az) {
    const inv = 1 / Math.max(ax, 0.00001);
    return x >= 0
      ? { face: "right", u: -z * inv, v: -y * inv }
      : { face: "left", u: z * inv, v: -y * inv };
  }

  const inv = 1 / Math.max(ay, 0.00001);
  return y >= 0
    ? { face: "up", u: x * inv, v: z * inv }
    : { face: "down", u: x * inv, v: -z * inv };
}

export function renderEquirectangularPanorama(
  ctx: CanvasRenderingContext2D,
  image: RenderablePanoramaImage,
  view: PanoramaViewState,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
  const sourceWidth = image.width || 1;
  const sourceHeight = image.height || 1;
  if (sourceWidth <= 1 || sourceHeight <= 1) return;

  const stripCount = Math.max(96, Math.min(220, Math.floor(width / 3)));
  const stripWidth = width / stripCount;
  const fov = clampFov(view.fov);
  const yawCenter = normalizeYaw(view.yaw + view.offsetX * 18);
  const pitchOffset = clampPitch(view.pitch + view.offsetY * 18);
  const zoomFactor = Math.max(0.65, Math.min(1.35, 1 + view.offsetZ));
  const verticalFov = calculateEquirectangularVerticalFov(fov, width, height);
  const sourceHeightRatio = (verticalFov / 180) * zoomFactor;
  const visibleSourceHeight = sourceHeight * sourceHeightRatio;
  const sourceY = Math.max(
    0,
    Math.min(
      sourceHeight - visibleSourceHeight,
      sourceHeight / 2 - visibleSourceHeight / 2 - (pitchOffset / 180) * sourceHeight,
    ),
  );

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let i = 0; i < stripCount; i++) {
    const screenX = i * stripWidth;
    const angleOffset = ((i / stripCount) - 0.5) * fov;
    const sourceCenter = ((yawCenter + angleOffset) / 360) * sourceWidth;
    const sx = ((sourceCenter % sourceWidth) + sourceWidth) % sourceWidth;
    const sourceStripWidth = Math.max(1, sourceWidth * (fov / 360) / stripCount);
    const destinationWidth = Math.ceil(stripWidth) + 1;

    if (sx + sourceStripWidth <= sourceWidth) {
      ctx.drawImage(
        image,
        sx,
        sourceY,
        sourceStripWidth,
        visibleSourceHeight,
        screenX,
        0,
        destinationWidth,
        height,
      );
    } else {
      const firstWidth = sourceWidth - sx;
      const secondWidth = sourceStripWidth - firstWidth;
      const firstDestWidth = destinationWidth * (firstWidth / sourceStripWidth);
      ctx.drawImage(image, sx, sourceY, firstWidth, visibleSourceHeight, screenX, 0, firstDestWidth, height);
      ctx.drawImage(image, 0, sourceY, secondWidth, visibleSourceHeight, screenX + firstDestWidth, 0, destinationWidth - firstDestWidth, height);
    }
  }
}

export function renderCubemapPanorama(
  ctx: CanvasRenderingContext2D,
  source: ImageData,
  layout: CubemapLayout,
  view: PanoramaViewState,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;

  const output = ctx.createImageData(width, height);
  const outputData = output.data;
  const sourceData = source.data;
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const yawCenter = normalizeYaw(view.yaw + view.offsetX * 18);
  const pitchCenter = clampPitch(view.pitch + view.offsetY * 18);
  const zoomFactor = Math.max(0.65, Math.min(1.35, 1 + view.offsetZ));
  const horizontalFov = clampFov(view.fov * zoomFactor);
  const verticalFov = horizontalFov * (height / Math.max(width, 1));

  for (let y = 0; y < height; y++) {
    const pitch = clampPitch(pitchCenter - ((y / Math.max(height - 1, 1)) - 0.5) * verticalFov);
    const pitchRad = (pitch * Math.PI) / 180;
    const cosPitch = Math.cos(pitchRad);

    for (let x = 0; x < width; x++) {
      const yaw = normalizeYaw(yawCenter + ((x / Math.max(width - 1, 1)) - 0.5) * horizontalFov);
      const yawRad = (yaw * Math.PI) / 180;
      const direction = directionToCubemapFace(
        Math.sin(yawRad) * cosPitch,
        Math.sin(pitchRad),
        Math.cos(yawRad) * cosPitch,
      );
      const face = layout.faces[direction.face];
      const sx = Math.max(0, Math.min(sourceWidth - 1, Math.round(face.x + ((direction.u + 1) / 2) * (face.size - 1))));
      const sy = Math.max(0, Math.min(sourceHeight - 1, Math.round(face.y + ((direction.v + 1) / 2) * (face.size - 1))));
      const srcIndex = (sy * sourceWidth + sx) * 4;
      const outIndex = (y * width + x) * 4;
      outputData[outIndex] = sourceData[srcIndex];
      outputData[outIndex + 1] = sourceData[srcIndex + 1];
      outputData[outIndex + 2] = sourceData[srcIndex + 2];
      outputData[outIndex + 3] = sourceData[srcIndex + 3] || 255;
    }
  }

  ctx.putImageData(output, 0, 0);
}
