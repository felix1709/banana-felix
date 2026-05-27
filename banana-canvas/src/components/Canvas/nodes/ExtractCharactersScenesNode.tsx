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
import type { ExtractCharactersScenesSettings } from "../../../types/settings";

const EXTRACT_MODES: ExtractCharactersScenesSettings["extractMode"][] = ["characters", "scenes", "both"];
const EXTRACT_LABELS: Record<ExtractCharactersScenesSettings["extractMode"], string> = {
  characters: "角色", scenes: "场景", both: "角色+场景",
};

export const ExtractCharactersScenesNode = memo(function ExtractCharactersScenesNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<ExtractCharactersScenesSettings>(id);
  const [running, setRunning] = useState(false);
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

  const handleRun = useCallback(async () => {
    if (!upstreamContent) return;
    setRunning(true);
    const jobId = addJob({ id: uuid(), nodeId: id, type: "extract-characters-scenes", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    setTimeout(() => {
      const result = JSON.stringify({ mode: settings.extractMode, confidence: settings.confidence });
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: result });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: result } } : n),
      );
      setRunning(false);
    }, 1500);
  }, [id, upstreamContent, settings.extractMode, settings.confidence, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="extract-characters-scenes" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="rounded border flex items-center justify-center overflow-hidden" style={{
          height: 80,
          background: isDark ? "#27272a" : "#f4f4f5",
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        }}>
          {upstreamContent ? (
            <img src={upstreamContent} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>连接图片/视频节点</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模式</span>
          <select value={settings.extractMode}
            onChange={(e) => updateSettings({ extractMode: e.target.value as ExtractCharactersScenesSettings["extractMode"] })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {EXTRACT_MODES.map((m) => <option key={m} value={m}>{EXTRACT_LABELS[m]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>置信</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.confidence}
            onChange={(e) => updateSettings({ confidence: Number(e.target.value) })}
            className="flex-1 nodrag" style={{ accentColor: "#8b5cf6" }} />
          <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.confidence}</span>
        </div>
        <button type="button" onClick={handleRun} disabled={running || !upstreamContent}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: running || !upstreamContent ? (isDark ? "#3f3f46" : "#d4d4d8") : "#8b5cf6",
            color: running || !upstreamContent ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {running ? "提取中..." : "提取角色场景"}
        </button>
      </div>
    </BaseNode>
  );
});
