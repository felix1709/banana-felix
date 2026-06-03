import { appendUniqueCanvasEdge, dedupeCanvasEdges } from "./edgeDedup.js";
import type { CanvasEdge } from "../types/node.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const baseEdge: CanvasEdge = {
  id: "edge-1",
  from: "source",
  to: "target",
  fromPort: "default",
  toPort: "default",
  inputType: "default",
};

const duplicateEdge: CanvasEdge = {
  ...baseEdge,
  id: "edge-2",
};

const differentPortEdge: CanvasEdge = {
  ...baseEdge,
  id: "edge-3",
  toPort: "sref",
};

assert(
  appendUniqueCanvasEdge([baseEdge], duplicateEdge).length === 1,
  "does not append a duplicate source-target-port edge",
);

assert(
  appendUniqueCanvasEdge([baseEdge], differentPortEdge).length === 2,
  "keeps a second edge when the target port is different",
);

assert(
  dedupeCanvasEdges([baseEdge, duplicateEdge, differentPortEdge]).map((edge) => edge.id).join(",") === "edge-1,edge-3",
  "dedupes existing edge arrays while preserving the first edge",
);
