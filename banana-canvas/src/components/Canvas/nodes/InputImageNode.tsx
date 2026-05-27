import { memo, useCallback, useRef, useState, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import { useMaterialIndex } from "../../../hooks/useMaterialIndex";
import type { InputImageSettings } from "../../../types/settings";

export const InputImageNode = memo(function InputImageNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<InputImageSettings>(id);
  const updateNode = useGraphStore((s) => s.updateNode);
  const nodes = useGraphStore((s) => s.nodes);
  const { setNodes: setXyNodes } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Material index
  const materialEntries = useMaterialIndex();
  const myEntry = materialEntries.find((m) => m.nodeId === id);
  const materialIndex = myEntry?.index ?? 0;

  const imageUrl = settings.imageUrl ?? "";
  const fileName = settings.fileName ?? "";

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const syncContentToXy = useCallback((url: string) => {
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: url } } : n));
  }, [id, setXyNodes]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        updateSettings({ source: "upload", imageUrl: dataUrl, fileName: file.name });
        updateNode(id, { content: dataUrl });
        syncContentToXy(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [id, updateSettings, updateNode, syncContentToXy],
  );

  const handleUrlInput = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const url = e.target.value.trim();
      if (url && url !== imageUrl) {
        updateSettings({ source: "url", imageUrl: url, fileName: url.split("/").pop() ?? "" });
        updateNode(id, { content: url });
        syncContentToXy(url);
      }
    },
    [id, imageUrl, updateSettings, updateNode, syncContentToXy],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        updateSettings({ source: "upload", imageUrl: dataUrl, fileName: file.name });
        updateNode(id, { content: dataUrl });
        syncContentToXy(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [id, updateSettings, updateNode, syncContentToXy],
  );

  // Move material order up/down
  const handleMoveUp = useCallback(() => {
    if (!myEntry || materialIndex <= 1) return;
    const prevEntry = materialEntries.find((m) => m.index === materialIndex - 1);
    if (!prevEntry) return;
    const myOrder = settings.materialOrder ?? 0;
    const prevOrder = prevEntry.order;
    updateSettings({ materialOrder: prevOrder });
    const prevNode = nodes.find((n) => n.id === prevEntry.nodeId);
    if (prevNode) {
      const prevSettings = { ...(prevNode.settings as Record<string, unknown>) };
      prevSettings.materialOrder = myOrder;
      useGraphStore.getState().updateNode(prevEntry.nodeId, { settings: prevSettings });
    }
  }, [myEntry, materialIndex, materialEntries, settings.materialOrder, updateSettings, nodes]);

  const handleMoveDown = useCallback(() => {
    if (!myEntry || materialIndex >= materialEntries.length) return;
    const nextEntry = materialEntries.find((m) => m.index === materialIndex + 1);
    if (!nextEntry) return;
    const myOrder = settings.materialOrder ?? 0;
    const nextOrder = nextEntry.order;
    updateSettings({ materialOrder: nextOrder });
    const nextNode = nodes.find((n) => n.id === nextEntry.nodeId);
    if (nextNode) {
      const nextSettings = { ...(nextNode.settings as Record<string, unknown>) };
      nextSettings.materialOrder = myOrder;
      useGraphStore.getState().updateNode(nextEntry.nodeId, { settings: nextSettings });
    }
  }, [myEntry, materialIndex, materialEntries, settings.materialOrder, updateSettings, nodes]);

  // ── Double-click: native listener to intercept before ReactFlow pane handler ──
  useEffect(() => {
    const el = imgContainerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (imageUrl) setPreviewOpen(true);
    };
    el.addEventListener("dblclick", handler);
    return () => el.removeEventListener("dblclick", handler);
  }, [imageUrl]);

  // Close preview on Escape
  useEffect(() => {
    if (!previewOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewOpen]);

  // ── Save image locally (always triggers file download) ──
  const handleSaveLocally = useCallback(() => {
    if (!imageUrl) return;
    setSaving(true);

    const safeName = (fileName && fileName !== "upload") ? fileName.replace(/\.[^.]+$/, "") : "image";

    // Helper: trigger browser file download from a blob
    const downloadBlob = (blob: Blob, ext: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setSaving(false);
    };

    // Data URL: decode to blob directly
    if (imageUrl.startsWith("data:")) {
      try {
        const commaIdx = imageUrl.indexOf(",");
        const meta = imageUrl.slice(0, commaIdx);
        const base64 = imageUrl.slice(commaIdx + 1);
        const mimeMatch = meta.match(/data:(image\/\w+)/);
        const mime = mimeMatch?.[1] ?? "image/png";
        const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
        const raw = atob(base64);
        const buf = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
        downloadBlob(new Blob([buf], { type: mime }), ext);
      } catch {
        // Fallback: direct href download
        const a = document.createElement("a");
        a.href = imageUrl;
        a.download = `${safeName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setSaving(false);
      }
      return;
    }

    // Remote URL: load into canvas → blob → download (avoids opening new tab)
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (!ctx) throw new Error("no ctx");
        ctx.drawImage(img, 0, 0);
        c.toBlob((blob) => {
          if (blob) {
            downloadBlob(blob, "png");
          } else {
            window.open(imageUrl, "_blank");
            setSaving(false);
          }
        }, "image/png");
      } catch {
        // Canvas tainted by CORS — fallback to new tab
        window.open(imageUrl, "_blank");
        setSaving(false);
      }
    };
    img.onerror = () => {
      window.open(imageUrl, "_blank");
      setSaving(false);
    };
    img.src = imageUrl;
  }, [imageUrl, fileName]);

  return (
    <BaseNode id={id} type="input-image" selected={selected}>
      {/* Material index badge + move buttons */}
      <div className="flex items-center gap-1 mb-1.5">
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded"
          style={{
            background: isDark ? "#854d0e" : "#fef08a",
            color: isDark ? "#fef08a" : "#854d0e",
          }}
        >
          #{materialIndex}
        </span>
        {materialEntries.length > 1 && (
          <div className="flex gap-0.5 ml-1">
            <button
              type="button"
              onClick={handleMoveUp}
              disabled={materialIndex <= 1}
              className="text-[9px] px-1 py-0.5 rounded nodrag"
              style={{
                background: isDark ? "#27272a" : "#f4f4f5",
                color: materialIndex <= 1 ? (isDark ? "#3f3f46" : "#d4d4d8") : (isDark ? "#e4e4e7" : "#18181b"),
                border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
              }}
              title="上移"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={handleMoveDown}
              disabled={materialIndex >= materialEntries.length}
              className="text-[9px] px-1 py-0.5 rounded nodrag"
              style={{
                background: isDark ? "#27272a" : "#f4f4f5",
                color: materialIndex >= materialEntries.length ? (isDark ? "#3f3f46" : "#d4d4d8") : (isDark ? "#e4e4e7" : "#18181b"),
                border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
              }}
              title="下移"
            >
              ▼
            </button>
          </div>
        )}
        <span className="text-[9px] ml-auto" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          @{nodes.find((n) => n.id === id)?.nodeName || `图片${materialIndex}`} 引用
        </span>
      </div>

      {/* Image area — ref for native dblclick */}
      <div
        ref={imgContainerRef}
        className="relative w-full flex items-center justify-center rounded overflow-hidden nodrag"
        style={{ minHeight: 120, maxHeight: 180, background: isDark ? "#0f0f0f" : "#fafafa", cursor: imageUrl ? "zoom-in" : "default" }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={fileName}
            className="rounded"
            style={{ maxWidth: "100%", maxHeight: 170, objectFit: "contain", pointerEvents: "none" }}
            loading="lazy"
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center w-full rounded border-2 border-dashed"
            style={{
              height: 120,
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              color: isDark ? "#71717a" : "#a1a1aa",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-xs mt-2">拖拽图片或点击上传</span>
          </div>
        )}
      </div>

      <div className="flex gap-1.5 mt-2">
        <button
          type="button"
          onClick={handleUploadClick}
          className="flex-1 text-[11px] px-2 py-1 rounded border nodrag"
          style={{
            background: isDark ? "#27272a" : "#f4f4f5",
            borderColor: isDark ? "#3f3f46" : "#d4d4d8",
            color: isDark ? "#e4e4e7" : "#3f3f46",
          }}
        >
          上传
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={handleSaveLocally}
            disabled={saving}
            className="text-[11px] px-2 py-1 rounded border nodrag"
            style={{
              background: isDark ? "#27272a" : "#f4f4f5",
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              color: saving ? (isDark ? "#52525b" : "#a1a1aa") : "#22c55e",
            }}
            title="保存原图到本地"
          >
            {saving ? "..." : "保存"}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          type="text"
          placeholder="粘贴URL..."
          title="图片URL"
          defaultValue={settings.source === "url" ? imageUrl : ""}
          onBlur={handleUrlInput}
          className="flex-1 text-[11px] px-2 py-1 rounded border outline-none nodrag"
          style={{
            background: isDark ? "#27272a" : "#f4f4f5",
            borderColor: isDark ? "#3f3f46" : "#d4d4d8",
            color: isDark ? "#e4e4e7" : "#3f3f46",
          }}
        />
      </div>

      {fileName && (
        <div
          className="text-[10px] mt-1 truncate"
          style={{ color: isDark ? "#71717a" : "#a1a1aa" }}
        >
          {fileName}
        </div>
      )}

      {/* Fullscreen image preview overlay — rendered directly, NOT portal */}
      {previewOpen && imageUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 99999, background: "rgba(0,0,0,0.85)", cursor: "zoom-out" }}
          onClick={() => setPreviewOpen(false)}
        >
          <img
            src={imageUrl}
            alt={fileName}
            style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain", borderRadius: 4, pointerEvents: "none" }}
          />
          <button
            type="button"
            onClick={() => setPreviewOpen(false)}
            className="absolute top-4 right-4 text-white text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.15)", zIndex: 100000 }}
            title="关闭 (Esc)"
          >
            &times;
          </button>
        </div>
      )}
    </BaseNode>
  );
});
