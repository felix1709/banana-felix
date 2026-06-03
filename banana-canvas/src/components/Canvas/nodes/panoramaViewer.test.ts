import {
  clampFov,
  detectCubemapLayout,
  directionToCubemapFace,
  getDownsampledSize,
  getSafeCanvasDpr,
  movePanoramaView,
  normalizeYaw,
  rotatePanoramaViewFromDrag,
} from "./panoramaViewer.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(normalizeYaw(370) === 10, "wraps yaw over 360 degrees");
assert(normalizeYaw(-10) === 350, "wraps negative yaw into positive range");
assert(clampFov(10) === 30, "clamps narrow fov");
assert(clampFov(140) === 100, "clamps wide fov");
assert(getSafeCanvasDpr(300, 200, 2) === 2, "keeps DPR for small canvases");
assert(getSafeCanvasDpr(4000, 3000, 2) < 1, "reduces DPR for huge canvases");

const downsampled = getDownsampledSize(12000, 6000, 4096, 2048);
assert(downsampled.width === 4096, "downsamples panorama width");
assert(downsampled.height === 2048, "downsamples panorama height proportionally");
assert(downsampled.scale < 1, "reports reduced scale");

const start = { yaw: 90, pitch: 0, fov: 60, offsetX: 0, offsetY: 0, offsetZ: 0 };
const moved = movePanoramaView(start, new Set(["w", "a", "q"]), 1);

assert(moved.offsetZ < 0, "w moves forward");
assert(moved.offsetX < 0, "a moves left");
assert(moved.offsetY > 0, "q moves up");
assert(moved.yaw === 90, "movement does not rotate yaw");

const dragged = rotatePanoramaViewFromDrag(start, { x: 100, y: 100, yaw: 90, pitch: 0 }, 200, 150);
assert(Math.abs(dragged.yaw - 72) < 0.001, "dragging right rotates the panorama yaw from the drag start");
assert(Math.abs(dragged.pitch - 7) < 0.001, "dragging down rotates the panorama pitch from the drag start");

const stripLayout = detectCubemapLayout(6144, 1024);
assert(stripLayout?.type === "horizontal-strip", "detects six-face horizontal cubemap strips");
assert(stripLayout, "horizontal cubemap layout is not null");
assert(stripLayout.faces.front.x === 0, "front face starts first");
assert(stripLayout.faces.right.x === 1024, "right face is second");

const gridLayout = detectCubemapLayout(3072, 2048);
assert(gridLayout?.type === "grid-3x2", "detects 3x2 cubemap grids");

assert(directionToCubemapFace(0, 0, 1).face === "front", "positive z maps to front");
assert(directionToCubemapFace(1, 0, 0).face === "right", "positive x maps to right");
assert(directionToCubemapFace(0, 1, 0).face === "up", "positive y maps to up");
