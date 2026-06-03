import { memo, useCallback, useRef, useState, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import { useMaterialIndex } from "../../../hooks/useMaterialIndex";
import { reverseImagePrompt } from "../../../services/apiService";
import { toXyEdge, toXyNode } from "../../../utils/nodeConvert";
import { getDefaultSettings, NODE_DEFAULT_SIZES, type CanvasEdge, type CanvasNode } from "../../../types/node";
import type { InputImageSettings } from "../../../types/settings";
import { getMaterialFileName, getNextMaterialName, getNextMaterialOrder } from "../../../utils/materialNaming";
import { appendUniqueXyEdge } from "../../../utils/edgeDedup";

export const InputImageNode = memo(function InputImageNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<InputImageSettings>(id);
  const updateNode = useGraphStore((s) => s.updateNode);
  const nodes = useGraphStore((s) => s.nodes);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reversing, setReversing] = useState(false);

  // Material index
  const materialEntries = useMaterialIndex();
  const myEntry = materialEntries.find((m) => m.nodeId === id);
  const materialIndex = myEntry?.index ?? 0;

  const imageUrl = settings.imageUrl ?? "";
  const fileName = settings.fileName ?? "";
  const resolveImageMaterialMeta = useCallback(() => {
    const currentNode = useGraphStore.getState().nodes.find((node) => node.id === id);
    const currentName = currentNode?.nodeName ?? "";
    const nodeName = /^图片\d+$/.test(currentName)
      ? currentName
      : getNextMaterialName(useGraphStore.getState().nodes, "input-image");
    const materialOrder = (currentNode?.settings as Record<string, unknown> | undefined)?.materialOrder as number | undefined;
    return {
      nodeName,
      fileName: getMaterialFileName(nodeName, "input-image"),
      materialOrder: materialOrder && materialOrder > 0
        ? materialOrder
        : getNextMaterialOrder(useGraphStore.getState().nodes, "input-image"),
    };
  }, [id]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const meta = resolveImageMaterialMeta();
        updateSettings({ source: "upload", imageUrl: dataUrl, fileName: meta.fileName, materialOrder: meta.materialOrder });
        updateNode(id, { content: dataUrl, nodeName: meta.nodeName });
        setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: dataUrl, label: meta.nodeName } } : n));
      };
      reader.readAsDataURL(file);
    },
    [id, updateSettings, updateNode, resolveImageMaterialMeta, setXyNodes],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const meta = resolveImageMaterialMeta();
        updateSettings({ source: "upload", imageUrl: dataUrl, fileName: meta.fileName, materialOrder: meta.materialOrder });
        updateNode(id, { content: dataUrl, nodeName: meta.nodeName });
        setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: dataUrl, label: meta.nodeName } } : n));
      };
      reader.readAsDataURL(file);
    },
    [id, updateSettings, updateNode, resolveImageMaterialMeta, setXyNodes],
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

  // ── Save image locally using Tauri native dialog + fs (reliable in desktop app) ──
  const handleSaveLocally = useCallback(async () => {
    if (!imageUrl) return;
    setSaving(true);

    const safeName = (fileName && fileName !== "upload") ? fileName.replace(/\.[^.]+$/, "") : "image";

    const getExtFromMime = (mime: string): string => {
      if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
      if (mime.includes("webp")) return "webp";
      if (mime.includes("gif")) return "gif";
      return "png";
    };

    // Convert image source to Uint8Array for file writing
    const imageToBytes = async (): Promise<{ bytes: Uint8Array; ext: string }> => {
      // Data URL: decode base64 directly — preserves original format
      if (imageUrl.startsWith("data:")) {
        const commaIdx = imageUrl.indexOf(",");
        const meta = imageUrl.slice(0, commaIdx);
        const base64 = imageUrl.slice(commaIdx + 1);
        const mimeMatch = meta.match(/data:(image\/[\w+.-]+)/);
        const mime = mimeMatch?.[1] ?? "image/png";
        const ext = getExtFromMime(mime);
        const raw = atob(base64);
        const buf = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
        return { bytes: buf, ext };
      }

      // Remote URL: fetch the original file (no canvas re-encoding)
      const isTauriApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      let httpFetch: typeof globalThis.fetch;
      if (isTauriApp) {
        try {
          const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
          httpFetch = tauriFetch as typeof globalThis.fetch;
        } catch {
          httpFetch = globalThis.fetch;
        }
      } else {
        httpFetch = globalThis.fetch;
      }

      const response = await httpFetch(imageUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      const ext = getExtFromMime(blob.type || "image/png");
      const arrayBuf = await blob.arrayBuffer();
      return { bytes: new Uint8Array(arrayBuf), ext };
    };

    try {
      const { bytes, ext } = await imageToBytes();

      // Primary: use Tauri save dialog + fs writeFile (most reliable in desktop app)
      const isTauriApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauriApp) {
        try {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const { writeFile } = await import("@tauri-apps/plugin-fs");
          const filePath = await save({
            defaultPath: `${safeName}.${ext}`,
            filters: [{ name: "Images", extensions: [ext] }],
          });
          if (filePath) {
            await writeFile(filePath, bytes);
            useUIStore.getState().addToast("success", "图片已保存");
          }
          setSaving(false);
          return;
        } catch (err) {
          // User cancelled dialog or Tauri API error — fall through to web fallback
          if (err instanceof Error && err.message?.includes("cancel")) {
            setSaving(false);
            return;
          }
          // Fall through to web download approach
        }
      }

      // Fallback: web <a> download (browser or Tauri API unavailable)
      const blob = new Blob([bytes], { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setSaving(false);
    } catch {
      // Last resort: open image URL in new tab
      try { window.open(imageUrl, "_blank"); } catch { /* no-op */ }
      setSaving(false);
    }
  }, [imageUrl, fileName]);

  const handleReversePrompt = useCallback(async () => {
    if (!imageUrl) {
      useUIStore.getState().addToast("warning", "请先上传图片，再反推提示词");
      return;
    }

    const sourceNode = useGraphStore.getState().nodes.find((n) => n.id === id);
    const textDims = NODE_DEFAULT_SIZES["text-node"];
    const textNodeId = uuid();
    const edgeId = uuid();
    const sourceX = sourceNode?.x ?? 0;
    const sourceY = sourceNode?.y ?? 0;
    const sourceWidth = sourceNode?.width ?? NODE_DEFAULT_SIZES["input-image"].w;
    const promptPlaceholder = "解析中...";

    const textNode: CanvasNode = {
      id: textNodeId,
      type: "text-node",
      x: sourceX + sourceWidth + 40,
      y: sourceY,
      width: textDims.w,
      height: textDims.h,
      content: "",
      prompt: promptPlaceholder,
      settings: getDefaultSettings("text-node"),
      nodeName: `${sourceNode?.nodeName || "图片"} 反推提示词`,
    };
    const edge: CanvasEdge = {
      id: edgeId,
      from: id,
      to: textNodeId,
      fromPort: "default",
      toPort: "default",
      inputType: "default",
    };

    useGraphStore.getState().addNode(textNode);
    useGraphStore.getState().addEdge(edge);
    setXyNodes((nds) => [...nds, toXyNode(textNode)]);
    setXyEdges((eds) => appendUniqueXyEdge(eds, toXyEdge(edge)));

    setReversing(true);
    try {
      const prompt = await reverseImagePrompt({ image: imageUrl });
      useGraphStore.getState().updateNode(textNodeId, { prompt });
      setXyNodes((nds) => nds.map((n) => (
        n.id === textNodeId ? { ...n, data: { ...n.data, prompt } } : n
      )));
      useUIStore.getState().addToast("success", "图片提示词已生成");
    } catch (err) {
      const fallback = "图片反推失败，请检查视觉模型和 API 设置后重试。";
      useGraphStore.getState().updateNode(textNodeId, { prompt: fallback });
      setXyNodes((nds) => nds.map((n) => (
        n.id === textNodeId ? { ...n, data: { ...n.data, prompt: fallback } } : n
      )));
      const message = err instanceof Error ? err.message : "未知错误";
      useUIStore.getState().addToast("error", `图片反推失败: ${message}`);
    } finally {
      setReversing(false);
    }
  }, [id, imageUrl, setXyEdges, setXyNodes]);

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
        {imageUrl && (
          <button
            type="button"
            className="nodrag text-[9px] font-medium px-1.5 py-0.5 rounded"
            onClick={(e) => { e.stopPropagation(); handleReversePrompt(); }}
            disabled={reversing}
            title="分析当前图片并生成结构化提示词"
            style={{
              background: reversing ? (isDark ? "#27272a" : "#e5e7eb") : (isDark ? "#3f1d2a" : "#fff1f2"),
              color: reversing ? (isDark ? "#71717a" : "#9ca3af") : (isDark ? "#fb7185" : "#e11d48"),
              border: `1px solid ${isDark ? "#4c1d2f" : "#fecdd3"}`,
              cursor: reversing ? "not-allowed" : "pointer",
              lineHeight: 1.2,
            }}
          >
            {reversing ? "解析中" : "反推"}
          </button>
        )}
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

      {/* Image area — click to upload, ref for native dblclick */}
      <div
        ref={imgContainerRef}
        className="relative w-full flex items-center justify-center rounded overflow-hidden nodrag"
        style={{ minHeight: 120, maxHeight: 180, background: isDark ? "#0f0f0f" : "#fafafa", cursor: imageUrl ? "zoom-in" : "pointer" }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => { if (!imageUrl) handleUploadClick(); }}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={fileName}
              className="rounded"
              style={{ maxWidth: "100%", maxHeight: 170, objectFit: "contain", pointerEvents: "none" }}
              loading="lazy"
            />
            {/* Save button — compact, green arrow icon */}
            <button
              type="button"
              className="nodrag"
              onClick={(e) => { e.stopPropagation(); handleSaveLocally(); }}
              disabled={saving}
              title="保存原图到本地"
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
            className="flex flex-col items-center justify-center w-full rounded border-2 border-dashed"
            style={{
              height: 120,
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              color: isDark ? "#71717a" : "#a1a1aa",
              cursor: "pointer",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-xs mt-2">点击上传或拖拽图片</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        title="选择图片文件"
        className="hidden"
        onChange={handleFileChange}
      />

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
