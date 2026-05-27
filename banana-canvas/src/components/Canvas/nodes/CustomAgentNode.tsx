import { memo, useCallback, useState } from "react";
import { v4 as uuid } from "uuid";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import type { CustomAgentSettings } from "../../../types/settings";

const AGENT_MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet" },
];

export const CustomAgentNode = memo(function CustomAgentNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<CustomAgentSettings>(id);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const sliderChange = useCallback(
    (key: keyof CustomAgentSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  const handleRun = useCallback(async () => {
    setRunning(true);
    const jobId = addJob({ id: uuid(), nodeId: id, type: "custom-agent", taskId: "", status: "running", progress: 0, createdAt: Date.now() });

    // Placeholder
    setTimeout(() => {
      const result = `Agent output (${settings.model})`;
      updateJob(jobId, { status: "succeeded" });
      useGraphStore.getState().updateNode(id, { content: result });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: result } } : n),
      );
      setOutput(result);
      setRunning(false);
    }, 1500);
  }, [id, settings.model, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="custom-agent" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
          <select value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {AGENT_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <textarea value={settings.systemPrompt}
          onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
          placeholder="系统提示词..."
          className="w-full text-[11px] px-2 py-1 rounded border outline-none resize-none"
          style={{ height: 80, ...inputStyle }} />
        <div className="flex gap-2">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>温度</span>
            <input type="range" min={0} max={2} step={0.1} value={settings.temperature}
              onChange={(e) => sliderChange("temperature", Number(e.target.value))}
              className="flex-1 nodrag" style={{ accentColor: "#8b5cf6" }} />
            <span className="text-[10px] w-5" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.temperature}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>Token</span>
            <input type="number" value={settings.maxTokens} min={64} max={8192} step={64}
              onChange={(e) => sliderChange("maxTokens", Number(e.target.value))}
              className="w-14 text-[11px] px-1 py-0.5 rounded border outline-none" style={inputStyle} />
          </div>
        </div>
        <button type="button" onClick={handleRun} disabled={running}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: running ? (isDark ? "#3f3f46" : "#d4d4d8") : "#8b5cf6",
            color: running ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {running ? "运行中..." : "运行代理"}
        </button>
        {output && (
          <div className="rounded border p-1.5 text-[10px] whitespace-pre-wrap" style={{
            ...inputStyle, maxHeight: 80, overflow: "auto",
          }}>
            {output}
          </div>
        )}
      </div>
    </BaseNode>
  );
});
