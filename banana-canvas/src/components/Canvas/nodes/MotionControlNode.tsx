import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { MotionControlSettings } from "../../../types/settings";

const REF_MODES: MotionControlSettings["referenceMode"][] = ["video", "skeleton", "trajectory"];
const REF_LABELS: Record<MotionControlSettings["referenceMode"], string> = {
  video: "视频参考", skeleton: "骨架迁移", trajectory: "轨迹迁移",
};

export const MotionControlNode = memo(function MotionControlNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<MotionControlSettings>(id);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const sliderChange = useCallback(
    (key: keyof MotionControlSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  return (
    <BaseNode id={id} type="motion-control" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模式</span>
          <select value={settings.referenceMode}
            onChange={(e) => updateSettings({ referenceMode: e.target.value as MotionControlSettings["referenceMode"] })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {REF_MODES.map((m) => <option key={m} value={m}>{REF_LABELS[m]}</option>)}
          </select>
        </div>
        <SliderRow label="强度" value={settings.strength} min={0} max={1} step={0.05}
          onChange={(v) => sliderChange("strength", v)} isDark={isDark} />
        <SliderRow label="平滑" value={settings.smoothness} min={0} max={1} step={0.05}
          onChange={(v) => sliderChange("smoothness", v)} isDark={isDark} />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>帧范围</span>
          <input type="text" value={settings.frameRange}
            onChange={(e) => updateSettings({ frameRange: e.target.value })}
            placeholder="1-24"
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle} />
        </div>
      </div>
    </BaseNode>
  );
});

function SliderRow({ label, value, min, max, step, onChange, isDark }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; isDark: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
      <span className="text-[10px] w-8 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{value}</span>
    </div>
  );
}
