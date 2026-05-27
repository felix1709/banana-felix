import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { CameraMovementSettings } from "../../../types/settings";

const MOVEMENT_TYPES: CameraMovementSettings["movementType"][] = ["pan", "tilt", "zoom", "dolly", "crane", "tracking"];
const MOVEMENT_LABELS: Record<CameraMovementSettings["movementType"], string> = {
  pan: "平移", tilt: "俯仰", zoom: "变焦", dolly: "推拉", crane: "摇臂", tracking: "跟踪",
};
const DIRECTIONS = ["left", "right", "up", "down", "in", "out"];
const DIR_LABELS: Record<string, string> = { left: "左", right: "右", up: "上", down: "下", in: "推进", out: "拉远" };

export const CameraMovementNode = memo(function CameraMovementNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<CameraMovementSettings>(id);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const sliderChange = useCallback(
    (key: keyof CameraMovementSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  return (
    <BaseNode id={id} type="camera-movement" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>运动</span>
          <select value={settings.movementType}
            onChange={(e) => updateSettings({ movementType: e.target.value as CameraMovementSettings["movementType"] })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>方向</span>
          <select value={settings.direction}
            onChange={(e) => updateSettings({ direction: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {DIRECTIONS.map((d) => <option key={d} value={d}>{DIR_LABELS[d]}</option>)}
          </select>
        </div>
        <SliderRow label="速度" value={settings.speed} min={0.1} max={5} step={0.1}
          onChange={(v) => sliderChange("speed", v)} isDark={isDark} />
        <SliderRow label="强度" value={settings.intensity} min={0} max={1} step={0.05}
          onChange={(v) => sliderChange("intensity", v)} isDark={isDark} />
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
      <span className="text-[10px] w-8 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
        {value}
      </span>
    </div>
  );
}
