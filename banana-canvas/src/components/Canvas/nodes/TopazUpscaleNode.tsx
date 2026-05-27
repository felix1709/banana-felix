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
import type { TopazUpscaleSettings } from "../../../types/settings";

const SCALE_OPTIONS: TopazUpscaleSettings["scale"][] = [2, 3, 4];
const TOPAZ_MODELS = [
  { value: "topaz-standard", label: "Standard" },
  { value: "topaz-high-quality", label: "High Quality" },
  { value: "topaz-art", label: "Art" },
];

export const TopazUpscaleNode = memo(function TopazUpscaleNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<TopazUpscaleSettings>(id);
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

  const sliderChange = useCallback(
    (key: keyof TopazUpscaleSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  const handleGenerate = useCallback(async () => {
    if (!upstreamContent) return;
    setGenerating(true);
    const jobId = addJob({ id: uuid(), nodeId: id, type: "topaz-upscale", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
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
    <BaseNode id={id} type="topaz-upscale" selected={selected}>
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
              onChange={(e) => updateSettings({ scale: Number(e.target.value) as TopazUpscaleSettings["scale"] })}
              className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
              {SCALE_OPTIONS.map((s) => <option key={s} value={s}>{s}x</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
            <select value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
              className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
              {TOPAZ_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-14 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>降噪</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.denoise}
            onChange={(e) => sliderChange("denoise", Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#22c55e" }} />
          <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.denoise}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-14 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>锐化</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.sharpen}
            onChange={(e) => sliderChange("sharpen", Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#22c55e" }} />
          <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.sharpen}</span>
        </div>
        <button type="button" onClick={handleGenerate} disabled={generating || !upstreamContent}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: generating || !upstreamContent ? (isDark ? "#3f3f46" : "#d4d4d8") : "#22c55e",
            color: generating || !upstreamContent ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "放大中..." : "高清放大"}
        </button>
      </div>
    </BaseNode>
  );
});
