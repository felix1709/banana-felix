import { useMemo } from "react";
import { useGraphStore } from "../stores/graphStore";

interface UpstreamNode {
  edgeId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  content: string;
  prompt: string;
  fromPort: string;
  toPort: string;
}

export function useUpstreamNodes(nodeId: string): UpstreamNode[] {
  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);

  return useMemo(() => {
    const incoming = edges.filter((e) => e.to === nodeId);
    return incoming
      .map((edge) => {
        const src = nodes.find((n) => n.id === edge.from);
        if (!src) return null;
        return {
          edgeId: edge.id,
          nodeId: src.id,
          nodeName: src.nodeName,
          nodeType: src.type,
          content: src.content,
          prompt: src.prompt,
          fromPort: edge.fromPort,
          toPort: edge.toPort,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [edges, nodeId, nodes]);
}
