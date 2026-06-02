import type { CanvasNode, NodeType } from "../types/node";

const MATERIAL_NAME_CONFIG: Partial<Record<NodeType, { prefix: string; filePrefix: string; compact?: boolean }>> = {
  "input-image": { prefix: "图片", filePrefix: "image", compact: true },
  "video-input": { prefix: "视频", filePrefix: "video" },
  "audio-input": { prefix: "音频", filePrefix: "audio" },
};

export function getNextMaterialOrder(nodes: CanvasNode[], type: NodeType): number {
  return nodes
    .filter((node) => node.type === type)
    .reduce((max, node) => {
      const order = Number((node.settings as Record<string, unknown>)?.materialOrder ?? 0);
      return Number.isFinite(order) && order > max ? order : max;
    }, 0) + 1;
}

export function getNextMaterialName(nodes: CanvasNode[], type: NodeType): string {
  const config = MATERIAL_NAME_CONFIG[type];
  if (!config) return "";

  const used = new Set<number>();
  const patterns = [
    new RegExp(`^${escapeRegExp(config.prefix)}(\\d+)$`),
    new RegExp(`^${escapeRegExp(config.prefix)}\\((\\d+)\\)$`),
  ];

  for (const node of nodes) {
    if (node.type !== type) continue;
    const match = patterns
      .map((pattern) => (node.nodeName || "").match(pattern))
      .find(Boolean);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) used.add(value);
  }

  let index = 1;
  while (used.has(index)) index += 1;
  if (config.compact) return `${config.prefix}${index}`;
  return `${config.prefix}(${index})`;
}

export function getMaterialFileName(nodeName: string, type: NodeType): string {
  const config = MATERIAL_NAME_CONFIG[type];
  const prefix = config?.filePrefix ?? "material";
  const safeIndex = nodeName.match(/(\d+)\)?$/)?.[1] ?? Date.now().toString();
  return `${prefix}_${safeIndex}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
