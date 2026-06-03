import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { BaseNode } from "../BaseNode";
import { useGenerationPoll } from "../../../hooks/useGenerationPoll";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import { generateImage } from "../../../services/apiService";
import { getDefaultSettings, NODE_DEFAULT_SIZES, type CanvasEdge, type CanvasNode } from "../../../types/node";
import type { PanoramaSceneSettings } from "../../../types/settings";
import { getMaterialFileName, getNextMaterialName, getNextMaterialOrder } from "../../../utils/materialNaming";
import { toXyEdge, toXyNode } from "../../../utils/nodeConvert";
import { appendUniqueXyEdge } from "../../../utils/edgeDedup";
import { saveImageSourceToLocal } from "../../../utils/saveImageToLocal";
import { getImageModelOptions } from "./imageModelOptions";
import { buildPanoramaImageRequest } from "./panoramaGeneration";
import { buildPanoramaPrompt } from "./panoramaPrompt";
import {
  clampFov,
  detectCubemapLayout,
  getDownsampledSize,
  getSafeCanvasDpr,
  movePanoramaView,
  renderCubemapPanorama,
  renderEquirectangularPanorama,
  rotatePanoramaViewFromDrag,
  shouldUseOriginalPanoramaImage,
  type CubemapLayout,
  type PanoramaDragStart,
  type PanoramaViewState,
  type RenderablePanoramaImage,
} from "./panoramaViewer";

const DEFAULT_VIEW: PanoramaViewState = {
  yaw: 90,
  pitch: 0,
  fov: 60,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
};

const LENS_FOV: Record<PanoramaSceneSettings["lens"], number> = {
  "24mm": 84,
  "35mm": 63,
  "50mm": 47,
  "85mm": 28,
};

const MAX_EQUIRECT_PREVIEW_WIDTH = 8192;
const MAX_EQUIRECT_PREVIEW_HEIGHT = 4096;
const MAX_CUBEMAP_PREVIEW_WIDTH = 6144;
const MAX_CUBEMAP_PREVIEW_HEIGHT = 4096;
const MAX_CANVAS_PIXELS = 900_000;
const MAX_CUBEMAP_CANVAS_PIXELS = 420_000;
const MAX_SOURCE_PIXELS = 96_000_000;

function getImageNaturalSize(image: HTMLImageElement): { width: number; height: number } {
  return {
    width: image.naturalWidth || image.width || 1,
    height: image.naturalHeight || image.height || 1,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result || ""));
    reader.onerror = () => reject(new Error("图片文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string, useCors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (useCors) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

function drawDownsampledCanvas(
  image: HTMLImageElement,
  format: PanoramaSceneSettings["format"],
): { canvas: HTMLCanvasElement; scale: number } {
  const { width, height } = getImageNaturalSize(image);
  if (width * height > MAX_SOURCE_PIXELS) {
    throw new Error("全景图分辨率过大，已阻止加载以避免应用崩溃。请先压缩图片后再导入。");
  }
  const limits = format === "cubemap"
    ? { width: MAX_CUBEMAP_PREVIEW_WIDTH, height: MAX_CUBEMAP_PREVIEW_HEIGHT }
    : { width: MAX_EQUIRECT_PREVIEW_WIDTH, height: MAX_EQUIRECT_PREVIEW_HEIGHT };
  const next = getDownsampledSize(width, height, limits.width, limits.height);
  const canvas = document.createElement("canvas");
  canvas.width = next.width;
  canvas.height = next.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("无法创建全景预览画布");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, next.width, next.height);
  return { canvas, scale: next.scale };
}

async function createSafePreviewImage(
  image: HTMLImageElement,
  format: PanoramaSceneSettings["format"],
): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  const { width, height } = getImageNaturalSize(image);
  if (shouldUseOriginalPanoramaImage(width, height, format)) {
    return { image, width, height };
  }
  const { canvas } = drawDownsampledCanvas(image, format);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const safeImage = await loadImageElement(dataUrl);
  return { image: safeImage, width: safeImage.width, height: safeImage.height };
}

async function prepareLocalPanoramaDataUrl(
  file: File,
  format: PanoramaSceneSettings["format"],
): Promise<{ dataUrl: string; downsampled: boolean }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const { width, height } = getImageNaturalSize(image);
    const limits = format === "cubemap"
      ? { width: MAX_CUBEMAP_PREVIEW_WIDTH, height: MAX_CUBEMAP_PREVIEW_HEIGHT }
      : { width: MAX_EQUIRECT_PREVIEW_WIDTH, height: MAX_EQUIRECT_PREVIEW_HEIGHT };
    const mustDownsample = !shouldUseOriginalPanoramaImage(width, height, format)
      || width > limits.width
      || height > limits.height;
    if (!mustDownsample) {
      return { dataUrl: await readFileAsDataUrl(file), downsampled: false };
    }
    const { canvas } = drawDownsampledCanvas(image, format);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), downsampled: true };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const PanoramaSceneNode = memo(function PanoramaSceneNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === id));
  const { settings, updateSettings } = useNodeSettings<PanoramaSceneSettings>(id);
  const updateNode = useGraphStore((s) => s.updateNode);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const latestJob = useJobStore((s) => s.getLatestJobByNodeId(id));
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panoramaInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<RenderablePanoramaImage | null>(null);
  const cubemapSampleRef = useRef<{ imageData: ImageData; layout: CubemapLayout } | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<PanoramaDragStart | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; fov: number } | null>(null);
  const renderErrorRef = useRef("");

  const [view, setView] = useState<PanoramaViewState>({ ...DEFAULT_VIEW });
  const [sourcePreview, setSourcePreview] = useState(settings.sourceImage || "");
  const [loadError, setLoadError] = useState("");
  const [imageStatus, setImageStatus] = useState<"empty" | "loading" | "ready" | "unsupported" | "failed">(
    node?.content || settings.panoramaImage ? "loading" : "empty",
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savingOriginal, setSavingOriginal] = useState(false);

  useGenerationPoll(id);

  const panoramaImage = node?.content || settings.panoramaImage || "";
  const isGenerating = latestJob?.status === "pending" || latestJob?.status === "running";
  const generationError = latestJob?.status === "failed" ? latestJob.error || "全景图生成失败" : "";
  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };
  const fullscreenControlStyle = {
    background: "rgba(24,24,27,0.78)",
    borderColor: "rgba(255,255,255,0.18)",
    color: "#fff",
    backdropFilter: "blur(10px)",
  };

  const modelOptions = useMemo(() => getImageModelOptions(), []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const image = imageRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = getSafeCanvasDpr(
      width,
      height,
      window.devicePixelRatio || 1,
      settings.format === "cubemap" ? MAX_CUBEMAP_CANVAS_PIXELS : MAX_CANVAS_PIXELS,
    );
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = isDark ? "#09090b" : "#e4e4e7";
    ctx.fillRect(0, 0, width, height);

    try {
      if (!image || !panoramaImage) {
        return;
      }

      if (settings.format === "cubemap") {
        const cubemap = cubemapSampleRef.current;
        if (!cubemap) {
          return;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        renderCubemapPanorama(ctx, cubemap.imageData, cubemap.layout, view, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return;
      }

      renderEquirectangularPanorama(ctx, image, view, width, height);
      renderErrorRef.current = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "全景渲染失败";
      if (renderErrorRef.current !== message) {
        renderErrorRef.current = message;
        imageRef.current = null;
        cubemapSampleRef.current = null;
        setImageStatus("failed");
        setLoadError(`全景渲染失败：${message}`);
      }
    }
  }, [isDark, panoramaImage, settings.format, view]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [draw, isFullscreen]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    if (!panoramaImage) {
      imageRef.current = null;
      cubemapSampleRef.current = null;
      setImageStatus("empty");
      draw();
      return;
    }
    let cancelled = false;
    const isRemoteImage = /^https?:/i.test(panoramaImage);
    const handleLoadedImage = async (image: HTMLImageElement) => {
      if (cancelled) return;
      let preview: { image: RenderablePanoramaImage; width: number; height: number };
      try {
        preview = await createSafePreviewImage(image, settings.format || "equirectangular");
      } catch (error) {
        if (cancelled) return;
        imageRef.current = null;
        cubemapSampleRef.current = null;
        setImageStatus("failed");
        setLoadError(error instanceof Error ? error.message : "全景图预处理失败");
        draw();
        return;
      }

      setLoadError("");
      imageRef.current = preview.image;
      cubemapSampleRef.current = null;
      const cubemapLayout = detectCubemapLayout(preview.width, preview.height);
      const aspectRatio = preview.width / Math.max(preview.height, 1);
      if ((settings.format || "equirectangular") === "equirectangular" && cubemapLayout) {
        updateSettings({ format: "cubemap" });
        setLoadError("检测到 Cubemap 六面图，已自动切换全景格式");
        return;
      }
      if ((settings.format || "equirectangular") === "cubemap" && !cubemapLayout && Math.abs(aspectRatio - 2) < 0.18) {
        updateSettings({ format: "equirectangular" });
        setLoadError("检测到 2:1 全景图，已自动切换全景格式");
        return;
      }
      if (settings.format === "cubemap") {
        const layout = cubemapLayout;
        if (!layout) {
          setImageStatus("unsupported");
          setLoadError("Cubemap 图片需为六面横排、竖排或 3x2 网格");
          draw();
          return;
        }
        try {
          const sampleCanvas = document.createElement("canvas");
          sampleCanvas.width = preview.width;
          sampleCanvas.height = preview.height;
          const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
          if (!sampleCtx) throw new Error("无法创建 Cubemap 采样画布");
          sampleCtx.drawImage(preview.image, 0, 0, preview.width, preview.height);
          cubemapSampleRef.current = {
            imageData: sampleCtx.getImageData(0, 0, preview.width, preview.height),
            layout,
          };
        } catch {
          setImageStatus("failed");
          setLoadError("Cubemap 图片无法读取，请使用本地图片或支持 CORS 的图片地址");
          draw();
          return;
        }
      }
      setImageStatus("ready");
      draw();
    };
    const handleFailedImage = () => {
      if (cancelled) return;
      imageRef.current = null;
      cubemapSampleRef.current = null;
      setImageStatus("failed");
      setLoadError("全景图加载失败，请检查图片地址或重新生成");
      draw();
    };

    const loadImage = (useCors: boolean) => {
      const image = new Image();
      if (useCors) image.crossOrigin = "anonymous";
      image.onload = () => { void handleLoadedImage(image); };
      image.onerror = () => {
        if (useCors && isRemoteImage) {
          const fallbackImage = new Image();
          fallbackImage.onload = () => { void handleLoadedImage(fallbackImage); };
          fallbackImage.onerror = handleFailedImage;
          fallbackImage.src = panoramaImage;
          return;
        }
        handleFailedImage();
      };
      image.src = panoramaImage;
    };

    setLoadError("");
    setImageStatus("loading");
    loadImage(isRemoteImage);
    return () => {
      cancelled = true;
    };
  }, [draw, panoramaImage, settings.format, updateSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (keysRef.current.size === 0) return;
      setView((current) => movePanoramaView(current, keysRef.current, 1));
    }, 40);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      keysRef.current.clear();
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
      imageRef.current = null;
      cubemapSampleRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    };
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const dataUrl = String(readerEvent.target?.result || "");
      setSourcePreview(dataUrl);
      updateSettings({ sourceImage: dataUrl });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }, [updateSettings]);

  const handlePanoramaFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageStatus("loading");
    setLoadError("");
    try {
      const { dataUrl, downsampled } = await prepareLocalPanoramaDataUrl(file, settings.format || "equirectangular");
      updateSettings({ panoramaImage: dataUrl });
      updateNode(id, { content: dataUrl });
      setXyNodes((nds) => nds.map((xyNode) => (
        xyNode.id === id ? { ...xyNode, data: { ...xyNode.data, content: dataUrl } } : xyNode
      )));
      if (downsampled) {
        useUIStore.getState().addToast("info", "全景图较大，已自动压缩为预览安全尺寸，避免卡死或闪退");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "全景图处理失败";
      setImageStatus("failed");
      setLoadError(message);
      useUIStore.getState().addToast("error", message);
    }
  }, [id, settings.format, setXyNodes, updateNode, updateSettings]);

  const handleGenerate = useCallback(async () => {
    const jobId = addJob({ id: uuid(), nodeId: id, type: "image", taskId: "", status: "running", progress: 0, createdAt: Date.now() });
    try {
      const prompt = buildPanoramaPrompt({
        userPrompt: settings.prompt,
        hasSourceImage: !!settings.sourceImage,
        format: settings.format || "equirectangular",
      });
      const result = await generateImage(buildPanoramaImageRequest({
        model: settings.model || "gpt-image-2",
        prompt,
        format: settings.format || "equirectangular",
        sourceImage: settings.sourceImage || undefined,
      }));

      if (result.imageUrl) {
        updateSettings({ panoramaImage: result.imageUrl });
        updateNode(id, { content: result.imageUrl });
        setXyNodes((nds) => nds.map((xyNode) => (
          xyNode.id === id ? { ...xyNode, data: { ...xyNode.data, content: result.imageUrl } } : xyNode
        )));
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.imageUrl });
      } else if (result.taskId) {
        updateJob(jobId, { taskId: result.taskId, status: "pending", progress: 5 });
      } else {
        updateJob(jobId, { status: "failed", progress: 0, error: result.error || "全景图生成未返回图片" });
      }
    } catch (error) {
      updateJob(jobId, { status: "failed", progress: 0, error: error instanceof Error ? error.message : "全景图生成失败" });
    }
  }, [addJob, id, settings.format, settings.model, settings.prompt, settings.sourceImage, setXyNodes, updateJob, updateNode, updateSettings]);

  const handleSaveOriginal = useCallback(async () => {
    if (!panoramaImage || savingOriginal) return;
    setSavingOriginal(true);
    try {
      const saved = await saveImageSourceToLocal(panoramaImage, node?.nodeName || "panorama");
      if (saved) {
        useUIStore.getState().addToast("success", "\u539f\u56fe\u5df2\u4fdd\u5b58");
      }
    } catch (error) {
      useUIStore.getState().addToast("error", error instanceof Error ? error.message : "\u539f\u56fe\u4fdd\u5b58\u5931\u8d25");
    } finally {
      setSavingOriginal(false);
    }
  }, [node?.nodeName, panoramaImage, savingOriginal]);

  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const sourceNode = useGraphStore.getState().nodes.find((item) => item.id === id);
    if (!canvas || !sourceNode) return;
    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      useUIStore.getState().addToast("error", "当前全景图不允许截图，请使用本地上传或支持 CORS 的图片");
      return;
    }

    const graphNodes = useGraphStore.getState().nodes;
    const imageDims = NODE_DEFAULT_SIZES["input-image"];
    const nodeName = getNextMaterialName(graphNodes, "input-image");
    const imageNodeId = uuid();
    const imageNode: CanvasNode = {
      id: imageNodeId,
      type: "input-image",
      x: sourceNode.x + (sourceNode.width || NODE_DEFAULT_SIZES["panorama-scene"].w) + 40,
      y: sourceNode.y,
      width: imageDims.w,
      height: imageDims.h,
      content: dataUrl,
      prompt: "",
      nodeName,
      settings: {
        ...getDefaultSettings("input-image"),
        source: "upload",
        imageUrl: dataUrl,
        fileName: getMaterialFileName(nodeName, "input-image"),
        materialOrder: getNextMaterialOrder(graphNodes, "input-image"),
      },
    };
    const edge: CanvasEdge = {
      id: uuid(),
      from: id,
      to: imageNodeId,
      fromPort: "default",
      toPort: "default",
      inputType: "default",
    };

    useGraphStore.getState().addNode(imageNode);
    useGraphStore.getState().addEdge(edge);
    setXyNodes((nds) => [...nds, toXyNode(imageNode)]);
    setXyEdges((eds) => appendUniqueXyEdge(eds, toXyEdge(edge)));
    useUIStore.getState().addToast("success", "\u5df2\u4fdd\u5b58\u56fe\u7247\u8282\u70b9");
  }, [id, setXyEdges, setXyNodes]);

  const resetView = useCallback(() => {
    setView({ ...DEFAULT_VIEW, fov: settings.fov || 60 });
  }, [settings.fov]);

  const getPointerDistance = useCallback(() => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.focus();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      pinchRef.current = { distance: getPointerDistance(), fov: view.fov };
      dragRef.current = null;
    } else {
      dragRef.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getPointerDistance, view.fov, view.pitch, view.yaw]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const nextDistance = getPointerDistance();
      if (nextDistance > 0 && pinchRef.current.distance > 0) {
        const nextFov = clampFov(pinchRef.current.fov * (pinchRef.current.distance / nextDistance));
        updateSettings({ fov: nextFov });
        setView((current) => ({ ...current, fov: nextFov }));
      }
      return;
    }
    const dragStart = dragRef.current;
    if (!dragStart) return;
    const { clientX, clientY } = event;
    setView((current) => rotatePanoramaViewFromDrag(current, dragStart, clientX, clientY));
  }, [getPointerDistance, updateSettings]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
    const remainingPointer = [...pointersRef.current.values()][0];
    dragRef.current = remainingPointer
      ? { x: remainingPointer.x, y: remainingPointer.y, yaw: view.yaw, pitch: view.pitch }
      : null;
  }, [view.pitch, view.yaw]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setView((current) => {
      const nextFov = clampFov(current.fov + event.deltaY * 0.04);
      updateSettings({ fov: nextFov });
      return { ...current, fov: nextFov };
    });
  }, [updateSettings]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d", "q", "e"].includes(key)) return;
    event.preventDefault();
    keysRef.current.add(key);
  }, []);

  const handleKeyUp = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    keysRef.current.delete(event.key.toLowerCase());
  }, []);

  const viewerNotice = imageStatus === "empty"
    ? "上传或生成 360 全景图"
    : imageStatus === "loading"
      ? "全景图加载中..."
      : imageStatus === "unsupported"
        ? "Cubemap 需要六面横排或 3x2 网格图片"
        : "";

  const lensSelect = (
    <select
      value={settings.lens || "35mm"}
      onChange={(event) => {
        const lens = event.target.value as PanoramaSceneSettings["lens"];
        const fov = LENS_FOV[lens];
        updateSettings({ lens, fov });
        setView((current) => ({ ...current, fov }));
      }}
      className="nodrag text-[10px] px-1 py-1 rounded border outline-none"
      style={isFullscreen ? fullscreenControlStyle : inputStyle}
      title="摄影机焦段"
    >
      <option value="24mm">24mm</option>
      <option value="35mm">35mm</option>
      <option value="50mm">50mm</option>
      <option value="85mm">85mm</option>
    </select>
  );

  const viewer = (
    <div
      ref={wrapRef}
      tabIndex={0}
      className="nodrag nowheel relative overflow-hidden rounded-lg outline-none"
      style={{
        height: isFullscreen ? "100%" : 210,
        background: isDark ? "#09090b" : "#e4e4e7",
        border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        cursor: "grab",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      {viewerNotice && !isGenerating && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[12px]" style={{ color: isDark ? "#d4d4d8" : "#52525b" }}>
          <span className="rounded-md px-3 py-2" style={{ background: isDark ? "rgba(24,24,27,0.72)" : "rgba(255,255,255,0.78)" }}>
            {viewerNotice}
          </span>
        </div>
      )}
      {(loadError || generationError) && (
        <div
          className="absolute inset-x-2 bottom-2 rounded px-2 py-1 text-[10px]"
          style={{
            background: isDark ? "rgba(127,29,29,0.82)" : "rgba(254,242,242,0.94)",
            color: isDark ? "#fecaca" : "#991b1b",
            border: `1px solid ${isDark ? "rgba(248,113,113,0.4)" : "#fecaca"}`,
          }}
        >
          {loadError || generationError}
        </div>
      )}
      {isGenerating && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px]" style={{ color: "#fff", background: "rgba(0,0,0,0.28)" }}>
          生成全景图中...
        </div>
      )}
      <div
        className="pointer-events-none absolute right-2 bottom-2 rounded-md px-2 py-1 text-[9px] font-mono"
        style={{ background: "rgba(0,0,0,0.52)", color: "rgba(255,255,255,0.82)" }}
      >
        <div>横 {Math.round(view.yaw)}° · 纵 {Math.round(view.pitch)}°</div>
        <div>焦段 {settings.lens || "35mm"} · FOV {Math.round(view.fov)}°</div>
      </div>
    </div>
  );

  const fullscreenOverlay = isFullscreen && typeof document !== "undefined"
    ? createPortal(
      <div className="fixed inset-0 z-[9999] p-3" style={{ background: "rgba(0,0,0,0.94)" }}>
        <div className="h-full relative">
          {viewer}
          <div className="nodrag absolute right-3 top-3 flex items-center gap-2 rounded-lg border p-2 shadow-lg" style={fullscreenControlStyle}>
            {lensSelect}
            <button type="button" className="nodrag rounded border px-3 py-1 text-xs" style={fullscreenControlStyle} onClick={resetView}>
              重置
            </button>
            <button type="button" className="nodrag rounded border px-3 py-1 text-xs" style={fullscreenControlStyle} onClick={handleCapture} disabled={!panoramaImage}>
              拍照
            </button>
            <button type="button" className="nodrag rounded border px-3 py-1 text-xs" style={fullscreenControlStyle} onClick={handleSaveOriginal} disabled={!panoramaImage || savingOriginal}>
              {savingOriginal ? "\u4fdd\u5b58\u4e2d" : "\u4fdd\u5b58\u539f\u56fe"}
            </button>
            <button
              type="button"
              className="nodrag rounded border px-3 py-1 text-xs"
              style={fullscreenControlStyle}
              onClick={(event) => { event.stopPropagation(); setIsFullscreen(false); }}
            >
              退出
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
    <BaseNode id={id} type="panorama-scene" selected={selected} badge="360">
      <div className="flex flex-col gap-2">
        {isFullscreen ? (
          <div
            className="nodrag flex items-center justify-center rounded-lg border text-[12px]"
            style={{
              height: 210,
              background: isDark ? "#09090b" : "#e4e4e7",
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              color: isDark ? "#a1a1aa" : "#71717a",
            }}
          >
            全屏预览中
          </div>
        ) : viewer}

        <div className="grid grid-cols-6 gap-1">
          <button type="button" className="nodrag text-[10px] rounded border px-1 py-1" style={inputStyle} onClick={() => fileInputRef.current?.click()}>
            上传场景
          </button>
          <button type="button" className="nodrag text-[10px] rounded border px-1 py-1" style={inputStyle} onClick={() => panoramaInputRef.current?.click()}>
            上传全景
          </button>
          <button type="button" className="nodrag text-[10px] rounded border px-1 py-1" style={inputStyle} onClick={resetView}>
            重置视角
          </button>
          <button type="button" className="nodrag text-[10px] rounded border px-1 py-1" style={inputStyle} onClick={() => setIsFullscreen(true)}>
            全屏
          </button>
          <button type="button" className="nodrag text-[10px] rounded border px-1 py-1" style={inputStyle} onClick={handleCapture} disabled={!panoramaImage}>
            拍照
          </button>
          <button type="button" className="nodrag text-[10px] rounded border px-1 py-1" style={inputStyle} onClick={handleSaveOriginal} disabled={!panoramaImage || savingOriginal}>
            {savingOriginal ? "\u4fdd\u5b58\u4e2d" : "\u4fdd\u5b58\u539f\u56fe"}
          </button>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" title="上传场景图片" onChange={handleFileChange} />
        <input ref={panoramaInputRef} type="file" accept="image/*" className="hidden" title="上传360全景图" onChange={handlePanoramaFileChange} />

        {sourcePreview && (
          <div className="flex items-center gap-2 rounded border p-1" style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
            <img src={sourcePreview} alt="" style={{ width: 42, height: 28, objectFit: "cover", borderRadius: 4 }} />
            <span className="text-[10px] truncate" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>已载入参考场景图</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1">
          <select
            value={settings.model || "gpt-image-2"}
            onChange={(event) => updateSettings({ model: event.target.value })}
            className="nodrag text-[10px] px-1 py-1 rounded border outline-none"
            style={inputStyle}
            title="全景图生成模型"
          >
            {modelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
          <select
            value={settings.format || "equirectangular"}
            onChange={(event) => updateSettings({ format: event.target.value as PanoramaSceneSettings["format"] })}
            className="nodrag text-[10px] px-1 py-1 rounded border outline-none"
            style={inputStyle}
            title="全景格式"
          >
            <option value="equirectangular">Equirectangular 2:1</option>
            <option value="cubemap">Cubemap</option>
          </select>
        </div>

        <div className="grid grid-cols-[1fr_80px] gap-1">
          <textarea
            value={settings.prompt || ""}
            onChange={(event) => updateSettings({ prompt: event.target.value })}
            placeholder="描述要生成的 360 场景，例如：雨后竹林、薄雾、石阶小路、电影级光影..."
            className="nodrag nowheel text-[11px] px-2 py-1 rounded border outline-none resize-none"
            rows={3}
            style={inputStyle}
          />
          <div className="flex flex-col gap-1">
            {lensSelect}
            <button
              type="button"
              className="nodrag rounded text-[11px] font-medium px-2 py-2"
              disabled={isGenerating}
              onClick={handleGenerate}
              style={{
                background: isGenerating ? (isDark ? "#3f3f46" : "#d4d4d8") : "#f97316",
                color: isGenerating ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
                cursor: isGenerating ? "not-allowed" : "pointer",
              }}
            >
              {isGenerating ? "生成中" : "生成全景"}
            </button>
          </div>
        </div>
      </div>
    </BaseNode>
    {fullscreenOverlay}
    </>
  );
});
