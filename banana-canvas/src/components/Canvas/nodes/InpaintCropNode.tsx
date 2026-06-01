import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { NodeProps, Node, Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUpstreamNodes } from "../../../hooks/useUpstreamNodes";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { NODE_DEFAULT_SIZES } from "../../../types/node";
import type { CanvasNode, CanvasEdge } from "../../../types/node";
import { inpaintImage, pollTask } from "../../../services/apiService";
import type { InpaintCropSettings } from "../../../types/settings";
import { IMAGE_MODELS } from "../../../types/model";
import { UpstreamReferenceHeader } from "./UpstreamReferenceHeader";

// ── Helpers ──

function toXyNode(n: CanvasNode): Node {
  return {
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    data: { label: n.nodeName, content: n.content, prompt: n.prompt, settings: n.settings, width: n.width, height: n.height },
    style: { width: n.width },
  };
}

function toXyEdge(e: CanvasEdge): Edge {
  return {
    id: e.id,
    source: e.from,
    target: e.to,
    sourceHandle: e.fromPort,
    targetHandle: e.toPort,
    type: "canvas",
    data: { inputType: e.inputType },
  };
}

function createImageNodeOnCanvas(
  imageUrl: string,
  sourceNodeId: string,
  sourceNodeX: number,
  sourceNodeY: number,
  colIndex: number,
  rowIndex: number,
  setNodes: (updater: (nds: Node[]) => Node[]) => void,
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void,
): void {
  const id = uuid();
  const existingCount = useGraphStore.getState().nodes.filter((n) => n.type === "input-image").length;
  const nodeName = `图片${existingCount + 1}`;

  const maxOrder = useGraphStore.getState().nodes
    .filter((n) => n.type === "input-image")
    .reduce((max, n) => {
      const ord = (n.settings as Record<string, unknown>)?.materialOrder as number ?? 0;
      return ord > max ? ord : max;
    }, 0);

  const dims = NODE_DEFAULT_SIZES["input-image"];
  const node: CanvasNode = {
    id,
    type: "input-image",
    x: sourceNodeX + (dims.w + 40) * colIndex,
    y: sourceNodeY + dims.h + 40 + (dims.h + 20) * rowIndex,
    width: dims.w,
    height: dims.h,
    content: imageUrl,
    prompt: "",
    settings: { source: "upload", imageUrl, fileName: nodeName, materialOrder: maxOrder + 1 },
    nodeName,
  };

  useGraphStore.getState().addNode(node);

  const edge: CanvasEdge = {
    id: uuid(),
    from: sourceNodeId,
    to: id,
    fromPort: "default",
    toPort: "default",
    inputType: "default",
  };
  useGraphStore.getState().addEdge(edge);

  setNodes((nds) => [...nds, toXyNode(node)]);
  setEdges((eds) => [...eds, toXyEdge(edge)]);
}

// Split image into grid tiles using Canvas API
function splitImageIntoGrid(
  imgSrc: string,
  gridSize: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tileW = Math.floor(img.width / gridSize);
      const tileH = Math.floor(img.height / gridSize);
      const tiles: string[] = [];

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const canvas = document.createElement("canvas");
          canvas.width = tileW;
          canvas.height = tileH;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("Canvas 2D not available")); return; }
          ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, tileW, tileH);
          tiles.push(canvas.toDataURL("image/png"));
        }
      }
      resolve(tiles);
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imgSrc;
  });
}

// ── Component ──

const GRID_OPTIONS: InpaintCropSettings["gridSize"][] = [2, 3, 4, 5];

export const InpaintCropNode = memo(function InpaintCropNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<InpaintCropSettings>(id);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);

  const upstream = useUpstreamNodes(id);
  const upstreamRef = upstream.length > 0 ? upstream[upstream.length - 1] : null;
  const upstreamContent = upstreamRef?.content ?? "";

  const imageModelOptions = (() => {
    const dynamic = remoteModels.filter((m) => m.type === "image");
    if (dynamic.length > 0) return dynamic.map((m) => ({ id: m.id, label: m.name }));
    const maybeImage = remoteModels.filter((m) => m.type !== "video" && m.type !== "chat");
    if (maybeImage.length > 0) return maybeImage.map((m) => ({ id: m.id, label: m.name }));
    return IMAGE_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.provider})` }));
  })();

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Mask drawing state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  // ── Load image for mask canvas sizing ──
  useEffect(() => {
    if (!upstreamContent || !isDrawingMode) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedImageRef.current = img;
      // Size mask canvas to match displayed image
      if (maskCanvasRef.current && imageContainerRef.current) {
        const containerW = imageContainerRef.current.clientWidth;
        const containerH = imageContainerRef.current.clientHeight;
        maskCanvasRef.current.width = containerW;
        maskCanvasRef.current.height = containerH;
        const ctx = maskCanvasRef.current.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, containerW, containerH);
        }
      }
    };
    img.src = upstreamContent;
  }, [upstreamContent, isDrawingMode]);

  // ── Mask drawing handlers ──
  const getCanvasPos = useCallback((e: React.PointerEvent) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Scale from CSS pixels to canvas internal pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const paintAt = useCallback((x: number, y: number) => {
    const ctx = maskCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Scale brush size to canvas internal resolution
    const canvas = maskCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const scale = rect && canvas ? canvas.width / rect.width : 1;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, (brushSize / 2) * scale, 0, Math.PI * 2);
    ctx.fill();
  }, [brushSize]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    setIsPainting(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = getCanvasPos(e);
    paintAt(x, y);
  }, [isDrawingMode, getCanvasPos, paintAt]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPainting) return;
    e.preventDefault();
    const { x, y } = getCanvasPos(e);
    paintAt(x, y);
  }, [isPainting, getCanvasPos, paintAt]);

  const handlePointerUp = useCallback(() => {
    setIsPainting(false);
  }, []);

  const handleStartDrawing = useCallback(() => {
    setIsDrawingMode(true);
  }, []);

  const handleClearMask = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const handleExitDrawing = useCallback(() => {
    setIsDrawingMode(false);
    // Save mask to settings
    const canvas = maskCanvasRef.current;
    if (canvas) {
      updateSettings({ maskDataUrl: canvas.toDataURL("image/png") });
    }
  }, [updateSettings]);

  // ── Crop execution ──
  const handleCrop = useCallback(async () => {
    if (!upstreamContent) return;
    setGenerating(true);
    setError("");

    try {
      const tiles = await splitImageIntoGrid(upstreamContent, settings.gridSize);

      // Get current node position
      const currentNode = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (!currentNode) throw new Error("节点未找到");

      const maxOrder = useGraphStore.getState().nodes
        .filter((n) => n.type === "input-image")
        .reduce((max, n) => {
          const ord = (n.settings as Record<string, unknown>)?.materialOrder as number ?? 0;
          return ord > max ? ord : max;
        }, 0);

      // Create image nodes for each tile
      const dims = NODE_DEFAULT_SIZES["input-image"];
      const cols = settings.gridSize;
      for (let i = 0; i < tiles.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const tileId = uuid();
        const nodeName = `图片${maxOrder + 1 + i}`;

        const node: CanvasNode = {
          id: tileId,
          type: "input-image",
          x: currentNode.x + (dims.w + 40) * col,
          y: currentNode.y + dims.h + 40 + (dims.h + 20) * row,
          width: dims.w,
          height: dims.h,
          content: tiles[i],
          prompt: "",
          settings: { source: "upload", imageUrl: tiles[i], fileName: nodeName, materialOrder: maxOrder + 1 + i },
          nodeName,
        };

        useGraphStore.getState().addNode(node);

        const edge: CanvasEdge = {
          id: uuid(),
          from: id,
          to: tileId,
          fromPort: "default",
          toPort: "default",
          inputType: "default",
        };
        useGraphStore.getState().addEdge(edge);

        setXyNodes((nds) => [...nds, toXyNode(node)]);
        setXyEdges((eds) => [...eds, toXyEdge(edge)]);
      }

      useUIStore.getState().addToast("success", `已裁剪 ${tiles.length} 张图片`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "裁剪失败");
    } finally {
      setGenerating(false);
    }
  }, [id, upstreamContent, settings.gridSize, setXyNodes]);

  // ── Inpaint execution ──
  const handleInpaint = useCallback(async () => {
    if (!upstreamContent) return;
    if (!settings.inpaintPrompt.trim()) {
      setError("请输入重绘提示词");
      return;
    }

    // Get mask: from canvas if in drawing mode, otherwise from settings
    let maskDataUrl = settings.maskDataUrl;
    if (isDrawingMode && maskCanvasRef.current) {
      maskDataUrl = maskCanvasRef.current.toDataURL("image/png");
    }

    if (!maskDataUrl) {
      setError("请先绘制遮罩");
      return;
    }

    // Convert upstream image to data URL if it's not already
    let imageDataUrl = upstreamContent;
    if (!upstreamContent.startsWith("data:")) {
      try {
        const resp = await fetch(upstreamContent);
        const blob = await resp.blob();
        imageDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch {
        setError("图片加载失败");
        return;
      }
    }

    setGenerating(true);
    setError("");
    const jobId = addJob({ id: uuid(), nodeId: id, type: "inpaint-crop", taskId: "", status: "running", progress: 0, createdAt: Date.now() });

    try {
      const result = await inpaintImage({
        model: settings.model,
        prompt: settings.inpaintPrompt,
        image: imageDataUrl,
        mask: maskDataUrl,
      });

      if (result.status === "succeeded" && result.imageUrl) {
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.imageUrl });

        // Create result node on canvas
        const currentNode = useGraphStore.getState().nodes.find((n) => n.id === id);
        if (currentNode) {
          createImageNodeOnCanvas(result.imageUrl, id, currentNode.x, currentNode.y, 0, 0, setXyNodes, setXyEdges);
        }
        useUIStore.getState().addToast("success", "局部重绘完成");
      } else if (result.taskId) {
        updateJob(jobId, { taskId: result.taskId });

        // Manual poll loop
        const pollInterval = setInterval(async () => {
          try {
            const pollResult = await pollTask(result.taskId);
            if (pollResult.status === "succeeded" && pollResult.imageUrl) {
              clearInterval(pollInterval);
              updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: pollResult.imageUrl });
              const node = useGraphStore.getState().nodes.find((n) => n.id === id);
              if (node) {
                createImageNodeOnCanvas(pollResult.imageUrl, id, node.x, node.y, 0, 0, setXyNodes, setXyEdges);
              }
              useUIStore.getState().addToast("success", "局部重绘完成");
              setGenerating(false);
            } else if (pollResult.status === "failed") {
              clearInterval(pollInterval);
              updateJob(jobId, { status: "failed", error: pollResult.error });
              setError(pollResult.error || "重绘失败");
              setGenerating(false);
            }
          } catch (err) {
            // Transient error, keep polling
          }
        }, 3000);

        // Timeout after 5 minutes
        setTimeout(() => clearInterval(pollInterval), 300000);
      }
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : "重绘失败" });
      setError(err instanceof Error ? err.message : "重绘失败");
    } finally {
      setGenerating(false);
    }
  }, [id, upstreamContent, settings.inpaintPrompt, settings.maskDataUrl, isDrawingMode, addJob, updateJob, setXyNodes]);

  // ── Execute handler ──
  const handleExecute = useCallback(() => {
    if (settings.mode === "crop") {
      handleCrop();
    } else {
      handleInpaint();
    }
  }, [settings.mode, handleCrop, handleInpaint]);

  const canExecute = upstreamContent && !generating && (
    settings.mode === "crop" || (settings.mode === "inpaint" && settings.inpaintPrompt.trim())
  );

  return (
    <BaseNode id={id} type="inpaint-crop" selected={selected}>
      <div className="flex flex-col gap-2">
        {/* Mode selector */}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => updateSettings({ mode: "crop" })}
            className="flex-1 text-[11px] px-2 py-1 rounded font-medium nodrag"
            style={{
              background: settings.mode === "crop" ? "#f97316" : (isDark ? "#27272a" : "#f4f4f5"),
              color: settings.mode === "crop" ? "#fff" : (isDark ? "#a1a1aa" : "#71717a"),
              border: `1px solid ${settings.mode === "crop" ? "#f97316" : (isDark ? "#3f3f46" : "#d4d4d8")}`,
            }}
          >
            等比裁剪
          </button>
          <button
            type="button"
            onClick={() => updateSettings({ mode: "inpaint" })}
            className="flex-1 text-[11px] px-2 py-1 rounded font-medium nodrag"
            style={{
              background: settings.mode === "inpaint" ? "#8b5cf6" : (isDark ? "#27272a" : "#f4f4f5"),
              color: settings.mode === "inpaint" ? "#fff" : (isDark ? "#a1a1aa" : "#71717a"),
              border: `1px solid ${settings.mode === "inpaint" ? "#8b5cf6" : (isDark ? "#3f3f46" : "#d4d4d8")}`,
            }}
          >
            局部重绘
          </button>
        </div>

        {upstreamRef && (
          <UpstreamReferenceHeader
            targetNodeId={id}
            reference={upstreamRef}
            isDark={isDark}
            promptValue={settings.inpaintPrompt}
            onPromptChange={(nextPrompt) => updateSettings({ inpaintPrompt: nextPrompt })}
          />
        )}

        {/* Image preview */}
        <div
          ref={imageContainerRef}
          className="relative rounded border overflow-hidden"
          style={{
            height: 160,
            background: isDark ? "#27272a" : "#f4f4f5",
            borderColor: isDark ? "#3f3f46" : "#d4d4d8",
          }}
        >
          {upstreamContent ? (
            <img
              src={upstreamContent}
              alt=""
              className="w-full h-full object-contain"
              style={{ pointerEvents: isDrawingMode ? "none" : "auto" }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>连接图片节点</span>
            </div>
          )}

          {/* Crop grid overlay */}
          {settings.mode === "crop" && upstreamContent && (
            <div className="absolute inset-0 pointer-events-none" style={{
              display: "grid",
              gridTemplateColumns: `repeat(${settings.gridSize}, 1fr)`,
              gridTemplateRows: `repeat(${settings.gridSize}, 1fr)`,
            }}>
              {Array.from({ length: settings.gridSize * settings.gridSize }, (_, i) => (
                <div key={i} style={{ border: "1px dashed rgba(249,115,22,0.5)" }} />
              ))}
            </div>
          )}

          {/* Mask drawing canvas overlay */}
          {settings.mode === "inpaint" && isDrawingMode && upstreamContent && (
            <canvas
              ref={maskCanvasRef}
              className="absolute inset-0 w-full h-full nodrag"
              style={{ cursor: "crosshair", opacity: 0.6 }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          )}

          {/* Saved mask preview */}
          {settings.mode === "inpaint" && !isDrawingMode && settings.maskDataUrl && (
            <img
              src={settings.maskDataUrl}
              alt="遮罩"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              style={{ opacity: 0.5, mixBlendMode: "screen" }}
            />
          )}
        </div>

        {/* Crop mode: grid size buttons */}
        {settings.mode === "crop" && (
          <div className="flex gap-1">
            {GRID_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => updateSettings({ gridSize: size })}
                className="flex-1 text-[11px] px-1 py-1 rounded font-medium nodrag"
                style={{
                  background: settings.gridSize === size ? "#f97316" : (isDark ? "#27272a" : "#f4f4f5"),
                  color: settings.gridSize === size ? "#fff" : (isDark ? "#a1a1aa" : "#71717a"),
                  border: `1px solid ${settings.gridSize === size ? "#f97316" : (isDark ? "#3f3f46" : "#d4d4d8")}`,
                }}
              >
                {size}x{size}
              </button>
            ))}
          </div>
        )}

        {/* Inpaint mode: drawing controls + prompt */}
        {settings.mode === "inpaint" && (
          <div className="flex flex-col gap-1.5">
            {/* Model selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
              <select
                value={settings.model}
                onChange={(e) => updateSettings({ model: e.target.value })}
                className="flex-1 text-[11px] px-1 py-0.5 rounded border outline-none nodrag"
                style={inputStyle}
                title="选择模型"
              >
                {imageModelOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-1">
              {!isDrawingMode ? (
                <button
                  type="button"
                  onClick={handleStartDrawing}
                  className="flex-1 text-[11px] px-2 py-1 rounded border nodrag"
                  style={{ ...inputStyle, borderColor: "#8b5cf6", color: "#8b5cf6" }}
                >
                  手绘遮罩
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleExitDrawing}
                    className="flex-1 text-[11px] px-2 py-1 rounded nodrag"
                    style={{ background: "#8b5cf6", color: "#fff" }}
                  >
                    完成绘制
                  </button>
                  <button
                    type="button"
                    onClick={handleClearMask}
                    className="text-[11px] px-2 py-1 rounded border nodrag"
                    style={inputStyle}
                  >
                    清除遮罩
                  </button>
                </>
              )}
            </div>

            {isDrawingMode && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>笔刷</span>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  title="笔刷大小"
                  className="flex-1 nodrag"
                  style={{ accentColor: "#8b5cf6" }}
                />
                <span className="text-[10px] w-6 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>
                  {brushSize}
                </span>
              </div>
            )}

            <textarea
              value={settings.inpaintPrompt}
              onChange={(e) => updateSettings({ inpaintPrompt: e.target.value })}
              placeholder="输入重绘提示词，描述你想要重绘的内容..."
              className="w-full text-[11px] px-2 py-1 rounded border outline-none resize-none"
              style={{ height: 48, ...inputStyle }}
            />
          </div>
        )}

        {/* Execute button */}
        <button
          type="button"
          onClick={handleExecute}
          disabled={!canExecute}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: !canExecute
              ? (isDark ? "#3f3f46" : "#d4d4d8")
              : settings.mode === "crop" ? "#f97316" : "#8b5cf6",
            color: !canExecute
              ? (isDark ? "#71717a" : "#a1a1aa")
              : "#fff",
          }}
        >
          {generating
            ? (settings.mode === "crop" ? "裁剪中..." : "重绘中...")
            : (settings.mode === "crop" ? "执行裁剪" : "执行重绘")}
        </button>

        {/* Result info */}
        {settings.mode === "crop" && (
          <div className="text-[9px] text-center" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>
            输出 {settings.gridSize * settings.gridSize} 张图片节点
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="text-[10px] text-red-400 mt-0.5">{error}</div>
        )}
      </div>
    </BaseNode>
  );
});
