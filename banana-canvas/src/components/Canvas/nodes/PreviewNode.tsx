import { memo, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUpstreamNodes } from "../../../hooks/useUpstreamNodes";
import { useUIStore } from "../../../stores/uiStore";
import type { PreviewSettings } from "../../../types/settings";

export const PreviewNode = memo(function PreviewNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<PreviewSettings>(id);

  const upstream = useUpstreamNodes(id);
  const upstreamContent = upstream.length > 0 ? upstream[upstream.length - 1].content : "";

  const isVideo = /\.(mp4|webm)/.test(upstreamContent);
  const zoom = settings.zoom ?? 1;

  const handleZoomIn = useCallback(() => {
    updateSettings({ zoom: Math.min(zoom + 0.25, 3) });
  }, [zoom, updateSettings]);

  const handleZoomOut = useCallback(() => {
    updateSettings({ zoom: Math.max(zoom - 0.25, 0.25) });
  }, [zoom, updateSettings]);

  const handleResetZoom = useCallback(() => {
    updateSettings({ zoom: 1 });
  }, [updateSettings]);

  return (
    <BaseNode id={id} type="preview" selected={selected}>
      <div
        className="w-full rounded overflow-hidden flex items-center justify-center"
        style={{
          height: 220,
          background: isDark ? "#27272a" : "#f4f4f5",
          border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        }}
      >
        {upstreamContent ? (
          isVideo ? (
            <video
              src={upstreamContent}
              className="w-full h-full object-contain"
              style={{ transform: `scale(${zoom})` }}
              controls
              autoPlay={settings.autoPlay}
              muted
            />
          ) : (
            <img
              src={upstreamContent}
              alt="预览"
              className="w-full h-full object-contain"
              style={{ transform: `scale(${zoom})` }}
              loading="lazy"
            />
          )
        ) : (
          <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
            连接节点以预览
          </span>
        )}
      </div>

      {/* Zoom toolbar */}
      <div className="flex items-center justify-center gap-1 mt-2">
        <button
          type="button"
          onClick={handleZoomOut}
          className="text-[11px] px-2 py-0.5 rounded border"
          style={{
            background: isDark ? "#27272a" : "#f4f4f5",
            borderColor: isDark ? "#3f3f46" : "#d4d4d8",
            color: isDark ? "#e4e4e7" : "#3f3f46",
          }}
        >
          -
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          className="text-[10px] px-2 py-0.5 rounded border"
          style={{
            background: isDark ? "#27272a" : "#f4f4f5",
            borderColor: isDark ? "#3f3f46" : "#d4d4d8",
            color: isDark ? "#e4e4e7" : "#3f3f46",
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          className="text-[11px] px-2 py-0.5 rounded border"
          style={{
            background: isDark ? "#27272a" : "#f4f4f5",
            borderColor: isDark ? "#3f3f46" : "#d4d4d8",
            color: isDark ? "#e4e4e7" : "#3f3f46",
          }}
        >
          +
        </button>
      </div>
    </BaseNode>
  );
});
