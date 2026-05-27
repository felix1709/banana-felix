import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { StoryboardChartSettings } from "../../../types/settings";

const GROUP_OPTIONS: StoryboardChartSettings["groupBy"][] = ["scene", "shot", "time"];
const GROUP_LABELS: Record<StoryboardChartSettings["groupBy"], string> = {
  scene: "按场景", shot: "按镜头", time: "按时间",
};

export const StoryboardChartNode = memo(function StoryboardChartNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<StoryboardChartSettings>(id);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const sliderChange = useCallback(
    (val: number) => updateSettings({ timelineScale: val }),
    [updateSettings],
  );

  return (
    <BaseNode id={id} type="storyboard-chart-node" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>时间缩放</span>
          <input type="range" min={0.25} max={4} step={0.25} value={settings.timelineScale}
            onChange={(e) => sliderChange(Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
          <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
            {settings.timelineScale}x
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>分组</span>
          <select value={settings.groupBy}
            onChange={(e) => updateSettings({ groupBy: e.target.value as StoryboardChartSettings["groupBy"] })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {GROUP_OPTIONS.map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={settings.showLabels}
              onChange={(e) => updateSettings({ showLabels: e.target.checked })}
              className="nodrag" />
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>显示标签</span>
          </label>
        </div>
        {/* Timeline preview */}
        <div className="rounded border p-2" style={{
          background: isDark ? "#27272a" : "#f4f4f5",
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        }}>
          <div className="flex gap-0.5 items-end" style={{ height: 40 }}>
            {[0.6, 1, 0.8, 0.4, 0.9, 0.7, 1, 0.5].map((h, i) => (
              <div key={i} className="flex-1 rounded-t"
                style={{ height: `${h * 100}%`, background: "#3b82f6", opacity: 0.6 }} />
            ))}
          </div>
          {settings.showLabels && (
            <div className="flex gap-0.5 mt-0.5">
              {["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"].map((l, i) => (
                <span key={i} className="flex-1 text-center text-[8px]"
                  style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>{l}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
});
