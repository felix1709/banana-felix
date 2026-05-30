import type { CanvasNode } from "../../types/node";

export interface ReferencedImagePart {
  nodeId: string;
  nodeName: string;
  imageUrl: string;
}

export function isImageNodeContent(node: CanvasNode): boolean {
  return (
    (node.type === "input-image" || node.type === "gen-image") &&
    typeof node.content === "string" &&
    (node.content.startsWith("data:image") || node.content.startsWith("http"))
  );
}

export function buildReferencedImageParts(text: string, nodes: CanvasNode[]): ReferencedImagePart[] {
  const seen = new Set<string>();
  const mentionNames = Array.from(text.matchAll(/@([^\s@]+)/g)).map((match) => match[1].toLowerCase());
  return mentionNames
    .map((mentionName) => nodes.find((node) => (node.nodeName || "").toLowerCase() === mentionName))
    .filter((node): node is CanvasNode => !!node && isImageNodeContent(node))
    .filter((node) => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    })
    .map((node) => ({
      nodeId: node.id,
      nodeName: node.nodeName || node.id,
      imageUrl: node.content,
    }));
}
