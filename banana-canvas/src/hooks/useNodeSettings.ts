import { useCallback } from "react";
import { useGraphStore } from "../stores/graphStore";

const EMPTY = {};

export function useNodeSettings<T>(nodeId: string): {
  settings: T;
  updateSettings: (patch: Partial<T>) => void;
} {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId));
  const updateNode = useGraphStore((s) => s.updateNode);

  const settings = (node?.settings ?? EMPTY) as T;

  const updateSettings = useCallback(
    (patch: Partial<T>) => {
      const current = useGraphStore.getState().nodes.find((n) => n.id === nodeId);
      const currentSettings = (current?.settings ?? EMPTY) as T;
      updateNode(nodeId, {
        settings: { ...currentSettings, ...patch },
      });
    },
    [nodeId, updateNode],
  );

  return { settings, updateSettings };
}
