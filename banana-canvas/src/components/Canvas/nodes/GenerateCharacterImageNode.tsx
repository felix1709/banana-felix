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
import type { GenerateCharacterImageSettings } from "../../../types/settings";
import { UpstreamReferenceHeader } from "./UpstreamReferenceHeader";

const RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const RESOLUTIONS = ["Auto", "1024x1024", "1536x1024"];

export const GenerateCharacterImageNode = memo(function GenerateCharacterImageNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<GenerateCharacterImageSettings>(id);
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
    const jobId = addJob({ id: uuid(), nodeId: id, type: "generate-character-image", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    setTimeout(() => {
      const placeholder = "data:image/png;base64,placeholder";
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: placeholder });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: placeholder } } : n),
      );
      setGenerating(false);
    }, 2000);
  }, [id, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="generate-character-image" selected={selected}>
      <div className="flex flex-col gap-2">
        {upstreamRef && (
          <UpstreamReferenceHeader
            targetNodeId={id}
            reference={upstreamRef}
            isDark={isDark}
            promptValue={settings.style}
            onPromptChange={(nextPrompt) => updateSettings({ style: nextPrompt })}
          />
        )}
        {upstreamContent && (
          <div className="rounded border overflow-hidden" style={{ height: 60, borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
            <img src={upstreamContent} alt="" className="w-full h-full object-contain" />
          </div>
        )}
        <div className="flex gap-1">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>比例</span>
            <select value={settings.ratio}
              onChange={(e) => updateSettings({ ratio: e.target.value })}
              className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none" style={inputStyle}>
              {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>分辨率</span>
            <select value={settings.resolution}
              onChange={(e) => updateSettings({ resolution: e.target.value })}
              className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none" style={inputStyle}>
              {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <input type="text" value={settings.style}
          onChange={(e) => updateSettings({ style: e.target.value })}
          placeholder="风格描述"
          className="w-full text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        <input type="text" value={settings.negativePrompt}
          onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
          placeholder="负面提示词"
          className="w-full text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: generating ? (isDark ? "#3f3f46" : "#d4d4d8") : "#3b82f6",
            color: generating ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "生成中..." : "生成角色图片"}
        </button>
      </div>
    </BaseNode>
  );
});
