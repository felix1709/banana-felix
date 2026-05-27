import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { GlobalPerspectiveSettings } from "../../../types/settings";

export const GlobalPerspectiveNode = memo(function GlobalPerspectiveNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<GlobalPerspectiveSettings>(id);

  const sliderChange = useCallback(
    (key: keyof GlobalPerspectiveSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  return (
    <BaseNode id={id} type="global-perspective" selected={selected}>
      <div className="flex flex-col gap-2">
        <SliderRow label="水平角" value={settings.angle} min={-180} max={180} step={1} unit="°"
          onChange={(v) => sliderChange("angle", v)} isDark={isDark} />
        <SliderRow label="俯仰角" value={settings.elevation} min={-90} max={90} step={1} unit="°"
          onChange={(v) => sliderChange("elevation", v)} isDark={isDark} />
        <SliderRow label="距离" value={settings.distance} min={0.5} max={50} step={0.5} unit="m"
          onChange={(v) => sliderChange("distance", v)} isDark={isDark} />
        <SliderRow label="视场角" value={settings.fov} min={10} max={120} step={1} unit="°"
          onChange={(v) => sliderChange("fov", v)} isDark={isDark} />
      </div>
    </BaseNode>
  );
});

function SliderRow({ label, value, min, max, step, unit, onChange, isDark }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; isDark: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
      <span className="text-[10px] w-10 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
        {value}{unit}
      </span>
    </div>
  );
}
