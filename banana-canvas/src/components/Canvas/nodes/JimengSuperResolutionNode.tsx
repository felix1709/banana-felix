import { memo, useCallback, useState } from "react";
import { v4 as uuid } from "uuid";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUpstreamNodes } from "../../../hooks/useUpstreamNodes";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import type { JimengSuperResolutionSettings } from "../../../types/settings";

const SCALE_OPTIONS: JimengSuperResolutionSettings["scale"][] = [2, 3, 4];
const SR_MODELS = [
  { value: "jimeng-sr", label: "即梦超清" },
  { value: "jimeng-sr-v2", label: "即梦超清 V2" },
];

export const JimengSuperResolutionNode = memo(function JimengSuperResolutionNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<JimengSuperResolutionSettings>(id);
  const [generating, setGenerating] = useState(false);
  const upstream = useUpstreamNodes(id);
  const upstreamContent = upstream.length > 0 ? upstream[upstream.length - 1].content : "";
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const handleGenerate = useCallback(async () => {
    if (!upstreamContent) return;
    setGenerating(true);
    const jobId = addJob({ id: uuid(), nodeId: id, type: "jimeng-super-resolution", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    setTimeout(() => {
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: upstreamContent });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: upstreamContent } } : n),
      );
      setGenerating(false);
    }, 2000);
  }, [id, upstreamContent, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="jimeng-super-resolution" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="rounded border flex items-center justify-center overflow-hidden" style={{
          height: 100,
          background: isDark ? "#27272a" : "#f4f4f5",
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        }}>
          {upstreamContent ? (
            <img src={upstreamContent} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>连接图片节点</span>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>倍率</span>
            <select value={settings.scale}
              onChange={(e) => updateSettings({ scale: Number(e.target.value) as JimengSuperResolutionSettings["scale"] })}
              className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
              {SCALE_OPTIONS.map((s) => <option key={s} value={s}>{s}x</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
            <select value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
              className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
              {SR_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <input type="text" value={settings.prompt}
          onChange={(e) => updateSettings({ prompt: e.target.value })}
          placeholder="增强提示词（可选）"
          className="w-full text-[11px] px-2 py-1 rounded border outline-none" style={inputStyle} />
        <button type="button" onClick={handleGenerate} disabled={generating || !upstreamContent}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: generating || !upstreamContent ? (isDark ? "#3f3f46" : "#d4d4d8") : "#22c55e",
            color: generating || !upstreamContent ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "超清中..." : "超清放大"}
        </button>
      </div>
    </BaseNode>
  );
});
