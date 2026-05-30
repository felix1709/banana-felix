import { memo, useCallback, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import { useJobStore } from "../../../stores/jobStore";
import { useGenerationPoll } from "../../../hooks/useGenerationPoll";
import type { VideoInputSettings } from "../../../types/settings";

export const VideoInputNode = memo(function VideoInputNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const nodes = useGraphStore((s) => s.nodes);
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === id));
  const { settings } = useNodeSettings<VideoInputSettings>(id);
  const latestJob = useJobStore((s) => s.getLatestJobByNodeId(id));
  const [saving, setSaving] = useState(false);

  useGenerationPoll(id);

  const content = node?.content ?? "";
  const hasVideo = !!content;
  const isGenerating = !hasVideo && (latestJob?.status === "pending" || latestJob?.status === "running");
  const generationFailed = !hasVideo && latestJob?.status === "failed";

  const handleSaveLocally = useCallback(async () => {
    if (!content) return;
    setSaving(true);
    const safeName = (settings.fileName && settings.fileName !== "生成中...")
      ? settings.fileName.replace(/\.[^.]+$/, "")
      : "video";

    try {
      const isTauriApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauriApp) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { invoke } = await import("@tauri-apps/api/core");
        const filePath = await save({
          defaultPath: `${safeName}.mp4`,
          filters: [{ name: "Videos", extensions: ["mp4", "webm"] }],
        });
        if (filePath) {
          await invoke("download_file_bypass_cors", { url: content, destPath: filePath });
          useUIStore.getState().addToast("success", "视频已保存");
        }
        setSaving(false);
        return;
      }

      const response = await fetch(content);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${safeName}.${blob.type.includes("webm") ? "webm" : "mp4"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      try { window.open(content, "_blank"); } catch { /* no-op */ }
    } finally {
      setSaving(false);
    }
  }, [content, settings.fileName]);

  return (
    <BaseNode id={id} type="video-input" selected={selected}>
      {/* Reference label */}
      <div className="flex items-center gap-1 mb-1.5">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded"
          style={{
            background: isDark ? "#7c2d12" : "#ffedd5",
            color: isDark ? "#fb923c" : "#9a3412",
          }}
        >
          ▶ 视频
        </span>
        <span className="text-[9px] ml-auto" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          @{nodes.find((n) => n.id === id)?.nodeName || "视频1"} 引用
        </span>
      </div>

      {/* Video preview / generation status */}
      <div
        className="w-full rounded-lg overflow-hidden relative"
        style={{
          minHeight: 200,
          background: isDark ? "#09090b" : "#e4e4e7",
          border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        }}
      >
        {hasVideo ? (
          <>
            <video
              src={content}
              className="w-full object-contain"
              style={{ maxHeight: 240 }}
              controls
              muted
            />
            <button
              type="button"
              className="nodrag"
              onClick={(e) => { e.stopPropagation(); handleSaveLocally(); }}
              disabled={saving}
              title="保存原视频到本地"
              style={{
                position: "absolute", top: 4, right: 4,
                width: 14, height: 14, borderRadius: 3,
                border: "none",
                background: "rgba(0,0,0,0.35)",
                color: "#22c55e",
                fontSize: 0, lineHeight: 1,
                cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0,
                transition: "all 0.15s",
                filter: "drop-shadow(0 0 2px rgba(34,197,94,0.4))",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.6)"; e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.filter = "drop-shadow(0 0 4px rgba(34,197,94,0.7))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.35)"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.filter = "drop-shadow(0 0 2px rgba(34,197,94,0.4))"; }}
            >
              {saving ? (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v12M5 12l7 7 7-7" />
                </svg>
              )}
            </button>
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 py-8"
            style={{ minHeight: 200 }}
          >
            {isGenerating && (
              <div style={{ width: 30, height: 30, border: "3px solid #f97316", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            )}
            <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
              {generationFailed ? "生成失败" : isGenerating ? "正在生成..." : "等待生成结果"}
            </span>
            <span className="text-[9px]" style={{ color: isDark ? "#52525b" : "#d4d4d8" }}>
              {generationFailed ? (latestJob.error || "请重新生成") : latestJob?.progress ? `${latestJob.progress}%` : "视频会自动显示在这里"}
            </span>
          </div>
        )}
      </div>

      {/* File name */}
      {settings.fileName && settings.fileName !== "生成中..." && (
        <div className="text-[9px] mt-1 truncate" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          {settings.fileName}
        </div>
      )}
    </BaseNode>
  );
});
