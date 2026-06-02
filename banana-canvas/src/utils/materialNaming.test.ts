import { getMaterialFileName, getNextMaterialName, getNextMaterialOrder } from "./materialNaming.js";
import type { CanvasNode } from "../types/node.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const nodes = [
  { id: "1", type: "input-image", nodeName: "图片1", settings: { materialOrder: 3 } },
  { id: "2", type: "input-image", nodeName: "旧图片名", settings: { materialOrder: 1 } },
  { id: "3", type: "input-image", nodeName: "图片(3)", settings: { materialOrder: 7 } },
  { id: "4", type: "video-input", nodeName: "视频(1)", settings: { materialOrder: 2 } },
] as CanvasNode[];

assert(getNextMaterialName(nodes, "input-image") === "图片2", "fills the first available image number without parentheses");
assert(getNextMaterialName(nodes, "video-input") === "视频(2)", "numbers videos independently");
assert(getNextMaterialOrder(nodes, "input-image") === 8, "uses max material order + 1");
assert(getMaterialFileName("图片12", "input-image") === "image_12", "creates safe asset file names from compact names");
assert(getMaterialFileName("图片(12)", "input-image") === "image_12", "keeps legacy parenthesized names compatible");
