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
import type { InpaintStitchSettings } from "../../../types/settings";

const BLEND_MODES: InpaintStitchSettings["blendMode"][] = ["normal", "multiply", "screen", "overlay"];
const BLEND_LABELS: Record<InpaintStitchSettings["blendMode"], string> = {
  normal: "正常", multiply: "正片叠底", screen: "滤色", overlay: "叠加",
};

export const InpaintStitchNode = memo(function InpaintStitchNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<InpaintStitchSettings>(id);
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
    const jobId = addJob({ id: uuid(), nodeId: id, type: "inpaint-stitch", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    setTimeout(() => {
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: upstreamContent });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: upstreamContent } } : n),
      );
      setGenerating(false);
    }, 1500);
  }, [id, upstreamContent, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="inpaint-stitch" selected={selected}>
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
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-14 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>混合模式</span>
          <select value={settings.blendMode}
            onChange={(e) => updateSettings({ blendMode: e.target.value as InpaintStitchSettings["blendMode"] })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {BLEND_MODES.map((m) => <option key={m} value={m}>{BLEND_LABELS[m]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-14 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>羽化半径</span>
          <input type="range" min={0} max={50} value={settings.featherRadius}
            onChange={(e) => updateSettings({ featherRadius: Number(e.target.value) })}
            className="flex-1 nodrag" style={{ accentColor: "#f97316" }} />
          <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.featherRadius}</span>
        </div>
        <textarea value={settings.prompt}
          onChange={(e) => updateSettings({ prompt: e.target.value })}
          placeholder="拼回提示词..."
          className="w-full text-[11px] px-2 py-1 rounded border outline-none resize-none"
          style={{ height: 40, ...inputStyle }} />
        <button type="button" onClick={handleGenerate} disabled={generating || !upstreamContent}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: generating || !upstreamContent ? (isDark ? "#3f3f46" : "#d4d4d8") : "#f97316",
            color: generating || !upstreamContent ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "生成中..." : "无缝拼回"}
        </button>
      </div>
    </BaseNode>
  );
});
