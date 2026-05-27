import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { StoryboardSettings } from "../../../types/settings";

const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "9:16", "2.35:1"];

export const StoryboardNode = memo(function StoryboardNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<StoryboardSettings>(id);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const numChange = useCallback(
    (key: keyof StoryboardSettings, val: number) => updateSettings({ [key]: Math.max(1, val) }),
    [updateSettings],
  );

  // Generate grid cells as visual preview
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < Math.min(settings.shotCount, 12); r++) {
    const col = r % settings.columns;
    const row = Math.floor(r / settings.columns);
    cells.push({ row, col });
  }
  const totalRows = Math.ceil(settings.shotCount / settings.columns);

  return (
    <BaseNode id={id} type="storyboard-node" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <NumberField label="列数" value={settings.columns} min={1} max={6}
            onChange={(v) => numChange("columns", v)} isDark={isDark} inputStyle={inputStyle} />
          <NumberField label="镜头数" value={settings.shotCount} min={1} max={24}
            onChange={(v) => numChange("shotCount", v)} isDark={isDark} inputStyle={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>宽高比</span>
          <select value={settings.aspectRatio}
            onChange={(e) => updateSettings({ aspectRatio: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {/* Grid preview */}
        <div className="rounded border overflow-hidden" style={{
          background: isDark ? "#27272a" : "#f4f4f5",
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        }}>
          <div className="grid gap-px p-1" style={{
            gridTemplateColumns: `repeat(${settings.columns}, 1fr)`,
            gridTemplateRows: `repeat(${totalRows}, 1fr)`,
          }}>
            {cells.map((_, i) => (
              <div key={i} className="rounded flex items-center justify-center text-[9px]"
                style={{
                  aspectRatio: settings.aspectRatio.replace(":", "/"),
                  background: isDark ? "#3f3f46" : "#e4e4e7",
                  color: isDark ? "#a1a1aa" : "#71717a",
                }}>
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    </BaseNode>
  );
});

function NumberField({ label, value, min, max, onChange, isDark, inputStyle }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; isDark: boolean; inputStyle: React.CSSProperties;
}) {
  return (
    <div className="flex items-center gap-1 flex-1">
      <span className="text-[10px] shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>{label}</span>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-12 text-[11px] px-1.5 py-0.5 rounded border outline-none" style={inputStyle} />
    </div>
  );
}
