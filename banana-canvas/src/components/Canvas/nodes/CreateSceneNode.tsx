import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import type { CreateSceneSettings } from "../../../types/settings";

const TIME_OPTIONS = ["白天", "黄昏", "夜晚", "黎明", "正午", "深夜"];

export const CreateSceneNode = memo(function CreateSceneNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<CreateSceneSettings>(id);
  const { setNodes: setXyNodes } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const update = useCallback(
    (key: keyof CreateSceneSettings, val: string) => {
      updateSettings({ [key]: val });
      const newSettings = { ...settings, [key]: val };
      const content = [newSettings.name, newSettings.environment, newSettings.lighting, newSettings.atmosphere, newSettings.timeOfDay]
        .filter(Boolean).join(" | ");
      useGraphStore.getState().updateNode(id, { content });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content } } : n),
      );
    },
    [id, settings, updateSettings, setXyNodes],
  );

  return (
    <BaseNode id={id} type="create-scene" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>名称</span>
          <input type="text" value={settings.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="场景名称"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>环境</span>
          <input type="text" value={settings.environment}
            onChange={(e) => update("environment", e.target.value)}
            placeholder="环境描述"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>光照</span>
          <input type="text" value={settings.lighting}
            onChange={(e) => update("lighting", e.target.value)}
            placeholder="光照条件"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>氛围</span>
          <input type="text" value={settings.atmosphere}
            onChange={(e) => update("atmosphere", e.target.value)}
            placeholder="氛围感受"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>时段</span>
          <select value={settings.timeOfDay}
            onChange={(e) => update("timeOfDay", e.target.value)}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </BaseNode>
  );
});
