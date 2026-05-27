import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { DoodleCanvasSettings } from "../../../types/settings";

export const DoodleCanvasNode = memo(function DoodleCanvasNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<DoodleCanvasSettings>(id);

  const sliderChange = useCallback(
    (key: keyof DoodleCanvasSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  return (
    <BaseNode id={id} type="doodle-canvas" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>笔刷大小</span>
          <input type="range" min={1} max={30} value={settings.brushSize}
            onChange={(e) => sliderChange("brushSize", Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
          <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.brushSize}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>透明度</span>
          <input type="range" min={0.05} max={1} step={0.05} value={settings.opacity}
            onChange={(e) => sliderChange("opacity", Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
          <span className="text-[10px] w-8 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>颜色</span>
          <input type="color" value={settings.brushColor}
            onChange={(e) => updateSettings({ brushColor: e.target.value })}
            className="w-6 h-5 rounded nodrag cursor-pointer" />
          {/* Quick color swatches */}
          <div className="flex gap-0.5">
            {["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#ffffff", "#000000"].map((c) => (
              <button key={c} type="button"
                onClick={() => updateSettings({ brushColor: c })}
                className="w-4 h-4 rounded border nodrag"
                style={{ background: c, borderColor: isDark ? "#3f3f46" : "#d4d4d8" }} />
            ))}
          </div>
        </div>
        {/* Doodle area placeholder */}
        <div className="rounded border flex items-center justify-center" style={{
          height: 100,
          background: isDark ? "#18181b" : "#ffffff",
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        }}>
          <span className="text-[10px]" style={{ color: isDark ? "#52525b" : "#d4d4d8" }}>涂鸦区域</span>
        </div>
      </div>
    </BaseNode>
  );
});
