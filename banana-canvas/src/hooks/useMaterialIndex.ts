import { useMemo } from "react";
import { useGraphStore } from "../stores/graphStore";
import type { CanvasNode } from "../types/node";

export interface MaterialEntry {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  content: string;
  order: number;
  index: number; // 1-based display index after sorting
}

const INDEXABLE_TYPES = ["input-image", "video-input", "audio-input"];

export function useMaterialIndex(): MaterialEntry[] {
  const nodes = useGraphStore((s) => s.nodes);
  return useMemo(() => computeMaterialIndex(nodes), [nodes]);
}

export function getMaterialIndexStatic(nodes: CanvasNode[]): MaterialEntry[] {
  return computeMaterialIndex(nodes);
}

function computeMaterialIndex(nodes: CanvasNode[]): MaterialEntry[] {
  const indexed = nodes.filter((n) => INDEXABLE_TYPES.includes(n.type));
  const sorted = [...indexed].sort((a, b) => {
    const orderA = (a.settings as Record<string, unknown>)?.materialOrder as number ?? 0;
    const orderB = (b.settings as Record<string, unknown>)?.materialOrder as number ?? 0;
    if (orderA !== 0 && orderB !== 0) return orderA - orderB;
    if (orderA !== 0) return -1;
    if (orderB !== 0) return 1;
    return a.id.localeCompare(b.id);
  });
  return sorted.map((n, i) => ({
    nodeId: n.id,
    nodeName: n.nodeName || `${defaultLabel(n.type)}输入`,
    nodeType: n.type,
    content: n.content,
    order: (n.settings as Record<string, unknown>)?.materialOrder as number ?? 0,
    index: i + 1,
  }));
}

function defaultLabel(type: string): string {
  switch (type) {
    case "input-image": return "图片";
    case "video-input": return "视频";
    case "audio-input": return "音频";
    default: return type;
  }
}
