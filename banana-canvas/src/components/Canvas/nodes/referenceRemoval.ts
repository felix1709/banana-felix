import type { CanvasEdge } from "../../../types/node";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripReferenceMention(text: string, refName: string): string {
  if (!text || !refName) return text;

  const escapedName = escapeRegExp(refName);
  let next = text.replace(new RegExp(`@${escapedName}(?=\\s|$)\\s*`, "g"), "");

  // Some existing node names contain spaces even though parser tokens are whitespace-bound.
  // Remove the exact inserted text as a fallback for those legacy names only.
  if (/\s/.test(refName)) {
    next = next.split(`@${refName}`).join("");
  }

  return next
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function removeIncomingReferenceEdges(
  edges: CanvasEdge[],
  params: { targetNodeId: string; sourceNodeId: string; edgeId?: string; ignoredTargetPorts?: string[] },
): CanvasEdge[] {
  const edgeIdsToRemove = getIncomingReferenceEdgeIdsToRemove(edges, params);
  return edges.filter((edge) => !edgeIdsToRemove.has(edge.id));
}

export function getIncomingReferenceEdgeIdsToRemove(
  edges: CanvasEdge[],
  params: { targetNodeId: string; sourceNodeId: string; edgeId?: string; ignoredTargetPorts?: string[] },
): Set<string> {
  const { targetNodeId, sourceNodeId, edgeId } = params;
  const ignoredTargetPorts = new Set(params.ignoredTargetPorts ?? []);
  const matchingEdges = edges.filter((edge) => {
    const targetPort = edge.toPort ?? "default";
    return edge.to === targetNodeId && edge.from === sourceNodeId && !ignoredTargetPorts.has(targetPort);
  });
  const matchingIds = new Set(matchingEdges.map((edge) => edge.id));

  if (edgeId && !matchingIds.has(edgeId)) matchingIds.add(edgeId);
  return matchingIds;
}
