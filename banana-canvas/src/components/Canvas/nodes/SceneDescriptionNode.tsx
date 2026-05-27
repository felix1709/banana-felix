import { memo, useCallback, useState } from "react";
import { v4 as uuid } from "uuid";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import type { SceneDescriptionSettings } from "../../../types/settings";

const DETAIL_LEVELS: SceneDescriptionSettings["detailLevel"][] = ["brief", "detailed", "comprehensive"];
const DETAIL_LABELS: Record<SceneDescriptionSettings["detailLevel"], string> = {
  brief: "简要", detailed: "详细", comprehensive: "全面",
};

export const SceneDescriptionNode = memo(function SceneDescriptionNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<SceneDescriptionSettings>(id);
  const [running, setRunning] = useState(false);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const handleRun = useCallback(async () => {
    setRunning(true);
    const jobId = addJob({ id: uuid(), nodeId: id, type: "scene-description", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    setTimeout(() => {
      const result = `场景描述 (${settings.detailLevel})`;
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: result });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: result } } : n),
      );
      setRunning(false);
    }, 1500);
  }, [id, settings.detailLevel, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="scene-description" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
          <select value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>详细度</span>
          <select value={settings.detailLevel}
            onChange={(e) => updateSettings({ detailLevel: e.target.value as SceneDescriptionSettings["detailLevel"] })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {DETAIL_LEVELS.map((d) => <option key={d} value={d}>{DETAIL_LABELS[d]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>方面</span>
          <input type="text" value={settings.aspects}
            onChange={(e) => updateSettings({ aspects: e.target.value })}
            placeholder="环境,光照,氛围"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <button type="button" onClick={handleRun} disabled={running}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: running ? (isDark ? "#3f3f46" : "#d4d4d8") : "#8b5cf6",
            color: running ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {running ? "生成中..." : "生成场景描述"}
        </button>
      </div>
    </BaseNode>
  );
});
