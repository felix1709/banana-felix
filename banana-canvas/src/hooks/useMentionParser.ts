import type { CanvasNode, NodeType } from "../types/node";
import { NODE_TYPE_LABELS } from "../types/node";

export interface MentionedNode {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  content: string;
  mentionText: string;
}

export function parseMentions(text: string, allNodes: CanvasNode[]): MentionedNode[] {
  const regex = /@([^\s@]+)/g;
  const results: MentionedNode[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const mentionName = match[1];

    const found = allNodes.find(
      (n) => n.nodeName && n.nodeName.toLowerCase() === mentionName.toLowerCase(),
    );
    if (found) {
      results.push({
        nodeId: found.id,
        nodeName: found.nodeName,
        nodeType: found.type,
        content: found.content,
        mentionText: match[0],
      });
    }
  }

  return results;
}

export function getMentionableNodes(
  allNodes: CanvasNode[],
  selfId: string,
): Array<{ nodeId: string; nodeName: string; nodeType: NodeType; content: string }> {
  return allNodes
    .filter((n) => n.id !== selfId)
    .map((n) => ({
      nodeId: n.id,
      nodeName: n.nodeName || NODE_TYPE_LABELS[n.type] || n.type,
      nodeType: n.type,
      content: n.content,
    }));
}

// Build merged prompt from TextNode's three prompt fields
export function buildMergedPrompt(node: CanvasNode): string {
  const parts: string[] = [];
  if (node.prompt) parts.push(node.prompt);
  const settings = node.settings as Record<string, unknown>;
  if (settings?.qualityPrompt) parts.push(settings.qualityPrompt as string);
  if (settings?.negativePrompt) parts.push(`[负面] ${settings.negativePrompt as string}`);
  return parts.join("\n");
}
