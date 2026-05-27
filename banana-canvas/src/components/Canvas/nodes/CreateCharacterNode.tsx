import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import type { CreateCharacterSettings } from "../../../types/settings";

export const CreateCharacterNode = memo(function CreateCharacterNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<CreateCharacterSettings>(id);
  const { setNodes: setXyNodes } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const update = useCallback(
    (key: keyof CreateCharacterSettings, val: string) => {
      updateSettings({ [key]: val });
      // Also update node content for downstream
      const newSettings = { ...settings, [key]: val };
      const content = [newSettings.name, newSettings.appearance, newSettings.personality].filter(Boolean).join(" | ");
      useGraphStore.getState().updateNode(id, { content });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content } } : n),
      );
    },
    [id, settings, updateSettings, setXyNodes],
  );

  return (
    <BaseNode id={id} type="create-character" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>名字</span>
          <input type="text" value={settings.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="角色名称"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>外观</span>
          <input type="text" value={settings.appearance}
            onChange={(e) => update("appearance", e.target.value)}
            placeholder="外观描述"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>性格</span>
          <input type="text" value={settings.personality}
            onChange={(e) => update("personality", e.target.value)}
            placeholder="性格特点"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>参考</span>
          <input type="text" value={settings.referenceImage}
            onChange={(e) => update("referenceImage", e.target.value)}
            placeholder="参考图片URL"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
        {settings.referenceImage && (
          <div className="rounded border overflow-hidden" style={{ height: 60, borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
            <img src={settings.referenceImage} alt="" className="w-full h-full object-contain" />
          </div>
        )}
      </div>
    </BaseNode>
  );
});
