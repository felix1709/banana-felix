import { memo, useCallback, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import type { TableEditorSettings } from "../../../types/settings";

export const TableEditorNode = memo(function TableEditorNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<TableEditorSettings>(id);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const headers = settings.headers.split(",").map((h) => h.trim());
  const [cellData, setCellData] = useState<Record<string, string>>({});

  const cellKey = (r: number, c: number) => `${r}-${c}`;

  const updateCell = useCallback((r: number, c: number, val: string) => {
    setCellData((prev) => ({ ...prev, [cellKey(r, c)]: val }));
  }, []);

  return (
    <BaseNode id={id} type="table-editor-node" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>行</span>
            <input type="number" value={settings.rows} min={1} max={20}
              onChange={(e) => updateSettings({ rows: Math.max(1, Number(e.target.value)) })}
              className="w-10 text-[11px] px-1 py-0.5 rounded border outline-none" style={inputStyle} />
          </div>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-[10px]" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>列</span>
            <input type="number" value={settings.columns} min={1} max={10}
              onChange={(e) => updateSettings({ columns: Math.max(1, Number(e.target.value)) })}
              className="w-10 text-[11px] px-1 py-0.5 rounded border outline-none" style={inputStyle} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-12 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>表头</span>
          <input type="text" value={settings.headers}
            onChange={(e) => updateSettings({ headers: e.target.value })}
            placeholder="场景,描述,时长"
            className="flex-1 text-[11px] px-1.5 py-0.5 rounded border outline-none" style={inputStyle} />
        </div>
        {/* Table grid */}
        <div className="overflow-auto rounded border" style={{
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
          maxHeight: 180,
        }}>
          <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {headers.slice(0, settings.columns).map((h, i) => (
                  <th key={i} className="px-1 py-0.5 text-left border-b font-medium"
                    style={{
                      background: isDark ? "#27272a" : "#f4f4f5",
                      borderColor: isDark ? "#3f3f46" : "#d4d4d8",
                      color: isDark ? "#a1a1aa" : "#71717a",
                    }}>
                    {h || `列${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: settings.rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: settings.columns }, (_, c) => (
                    <td key={c} className="px-0.5 py-0 border-b"
                      style={{ borderColor: isDark ? "#3f3f46" : "#e4e4e7" }}>
                      <input type="text" value={cellData[cellKey(r, c)] ?? ""}
                        onChange={(e) => updateCell(r, c, e.target.value)}
                        className="w-full text-[10px] px-1 py-0.5 bg-transparent outline-none nodrag"
                        style={{ color: isDark ? "#e4e4e7" : "#18181b" }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BaseNode>
  );
});
