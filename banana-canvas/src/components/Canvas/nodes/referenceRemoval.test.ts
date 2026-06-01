import { getIncomingReferenceEdgeIdsToRemove, removeIncomingReferenceEdges, stripReferenceMention } from "./referenceRemoval.js";
import type { CanvasEdge } from "../../../types/node.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  stripReferenceMention("wide shot @角色A cinematic", "角色A") === "wide shot cinematic",
  "removes a single mention and normalizes spaces",
);

assert(
  stripReferenceMention("@角色A\n@角色B lighting", "角色A") === "@角色B lighting",
  "removes a mention at the start of a multiline prompt",
);

assert(
  stripReferenceMention("keep @角色AB remove @角色A", "角色A") === "keep @角色AB remove",
  "does not remove longer mention names that merely share a prefix",
);

assert(
  stripReferenceMention("shot @角色 A with action", "角色 A") === "shot with action",
  "removes exact names that contain spaces",
);

const edges: CanvasEdge[] = [
  { id: "e1", from: "img-1", to: "gen-1", fromPort: "default", toPort: "default", inputType: "default" },
  { id: "e2", from: "img-1", to: "gen-1", fromPort: "default", toPort: "sref", inputType: "sref" },
  { id: "e3", from: "img-2", to: "gen-1", fromPort: "default", toPort: "default", inputType: "default" },
];

assert(
  removeIncomingReferenceEdges(edges, { targetNodeId: "gen-1", sourceNodeId: "img-1", edgeId: "e1" }).map((e) => e.id).join(",") === "e3",
  "removes matching incoming reference edges from the selected source",
);

assert(
  removeIncomingReferenceEdges(edges, { targetNodeId: "gen-1", sourceNodeId: "img-1" }).map((e) => e.id).join(",") === "e3",
  "removes all incoming edges from the selected source when no edgeId is provided",
);

assert(
  removeIncomingReferenceEdges(edges, { targetNodeId: "gen-1", sourceNodeId: "img-1", edgeId: "missing-edge" }).map((e) => e.id).join(",") === "e3",
  "falls back to removing matching source-target edges when the selected edge id is stale",
);

assert(
  [...getIncomingReferenceEdgeIdsToRemove(edges, { targetNodeId: "gen-1", sourceNodeId: "img-1", edgeId: "e1", ignoredTargetPorts: ["sref", "oref"] })].sort().join(",") === "e1",
  "can preserve special sref/oref edges while removing a normal image reference",
);
