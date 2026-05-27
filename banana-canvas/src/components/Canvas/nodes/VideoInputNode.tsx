import { memo, useCallback, useRef } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import type { VideoInputSettings } from "../../../types/settings";

export const VideoInputNode = memo(function VideoInputNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const nodes = useGraphStore((s) => s.nodes);
  const { settings, updateSettings } = useNodeSettings<VideoInputSettings>(id);
  const { setNodes: setXyNodes } = useReactFlow();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const content = (data?.content as string) ?? "";
  const hasVideo = !!content;

  const syncContentToXy = useCallback((url: string) => {
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: url } } : n));
  }, [id, setXyNodes]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateSettings({ source: "upload", videoUrl: dataUrl, fileName: file.name });
      updateNode(id, { content: dataUrl });
      syncContentToXy(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [id, updateSettings, updateNode, syncContentToXy]);

  const handleUrlInput = useCallback(() => {
    const url = settings.videoUrl?.trim() || "";
    if (!url) return;
    const currentContent = useGraphStore.getState().nodes.find((n) => n.id === id)?.content ?? "";
    if (url === currentContent) return;
    const fileName = url.split("/").pop() || "";
    updateSettings({ source: "url", videoUrl: url, fileName });
    updateNode(id, { content: url });
    syncContentToXy(url);
  }, [id, settings.videoUrl, updateSettings, updateNode, syncContentToXy]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("video/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateSettings({ source: "upload", videoUrl: dataUrl, fileName: file.name });
      updateNode(id, { content: dataUrl });
      syncContentToXy(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [id, updateSettings, updateNode, syncContentToXy]);

  const s = (base: Record<string, string>) => ({
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
    ...base,
  });

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

      {/* Video preview / drop zone */}
      <div
        className="w-full rounded-lg overflow-hidden relative"
        style={{
          minHeight: 200,
          background: isDark ? "#09090b" : "#e4e4e7",
          border: `1px dashed ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {hasVideo ? (
          <video
            src={content}
            className="w-full object-contain"
            style={{ maxHeight: 240 }}
            controls
            muted
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 py-8 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <span style={{ fontSize: 28, color: isDark ? "#52525b" : "#a1a1aa" }}>🎬</span>
            <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
              拖拽视频或点击上传
            </span>
            <span className="text-[9px]" style={{ color: isDark ? "#52525b" : "#d4d4d8" }}>
              MP4 / WebM
            </span>
          </div>
        )}
      </div>

      {/* Upload + URL row */}
      <div className="flex items-center gap-1 mt-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-[10px] px-2 py-1 rounded border"
          style={s({})}
        >
          上传
        </button>
        <input
          type="text"
          placeholder="粘贴视频URL..."
          defaultValue={settings.source === "url" ? settings.videoUrl : ""}
          onBlur={handleUrlInput}
          className="flex-1 text-[10px] px-2 py-1 rounded border outline-none"
          style={s({})}
        />
      </div>

      {/* File name */}
      {settings.fileName && (
        <div className="text-[9px] mt-1 truncate" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          {settings.fileName}
        </div>
      )}
    </BaseNode>
  );
});
