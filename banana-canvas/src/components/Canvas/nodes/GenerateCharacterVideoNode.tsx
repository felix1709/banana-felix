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
import type { GenerateCharacterVideoSettings } from "../../../types/settings";
import { UpstreamReferenceHeader } from "./UpstreamReferenceHeader";

const VIDEO_MODELS = [
  { value: "veo-2", label: "Veo 2" },
  { value: "kling", label: "Kling" },
];
const RESOLUTIONS = ["1280x720", "960x540", "640x480"];

export const GenerateCharacterVideoNode = memo(function GenerateCharacterVideoNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<GenerateCharacterVideoSettings>(id);
  const [generating, setGenerating] = useState(false);
  const upstream = useUpstreamNodes(id);
  const upstreamRef = upstream.length > 0 ? upstream[upstream.length - 1] : null;
  const upstreamContent = upstreamRef?.content ?? "";
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    const jobId = addJob({ id: uuid(), nodeId: id, type: "generate-character-video", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    setTimeout(() => {
      const placeholder = "data:video/mp4;base64,placeholder";
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: placeholder });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: placeholder } } : n),
      );
      setGenerating(false);
    }, 2000);
  }, [id, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="generate-character-video" selected={selected}>
      <div className="flex flex-col gap-2">
        {upstreamRef && (
          <UpstreamReferenceHeader
            targetNodeId={id}
            reference={upstreamRef}
            isDark={isDark}
            promptValue={settings.motion}
            onPromptChange={(nextPrompt) => updateSettings({ motion: nextPrompt })}
          />
        )}
        {upstreamContent && (
          <div className="rounded border overflow-hidden" style={{ height: 60, borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
            <img src={upstreamContent} alt="" className="w-full h-full object-contain" />
          </div>
        )}
        <div className="flex gap-1">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
            <select value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
              className="flex-1 text-[11px] px-1 py-0.5 rounded border outline-none" style={inputStyle}>
              {VIDEO_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>时长</span>
            <input type="number" value={settings.duration} min={1} max={30}
              onChange={(e) => updateSettings({ duration: Number(e.target.value) })}
              className="w-10 text-[10px] px-1 py-0.5 rounded border outline-none" style={inputStyle} />
            <span className="text-[9px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>s</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>分辨率</span>
          <select value={settings.resolution}
            onChange={(e) => updateSettings({ resolution: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <input type="text" value={settings.motion}
          onChange={(e) => updateSettings({ motion: e.target.value })}
          placeholder="动作描述"
          className="w-full text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        <input type="text" value={settings.negativePrompt}
          onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
          placeholder="负面提示词"
          className="w-full text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: generating ? (isDark ? "#3f3f46" : "#d4d4d8") : "#ef4444",
            color: generating ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "生成中..." : "生成角色视频"}
        </button>
      </div>
    </BaseNode>
  );
});
