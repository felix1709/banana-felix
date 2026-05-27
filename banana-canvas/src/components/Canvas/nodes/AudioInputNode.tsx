import { memo, useCallback, useRef } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import type { AudioInputSettings } from "../../../types/settings";

export const AudioInputNode = memo(function AudioInputNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const nodes = useGraphStore((s) => s.nodes);
  const { settings, updateSettings } = useNodeSettings<AudioInputSettings>(id);
  const { setNodes: setXyNodes } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const content = (data?.content as string) ?? "";
  const hasAudio = !!content;

  const syncContentToXy = useCallback((url: string) => {
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: url } } : n));
  }, [id, setXyNodes]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateSettings({ source: "upload", audioUrl: dataUrl, fileName: file.name });
      updateNode(id, { content: dataUrl });
      syncContentToXy(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [id, updateSettings, updateNode, syncContentToXy]);

  const handleUrlInput = useCallback(() => {
    const url = settings.audioUrl?.trim() || "";
    if (!url) return;
    const currentContent = useGraphStore.getState().nodes.find((n) => n.id === id)?.content ?? "";
    if (url === currentContent) return;
    const fileName = url.split("/").pop() || "";
    updateSettings({ source: "url", audioUrl: url, fileName });
    updateNode(id, { content: url });
    syncContentToXy(url);
  }, [id, settings.audioUrl, updateSettings, updateNode, syncContentToXy]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("audio/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateSettings({ source: "upload", audioUrl: dataUrl, fileName: file.name });
      updateNode(id, { content: dataUrl });
      syncContentToXy(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [id, updateSettings, updateNode, syncContentToXy]);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  return (
    <BaseNode id={id} type="audio-input" selected={selected}>
      {/* Reference label */}
      <div className="flex items-center gap-1 mb-1.5">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded"
          style={{
            background: isDark ? "#14532d" : "#dcfce7",
            color: isDark ? "#4ade80" : "#166534",
          }}
        >
          ♪ 音频
        </span>
        <span className="text-[9px] ml-auto" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          @{nodes.find((n) => n.id === id)?.nodeName || "音频1"} 引用
        </span>
      </div>

      {/* Audio preview / drop zone */}
      <div
        className="w-full rounded-lg overflow-hidden relative"
        style={{
          minHeight: 60,
          background: isDark ? "#09090b" : "#e4e4e7",
          border: `1px dashed ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {hasAudio ? (
          <div className="p-2">
            <audio src={content} className="w-full" controls style={{ height: 36 }} />
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-1 py-4 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <span style={{ fontSize: 20, color: isDark ? "#52525b" : "#a1a1aa" }}>♪</span>
            <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
              拖拽音频或点击上传
            </span>
            <span className="text-[9px]" style={{ color: isDark ? "#52525b" : "#d4d4d8" }}>
              MP3 / WAV / OGG
            </span>
          </div>
        )}
      </div>

      {/* Upload + URL row */}
      <div className="flex items-center gap-1 mt-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-[10px] px-2 py-1 rounded border"
          style={inputStyle}
        >
          上传
        </button>
        <input
          type="text"
          placeholder="粘贴音频URL..."
          title="音频URL"
          defaultValue={settings.source === "url" ? settings.audioUrl : ""}
          onBlur={handleUrlInput}
          className="flex-1 text-[10px] px-2 py-1 rounded border outline-none"
          style={inputStyle}
        />
      </div>

      {/* File name */}
      {settings.fileName && (
        <div className="text-[9px] mt-1 truncate" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          {settings.fileName}
        </div>
      )}

      <Handle type="source" position={Position.Right} id="default" style={{ width: 8, height: 8, background: isDark ? "#52525b" : "#a1a1aa", border: `2px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`, right: -4 }} />
    </BaseNode>
  );
});
