import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { ProfessionalCameraSettings } from "../../../types/settings";

const LENS_TYPES: ProfessionalCameraSettings["lensType"][] = ["wide", "normal", "telephoto", "macro", "fisheye"];
const LENS_LABELS: Record<ProfessionalCameraSettings["lensType"], string> = {
  wide: "广角", normal: "标准", telephoto: "长焦", macro: "微距", fisheye: "鱼眼",
};
const APERTURES = ["f/1.4", "f/1.8", "f/2.0", "f/2.8", "f/4.0", "f/5.6", "f/8.0", "f/11", "f/16"];
const SHUTTERS = ["1/8000", "1/4000", "1/2000", "1/1000", "1/500", "1/250", "1/125", "1/60", "1/30", "1/15", "1/8", "1/4", "1/2", "1s", "2s"];
const WB_OPTIONS = ["auto", "daylight", "cloudy", "tungsten", "fluorescent", "shade"];
const WB_LABELS: Record<string, string> = { auto: "自动", daylight: "日光", cloudy: "阴天", tungsten: "钨丝灯", fluorescent: "荧光灯", shade: "阴影" };

export const ProfessionalCameraNode = memo(function ProfessionalCameraNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<ProfessionalCameraSettings>(id);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const sliderChange = useCallback(
    (val: number) => updateSettings({ iso: val }),
    [updateSettings],
  );

  return (
    <BaseNode id={id} type="professional-camera" selected={selected}>
      <div className="flex flex-col gap-2">
        <SelectRow label="镜头" value={settings.lensType}
          options={LENS_TYPES.map((t) => ({ value: t, label: LENS_LABELS[t] }))}
          onChange={(v) => updateSettings({ lensType: v as ProfessionalCameraSettings["lensType"] })} isDark={isDark} inputStyle={inputStyle} />
        <SelectRow label="光圈" value={settings.aperture}
          options={APERTURES.map((a) => ({ value: a, label: a }))}
          onChange={(v) => updateSettings({ aperture: v })} isDark={isDark} inputStyle={inputStyle} />
        <SelectRow label="快门" value={settings.shutterSpeed}
          options={SHUTTERS.map((s) => ({ value: s, label: s }))}
          onChange={(v) => updateSettings({ shutterSpeed: v })} isDark={isDark} inputStyle={inputStyle} />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>ISO</span>
          <input type="range" min={100} max={12800} step={100} value={settings.iso}
            onChange={(e) => sliderChange(Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
          <span className="text-[10px] w-10 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.iso}</span>
        </div>
        <SelectRow label="白平衡" value={settings.whiteBalance}
          options={WB_OPTIONS.map((w) => ({ value: w, label: WB_LABELS[w] }))}
          onChange={(v) => updateSettings({ whiteBalance: v })} isDark={isDark} inputStyle={inputStyle} />
      </div>
    </BaseNode>
  );
});

function SelectRow({ label, value, options, onChange, isDark, inputStyle }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; isDark: boolean; inputStyle: React.CSSProperties;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
