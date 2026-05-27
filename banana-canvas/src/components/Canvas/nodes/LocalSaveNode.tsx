import { memo, useCallback, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUpstreamNodes } from "../../../hooks/useUpstreamNodes";
import { useUIStore } from "../../../stores/uiStore";
import type { LocalSaveSettings } from "../../../types/settings";

export const LocalSaveNode = memo(function LocalSaveNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<LocalSaveSettings>(id);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const upstream = useUpstreamNodes(id);
  const upstreamContent = upstream.length > 0 ? upstream[upstream.length - 1].content : "";

  const isVideo = /\.(mp4|webm)/.test(upstreamContent);

  const handleBrowse = useCallback(async () => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const ext = settings.format === "mp4" || settings.format === "webm" ? settings.format : settings.format;
      const result = await save({
        defaultPath: settings.fileName || `output.${ext}`,
        filters: [
          {
            name: isVideo ? "视频" : "图片",
            extensions: isVideo ? ["mp4", "webm"] : ["png", "jpg", "webp"],
          },
        ],
      });
      if (result) {
        const dir = result.replace(/[/\\][^/\\]+$/, "");
        const name = result.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
        updateSettings({ directory: dir, fileName: name });
      }
    } catch {
      // Dialog cancelled or not available in browser
    }
  }, [settings.format, settings.fileName, isVideo, updateSettings]);

  const handleSave = useCallback(async () => {
    if (!upstreamContent) return;

    setSaveStatus("saving");
    setSaveError("");

    try {
      let blob: Blob;

      if (upstreamContent.startsWith("data:")) {
        // Data URL → Blob
        const response = await fetch(upstreamContent);
        blob = await response.blob();
      } else {
        // Remote URL → fetch → Blob
        const isTauri = "__TAURI_INTERNALS__" in window;
        if (isTauri) {
          const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
          const response = await tauriFetch(upstreamContent);
          blob = await response.blob();
        } else {
          const response = await fetch(upstreamContent);
          blob = await response.blob();
        }
      }

      // Try Tauri FS
      const isTauri = "__TAURI_INTERNALS__" in window;
      if (isTauri && settings.directory) {
        const { writeFile } = await import("@tauri-apps/plugin-fs");
        const buffer = await blob.arrayBuffer();
        const ext = settings.format === "jpg" ? "jpg" : settings.format;
        const fullPath = `${settings.directory}/${settings.fileName || "output"}.${ext}`;
        await writeFile(fullPath, new Uint8Array(buffer));
        setSaveStatus("saved");
        return;
      }

      // Fallback: browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${settings.fileName || "output"}.${settings.format}`;
      a.click();
      URL.revokeObjectURL(url);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "保存失败");
    }
  }, [upstreamContent, settings, isVideo]);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  return (
    <BaseNode id={id} type="local-save" selected={selected}>
      {/* Thumbnail preview */}
      <div
        className="w-full rounded flex items-center justify-center overflow-hidden"
        style={{
          height: 120,
          background: isDark ? "#27272a" : "#f4f4f5",
          border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        }}
      >
        {upstreamContent ? (
          isVideo ? (
            <video src={upstreamContent} className="w-full h-full object-contain" muted />
          ) : (
            <img src={upstreamContent} alt="预览" className="w-full h-full object-contain" loading="lazy" />
          )
        ) : (
          <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
            连接节点以保存
          </span>
        )}
      </div>

      {/* Format & quality */}
      <div className="flex gap-1 mt-2">
        <select
          value={settings.format}
          onChange={(e) => updateSettings({ format: e.target.value as LocalSaveSettings["format"] })}
          className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none"
          style={inputStyle}
        >
          {!isVideo && <option value="png">PNG</option>}
          {!isVideo && <option value="jpg">JPG</option>}
          {!isVideo && <option value="webp">WebP</option>}
          {isVideo && <option value="mp4">MP4</option>}
          {isVideo && <option value="webm">WebM</option>}
        </select>
        {!isVideo && (
          <div className="flex items-center gap-0.5">
            <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>质量</span>
            <input
              type="number"
              value={settings.quality}
              onChange={(e) => updateSettings({ quality: Number(e.target.value) })}
              className="w-10 text-[10px] px-1 py-0.5 rounded border outline-none"
              style={inputStyle}
              min={1}
              max={100}
            />
          </div>
        )}
      </div>

      {/* Filename */}
      <input
        type="text"
        value={settings.fileName}
        onChange={(e) => updateSettings({ fileName: e.target.value })}
        placeholder="文件名"
        className="w-full text-[11px] px-2 py-1 rounded border outline-none mt-1"
        style={inputStyle}
      />

      {/* Browse + Save */}
      <div className="flex gap-1 mt-2">
        <button
          type="button"
          onClick={handleBrowse}
          className="flex-1 text-[11px] px-2 py-1 rounded border"
          style={inputStyle}
        >
          浏览
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!upstreamContent || saveStatus === "saving"}
          className="flex-1 text-[11px] px-2 py-1 rounded font-medium"
          style={{
            background: !upstreamContent || saveStatus === "saving"
              ? (isDark ? "#3f3f46" : "#d4d4d8")
              : "#22c55e",
            color: !upstreamContent || saveStatus === "saving"
              ? (isDark ? "#71717a" : "#a1a1aa")
              : "#fff",
          }}
        >
          {saveStatus === "saving" ? "保存中..." : saveStatus === "saved" ? "已保存" : "保存"}
        </button>
      </div>

      {saveStatus === "error" && (
        <div className="text-[10px] text-red-400 mt-1">{saveError}</div>
      )}
    </BaseNode>
  );
});
