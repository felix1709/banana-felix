import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { generateImage, pollTask } from "../../../services/apiService";
import { IMAGE_MODELS } from "../../../types/model";
import type { CanvasNodeSettings, CanvasStroke, RefBinding, RefCategory } from "../../../types/settings";
import { NODE_DEFAULT_SIZES, NODE_TYPE_LABELS } from "../../../types/node";
import type { CanvasNode, CanvasEdge, DoodleStroke, NodeType } from "../../../types/node";
import { parseMentions, getMentionableNodes, type MentionedNode } from "../../../hooks/useMentionParser";
import { buildCanvasAnchorText } from "../../../hooks/useAnchorText";
import { stripReferenceMention } from "./referenceRemoval";
import { getMaterialFileName, getNextMaterialName, getNextMaterialOrder } from "../../../utils/materialNaming";
import { caretMenuStyle, getCaretMenuPosition, type CaretMenuPosition } from "../../../utils/caretMenuPosition";
import { insertMentionAtSelection, readTextareaSelection, restoreTextareaSelection } from "./promptInsertion";

// ── Constants ──

const RATIO_OPTIONS = [
  { value: "1:1", label: "1:1 方形" },
  { value: "9:16", label: "9:16 竖版" },
  { value: "16:9", label: "16:9 横版" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "native", label: "原生尺寸" },
];

const REF_CATEGORIES: RefCategory[] = ["角色", "场景", "道具", "特效"];

const BIND_COLORS = [
  { hex: "#ef4444", name: "红色" },
  { hex: "#f97316", name: "橙色" },
  { hex: "#eab308", name: "黄色" },
  { hex: "#22c55e", name: "绿色" },
  { hex: "#3b82f6", name: "蓝色" },
  { hex: "#8b5cf6", name: "紫色" },
  { hex: "#ec4899", name: "粉色" },
  { hex: "#06b6d4", name: "青色" },
];

const COLOR_PALETTE = [
  "#ffffff", "#d4d4d8", "#71717a", "#000000",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
];

function toMultipleOf16(n: number): number {
  return Math.round(n / 16) * 16;
}

function ratioToPixelSize(ratio: string, base: number): { w: number; h: number } {
  switch (ratio) {
    case "1:1": return { w: base, h: base };
    case "9:16": return { w: toMultipleOf16(base), h: toMultipleOf16(base * 16 / 9) };
    case "16:9": return { w: toMultipleOf16(base * 16 / 9), h: toMultipleOf16(base) };
    case "4:3": return { w: toMultipleOf16(base * 4 / 3), h: toMultipleOf16(base) };
    case "3:4": return { w: toMultipleOf16(base), h: toMultipleOf16(base * 4 / 3) };
    case "native": return { w: 0, h: 0 };
    default: return { w: base, h: base };
  }
}

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

function findEmptySpot(sourceX: number, sourceY: number, sourceW: number): { x: number; y: number } {
  const nodes = useGraphStore.getState().nodes;
  const dims = NODE_DEFAULT_SIZES["input-image"];
  const candidateX = sourceX + sourceW + 40;
  let candidateY = sourceY;
  for (let attempt = 0; attempt < 20; attempt++) {
    const overlaps = nodes.some((n) =>
      Math.abs(n.x - candidateX) < dims.w && Math.abs(n.y - candidateY) < dims.h
    );
    if (!overlaps) break;
    candidateY += dims.h + 20;
  }
  return { x: candidateX, y: candidateY };
}

function createImageNodeOnCanvas(
  imageUrl: string,
  sourceNodeId: string,
  sourceNodeX: number,
  sourceNodeY: number,
  sourceNodeW: number,
  setNodes: (updater: (nds: Node[]) => Node[]) => void,
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void,
): void {
  const newId = uuid();
  const graphNodes = useGraphStore.getState().nodes;
  const nodeName = getNextMaterialName(graphNodes, "input-image");
  const materialOrder = getNextMaterialOrder(graphNodes, "input-image");

  const spot = findEmptySpot(sourceNodeX, sourceNodeY, sourceNodeW);
  const dims = NODE_DEFAULT_SIZES["input-image"];
  const node: CanvasNode = {
    id: newId, type: "input-image", x: spot.x, y: spot.y,
    width: dims.w, height: dims.h, content: imageUrl, prompt: "",
    settings: { source: "upload", imageUrl, fileName: getMaterialFileName(nodeName, "input-image"), materialOrder },
    nodeName,
  };
  useGraphStore.getState().addNode(node);
  const edge: CanvasEdge = {
    id: uuid(), from: sourceNodeId, to: newId,
    fromPort: "default", toPort: "default", inputType: "default",
  };
  useGraphStore.getState().addEdge(edge);
  setNodes((nds) => [...nds, toXyNode(node)]);
  setEdges((eds) => [...eds, toXyEdge(edge)]);
}

// Render only strokes on canvas (NO upstream image overlay)
function renderStrokesToCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: CanvasStroke[],
  backgroundColor: string,
  canvasWidth: number,
  canvasHeight: number,
  bgImage?: HTMLImageElement | null,
  backgroundFit?: "contain" | "cover" | "stretch",
  backgroundImageUrl?: string,
): void {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw background image if present
  if (bgImage && backgroundImageUrl) {
    const imgW = bgImage.naturalWidth;
    const imgH = bgImage.naturalHeight;
    let dx = 0, dy = 0, dw = canvasWidth, dh = canvasHeight;
    const fit = backgroundFit ?? "contain";

    if (fit === "contain") {
      const scale = Math.min(canvasWidth / imgW, canvasHeight / imgH);
      dw = imgW * scale; dh = imgH * scale;
      dx = (canvasWidth - dw) / 2; dy = (canvasHeight - dh) / 2;
    } else if (fit === "cover") {
      const scale = Math.max(canvasWidth / imgW, canvasHeight / imgH);
      dw = imgW * scale; dh = imgH * scale;
      dx = (canvasWidth - dw) / 2; dy = (canvasHeight - dh) / 2;
    }
    ctx.drawImage(bgImage, dx, dy, dw, dh);
  }

  for (const cs of strokes) {
    const { stroke } = cs;
    const scaleX = canvasWidth / cs.canvasWidth;
    const scaleY = canvasHeight / cs.canvasHeight;
    const color = stroke.color === "eraser" ? backgroundColor : stroke.color;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (stroke.points.length < 2) {
      const pt = stroke.points[0];
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x * scaleX, pt.y * scaleY, (stroke.width * Math.min(scaleX, scaleY)) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Build prompt for canvas node using anchor text + canvas-specific semantic mapping
function buildCanvasPrompt(
  userPrompt: string,
  refBindings: RefBinding[],
  allNodes: { nodeId: string; nodeName: string; nodeType: string }[],
  mentionedNodes: MentionedNode[],
): string {
  const sceneBindings = refBindings.filter((b) => b.type === "场景");
  const colorBindings = refBindings.filter((b) => b.type !== "场景");
  const hasRefs = refBindings.length > 0 || mentionedNodes.length > 0;

  // Build color mappings for canvas anchor text
  const colorMappings = colorBindings.map((b) => {
    const colorName = BIND_COLORS.find((c) => c.hex === b.color)?.name ?? "";
    const refNode = allNodes.find((n) => n.nodeId === b.nodeId);
    const refName = refNode?.nodeName ?? b.nodeId;
    return { color: `${colorName}(${b.color})`, mention: `@${refName}`, category: b.type };
  });

  // Build anchor text with canvas-specific semantics
  const anchored = buildCanvasAnchorText(mentionedNodes, userPrompt, colorMappings);

  let prompt = "You are a professional AI film illustrator. Generate an image based on the sketch layout and reference materials below.\n\n";

  // Image structure explanation
  prompt += "【Image Structure】The input image is the user's hand-drawn sketch layout. Different colored lines mark the POSITION and POSE of each character/prop/effect.\n";
  if (hasRefs) {
    prompt += "Reference images are provided as separate full-resolution inputs — use them for the APPEARANCE of each element.\n\n";
  } else {
    prompt += "\n";
  }

  // Scene references
  if (sceneBindings.length > 0) {
    prompt += "【Scene References】\n";
    sceneBindings.forEach((b) => {
      const refNode = allNodes.find((n) => n.nodeId === b.nodeId);
      const refName = refNode?.nodeName ?? b.nodeId;
      prompt += `- @${refName}: use for environment, lighting, atmosphere, background composition. Do NOT render as a separate element.\n`;
    });
    prompt += "\n";
  }

  // Generation rules
  prompt += "【Generation Rules】\n";
  prompt += "1. POSITION/POSE: STRICTLY follow the colored sketch lines — where and how each element is placed\n";
  if (colorBindings.length > 0) {
    prompt += "2. APPEARANCE: Each element's look (face, clothing, proportions) MUST match its reference image\n";
    prompt += "3. Match colored sketch lines to references via the Color Mapping above\n";
  }
  if (sceneBindings.length > 0) {
    prompt += "4. Apply scene references for overall atmosphere, lighting, and background\n";
  }
  prompt += "5. Maintain the spatial relationships and composition proportions from the sketch\n";
  prompt += "6. Generate a complete, polished image — do NOT include the sketch lines in the output\n";
  prompt += "7. If sketch POSITION conflicts with reference APPEARANCE, sketch POSITION wins for layout; reference APPEARANCE wins for visual details\n";

  prompt += "\n" + anchored;
  return prompt;
}

// ── Component ──

export const CanvasNodeComponent = memo(function CanvasNodeComponent({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const addToast = useUIStore((s) => s.addToast);
  const { settings, updateSettings } = useNodeSettings<CanvasNodeSettings>(id);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes, setEdges: setXyEdges, getViewport } = useReactFlow();
  const upstream = useUpstreamNodes(id);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);

  // Drawing refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

  // Local state
  const [redoStack, setRedoStack] = useState<CanvasStroke[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [completedStatus, setCompletedStatus] = useState(false);
  const [brushColorOpen, setBrushColorOpen] = useState(false);
  const [bgColorOpen, setBgColorOpen] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const [refColorOpenId, setRefColorOpenId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [savedGeometry, setSavedGeometry] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Close color dropdowns on click outside
  useEffect(() => {
    if (!brushColorOpen && !bgColorOpen && !refColorOpenId) return;
    const handler = () => { setBrushColorOpen(false); setBgColorOpen(false); setRefColorOpenId(null); };
    const timer = setTimeout(() => document.addEventListener("pointerdown", handler, { once: true }), 0);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", handler); };
  }, [brushColorOpen, bgColorOpen, refColorOpenId]);

  // @-mention autocomplete state
  const [atQuery, setAtQuery] = useState<{ index: number; text: string } | null>(null);
  const [mentionMenuPosition, setMentionMenuPosition] = useState<CaretMenuPosition | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const allNodes = useGraphStore((s) => s.nodes);

  // Split upstream: image/video refs vs text-only sources
  const upstreamImageRefs = useMemo(
    () => upstream.filter((u) =>
      u.nodeType === "input-image" || u.nodeType === "gen-image" || u.nodeType === "video-input",
    ),
    [upstream],
  );
  const upstreamTextSources = useMemo(
    () => upstream.filter((u) => u.nodeType === "text-node"),
    [upstream],
  );

  const mentionableNodes = useMemo(
    () => getMentionableNodes(allNodes, id).filter(
      (n) => ["input-image", "gen-image", "video-input", "audio-input"].includes(n.nodeType),
    ),
    [allNodes, id],
  );

  const filteredMentions = useMemo(() => {
    if (!atQuery) return [];
    const q = atQuery.text.toLowerCase();
    return mentionableNodes.filter((n) => n.nodeName.toLowerCase().includes(q));
  }, [atQuery, mentionableNodes]);

  const insertMention = useCallback((refName: string) => {
    const currentText = promptRef.current?.value ?? settings.canvasPrompt;
    const selection = readTextareaSelection(promptRef.current, currentText.length);
    const { nextText: newVal, cursor } = insertMentionAtSelection(currentText, refName, selection, atQuery);

    // Auto-connect: find the mentioned node and create edge if not connected
    const mentionedNode = mentionableNodes.find((n) => n.nodeName === refName);
    let newRefBindings = settings.refBindings;
    if (mentionedNode) {
      const existingEdges = useGraphStore.getState().edges;
      const alreadyConnected = existingEdges.some(
        (e) => e.from === mentionedNode.nodeId && e.to === id,
      );
      if (!alreadyConnected) {
        const edge: CanvasEdge = {
          id: uuid(), from: mentionedNode.nodeId, to: id,
          fromPort: "default", toPort: "default", inputType: "default",
        };
        useGraphStore.getState().addEdge(edge);
        setXyEdges((eds) => [...eds, toXyEdge(edge)]);

        // Auto-create refBinding with unused color
        const existingBinding = settings.refBindings.find((b) => b.nodeId === mentionedNode.nodeId);
        if (!existingBinding) {
          const usedColors = new Set(settings.refBindings.map((b) => b.color));
          const color = BIND_COLORS.find((c) => !usedColors.has(c.hex))?.hex ?? BIND_COLORS[0].hex;
          newRefBindings = [...settings.refBindings, { nodeId: mentionedNode.nodeId, type: "角色", color }];
        }
      }
    }

    updateSettings({ canvasPrompt: newVal, ...(newRefBindings !== settings.refBindings ? { refBindings: newRefBindings } : {}) });
    setAtQuery(null);
    setMentionMenuPosition(null);
    restoreTextareaSelection(promptRef.current, cursor);
  }, [atQuery, settings.canvasPrompt, settings.refBindings, updateSettings, mentionableNodes, id, setXyEdges]);

  // Style helpers
  const inputStyle = useMemo(() => ({
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  }), [isDark]);
  const mutedColor = isDark ? "#a1a1aa" : "#71717a";
  const textColor = isDark ? "#e4e4e7" : "#18181b";

  // Model options — prefer API models over static list
  const imageModelOptions = useMemo(() => {
    const dynamic = remoteModels.filter((m) => m.type === "image");
    if (dynamic.length > 0) return dynamic.map((m) => ({ id: m.id, label: m.name }));
    // If API returned models but none classified as image, show all non-video/non-chat models
    const maybeImage = remoteModels.filter((m) => m.type !== "video" && m.type !== "chat");
    if (maybeImage.length > 0) return maybeImage.map((m) => ({ id: m.id, label: m.name }));
    return IMAGE_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.provider})` }));
  }, [remoteModels]);

  // Auto-fix invalid model — fall back to first available image model
  const effectiveModel = useMemo(() => {
    if (imageModelOptions.some((m) => m.id === settings.model)) return settings.model;
    return imageModelOptions[0]?.id ?? "gpt-image-2";
  }, [settings.model, imageModelOptions]);


  // Generation status for BaseNode header
  const generationStatus = useMemo(() => {
    if (generating) return "generating" as const;
    if (completedStatus) return "completed" as const;
    return null;
  }, [generating, completedStatus]);

  // Auto-clear completed status after 3 seconds
  useEffect(() => {
    if (!completedStatus) return;
    const timer = setTimeout(() => setCompletedStatus(false), 3000);
    return () => clearTimeout(timer);
  }, [completedStatus]);

  // Auto-resize prompt textarea
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [settings.canvasPrompt]);

  // ── Maximize / Restore ──
  const handleToggleMaximize = useCallback(() => {
    const currentNode = useGraphStore.getState().nodes.find((n) => n.id === id);
    if (!currentNode) return;

    if (isMaximized) {
      if (savedGeometry) {
        useGraphStore.getState().updateNode(id, {
          x: savedGeometry.x, y: savedGeometry.y,
          width: savedGeometry.w, height: savedGeometry.h,
        });
        setXyNodes((nds) => nds.map((n) => n.id === id ? {
          ...n,
          position: { x: savedGeometry.x, y: savedGeometry.y },
          style: { ...n.style, width: savedGeometry.w },
          data: { ...n.data, width: savedGeometry.w, height: savedGeometry.h },
        } : n));
      }
      setIsMaximized(false);
      setSavedGeometry(null);
    } else {
      setSavedGeometry({ x: currentNode.x, y: currentNode.y, w: currentNode.width, h: currentNode.height });

      const rfEl = document.querySelector(".react-flow");
      const rect = rfEl?.getBoundingClientRect();
      const padding = 10;
      const screenW = (rect?.width ?? 1200) - padding * 2;
      const screenH = (rect?.height ?? 800) - padding * 2;

      const viewport = getViewport();
      const flowX = (padding - viewport.x) / viewport.zoom;
      const flowY = (padding - viewport.y) / viewport.zoom;
      const flowW = screenW / viewport.zoom;
      const flowH = screenH / viewport.zoom;

      useGraphStore.getState().updateNode(id, { x: flowX, y: flowY, width: flowW, height: flowH });
      setXyNodes((nds) => nds.map((n) => n.id === id ? {
        ...n,
        position: { x: flowX, y: flowY },
        style: { ...n.style, width: flowW },
        data: { ...n.data, width: flowW, height: flowH },
      } : n));

      setIsMaximized(true);
    }
  }, [id, isMaximized, savedGeometry, setXyNodes, getViewport]);

  // ── Reference binding helpers ──

  const selectRef = useCallback((nodeId: string) => {
    updateSettings({ selectedRefId: nodeId });
    const existing = settings.refBindings.find((b) => b.nodeId === nodeId);
    if (existing && existing.type !== "场景") {
      updateSettings({ brushColor: existing.color, tool: "brush" });
    }
  }, [settings.refBindings, updateSettings]);



  // Insert reference tag into prompt — use node name as unified @引用标识
  const insertRefTag = useCallback((binding: RefBinding) => {
    const refNode = allNodes.find((n) => n.id === binding.nodeId);
    const refName = refNode?.nodeName ?? binding.nodeId;
    const currentText = promptRef.current?.value ?? settings.canvasPrompt;
    const selection = readTextareaSelection(promptRef.current, currentText.length);
    const { nextText, cursor } = insertMentionAtSelection(currentText, refName, selection);
    updateSettings({ canvasPrompt: nextText });
    restoreTextareaSelection(promptRef.current, cursor);
  }, [settings.canvasPrompt, allNodes, updateSettings]);

  const removeCanvasReference = useCallback((ref: { nodeId: string; nodeName?: string; edgeId?: string }) => {
    if (ref.edgeId) {
      useGraphStore.getState().removeEdge(ref.edgeId);
      setXyEdges((eds) => eds.filter((edge) => edge.id !== ref.edgeId));
    } else {
      const matchingEdges = useGraphStore.getState().edges.filter((edge) => edge.to === id && edge.from === ref.nodeId);
      for (const edge of matchingEdges) useGraphStore.getState().removeEdge(edge.id);
      setXyEdges((eds) => eds.filter((edge) => !(edge.target === id && edge.source === ref.nodeId)));
    }

    const refName = ref.nodeName ?? allNodes.find((n) => n.id === ref.nodeId)?.nodeName ?? ref.nodeId;
    const nextPrompt = stripReferenceMention(settings.canvasPrompt, refName);
    const nextBindings = settings.refBindings.filter((binding) => binding.nodeId !== ref.nodeId);
    updateSettings({
      canvasPrompt: nextPrompt,
      refBindings: nextBindings,
      ...(settings.selectedRefId === ref.nodeId ? { selectedRefId: "" } : {}),
    });
  }, [allNodes, id, settings.canvasPrompt, settings.refBindings, settings.selectedRefId, setXyEdges, updateSettings]);

  // Clean up bindings for upstream nodes that no longer exist
  useEffect(() => {
    const upstreamIds = new Set(upstreamImageRefs.map((u) => u.nodeId));
    const validBindings = settings.refBindings.filter((b) => upstreamIds.has(b.nodeId));
    if (validBindings.length !== settings.refBindings.length) {
      updateSettings({ refBindings: validBindings });
    }
    if (settings.selectedRefId && !upstreamIds.has(settings.selectedRefId)) {
      updateSettings({ selectedRefId: "" });
    }
  }, [upstreamImageRefs, settings.refBindings, settings.selectedRefId, updateSettings]);

  // ── Canvas sizing & rendering ──

  const [containerWidth, setContainerWidth] = useState(556);

  const canvasDisplayHeight = useMemo(() => {
    if (settings.ratio === "native") return 220;
    const parts = settings.ratio.split(":");
    const rw = parseInt(parts[0]);
    const rh = parseInt(parts[1]);
    if (isNaN(rw) || isNaN(rh) || rw <= 0 || rh <= 0) return 220;
    const height = Math.round(containerWidth * rh / rw);
    return Math.min(Math.max(height, 150), isMaximized ? 4000 : 320);
  }, [settings.ratio, containerWidth, isMaximized]);

  const ensureCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w <= 0 || h <= 0) return null;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return ctx;
  }, []);

  const renderAllStrokes = useCallback(() => {
    const ctx = ensureCanvasSize();
    if (!ctx) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    renderStrokesToCanvas(ctx, settings.strokes, settings.backgroundColor, canvas.width / dpr, canvas.height / dpr, bgImage, settings.backgroundFit, settings.backgroundImageUrl);
  }, [ensureCanvasSize, settings.strokes, settings.backgroundColor, settings.backgroundImageUrl, settings.backgroundFit, bgImage]);

  useEffect(() => { renderAllStrokes(); }, [renderAllStrokes]);

  // Load background image from data URL
  useEffect(() => {
    if (!settings.backgroundImageUrl) { setBgImage(null); return; }
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = settings.backgroundImageUrl;
  }, [settings.backgroundImageUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(Math.round(entry.contentRect.width));
      renderAllStrokes();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [renderAllStrokes]);

  // ── Drawing handlers ──

  const getCanvasPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drawingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pos = getCanvasPos(e);
    currentStrokeRef.current = [pos];
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const color = settings.tool === "eraser" ? settings.backgroundColor : settings.brushColor;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, settings.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [getCanvasPos, settings.tool, settings.brushColor, settings.backgroundColor, settings.brushSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    currentStrokeRef.current.push(pos);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const points = currentStrokeRef.current;
    const color = settings.tool === "eraser" ? settings.backgroundColor : settings.brushColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = settings.brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const prev = points[points.length - 2];
    if (prev) {
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }, [getCanvasPos, settings.tool, settings.brushColor, settings.backgroundColor, settings.brushSize]);

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (currentStrokeRef.current.length >= 1 && canvas) {
      const doodleStroke: DoodleStroke = {
        id: uuid(),
        points: [...currentStrokeRef.current],
        color: settings.tool === "eraser" ? "eraser" : settings.brushColor,
        width: settings.brushSize,
      };
      const dpr = window.devicePixelRatio || 1;
      const cs: CanvasStroke = {
        stroke: doodleStroke,
        canvasWidth: canvas.width / dpr,
        canvasHeight: canvas.height / dpr,
      };
      updateSettings({ strokes: [...settings.strokes, cs] });
      setRedoStack([]);
    }
    currentStrokeRef.current = [];
    renderAllStrokes();
  }, [settings.tool, settings.brushColor, settings.brushSize, settings.strokes, updateSettings, renderAllStrokes]);

  // ── Undo / Redo ──

  const handleUndo = useCallback(() => {
    if (settings.strokes.length === 0) return;
    const last = settings.strokes[settings.strokes.length - 1];
    updateSettings({ strokes: settings.strokes.slice(0, -1) });
    setRedoStack((prev) => [...prev, last]);
  }, [settings.strokes, updateSettings]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const stroke = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    updateSettings({ strokes: [...settings.strokes, stroke] });
  }, [redoStack, settings.strokes, updateSettings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (useGraphStore.getState().selectedNodeId !== id) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [id, handleUndo, handleRedo]);

  // ── Clear canvas ──

  const handleClearCanvas = useCallback(() => {
    updateSettings({ strokes: [] });
    setRedoStack([]);
    setError("");
  }, [updateSettings]);

  // ── Save canvas as image node ──

  const handleSaveAsImageNode = useCallback(() => {
    const displayCanvas = canvasRef.current;
    if (!displayCanvas) return;
    const dataUrl = displayCanvas.toDataURL("image/png");
    if (!dataUrl) { setError("画布导出失败"); return; }
    const currentNode = useGraphStore.getState().nodes.find((n) => n.id === id);
    if (!currentNode) return;
    createImageNodeOnCanvas(dataUrl, id, currentNode.x, currentNode.y, currentNode.width, setXyNodes, setXyEdges);
    addToast("success", "画板已保存为图片节点");
  }, [id, setXyNodes, setXyEdges, addToast]);

  // ── Export & Generation ──

  const exportCanvasToDataUrl = useCallback((): string => {
    const displayCanvas = canvasRef.current;
    if (!displayCanvas) return "";
    const isNative = settings.ratio === "native";
    let exportW: number, exportH: number;
    if (isNative) { exportW = displayCanvas.width; exportH = displayCanvas.height; }
    else { const px = ratioToPixelSize(settings.ratio, 1024); exportW = px.w; exportH = px.h; }
    const offscreen = document.createElement("canvas");
    offscreen.width = exportW;
    offscreen.height = exportH;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return "";
    renderStrokesToCanvas(ctx, settings.strokes, settings.backgroundColor, exportW, exportH, bgImage, settings.backgroundFit, settings.backgroundImageUrl);
    return offscreen.toDataURL("image/png");
  }, [settings.strokes, settings.backgroundColor, settings.ratio, settings.backgroundImageUrl, settings.backgroundFit, bgImage]);

  const handleGenerate = useCallback(async () => {
    if (!settings.canvasPrompt.trim() && settings.strokes.length === 0) {
      setError("请先绘制内容或输入提示词");
      return;
    }

    setGenerating(true);
    setCompletedStatus(false);
    setError("");

    const isNative = settings.ratio === "native";
    let exportW: number, exportH: number;
    if (isNative) { const c = canvasRef.current; exportW = c?.width ?? 1024; exportH = c?.height ?? 1024; }
    else { const px = ratioToPixelSize(settings.ratio, 1024); exportW = px.w; exportH = px.h; }
    const apiSize = `${toMultipleOf16(exportW)}x${toMultipleOf16(exportH)}`;

    // Build composite image (sketch + reference strip)
    // Resolve @mentions: include mentioned images as additional references
    const liveNodes = useGraphStore.getState().nodes;
    const mentionResults = parseMentions(settings.canvasPrompt, liveNodes);
    const mentionedImages = mentionResults
      .filter((m) => {
        const node = liveNodes.find((n) => n.id === m.nodeId);
        return node && (node.type === "input-image" || node.type === "gen-image") && node.content;
      })
      .map((m) => ({ nodeId: m.nodeId, nodeName: m.nodeName, content: liveNodes.find((n) => n.id === m.nodeId)!.content }));

    // Only image-type upstream refs (text nodes contribute prompt only, not images)
    const liveUpstreamImageRefs = upstreamImageRefs.map((u) => ({ nodeId: u.nodeId, content: u.content ?? "" }));

    // Merge text from connected text nodes into the prompt
    const textParts = upstreamTextSources
      .map((u) => u.prompt || u.content)
      .filter(Boolean);
    const mergedCanvasPrompt = textParts.length > 0
      ? textParts.join("\n") + "\n" + settings.canvasPrompt
      : settings.canvasPrompt;

    // Export sketch canvas only (strokes + background color)
    // Reference images are now passed separately via referenceImages[]
    const sketchDataUrl = exportCanvasToDataUrl();
    if (!sketchDataUrl) { setError("画布导出失败"); setGenerating(false); return; }

    // Collect ALL referenced image resources for API — must be sent separately
    const allRefImageUrls: string[] = [];
    // From @mentions in prompt
    for (const m of mentionedImages) {
      if (m.content && !allRefImageUrls.includes(m.content)) allRefImageUrls.push(m.content);
    }
    // From refBindings (color-bound references)
    for (const b of settings.refBindings) {
      const refNode = liveNodes.find((n) => n.id === b.nodeId);
      if (refNode?.content && !allRefImageUrls.includes(refNode.content)) allRefImageUrls.push(refNode.content);
    }
    // From upstream image edge connections only (exclude text nodes)
    for (const u of liveUpstreamImageRefs) {
      if (u.content && !allRefImageUrls.includes(u.content)) allRefImageUrls.push(u.content);
    }

    // Build prompt with anchor text (use merged prompt that includes text node content)
    const fullPrompt = buildCanvasPrompt(
      mergedCanvasPrompt, settings.refBindings,
      settings.refBindings.map((b) => {
        const n = allNodes.find((n) => n.id === b.nodeId);
        return { nodeId: b.nodeId, nodeName: n?.nodeName ?? b.nodeId, nodeType: n?.type ?? "" };
      }),
      mentionResults,
    );

    const jobId = addJob({
      id: uuid(), nodeId: id, type: "canvas-gen-image",
      taskId: "", status: "running", progress: 0, createdAt: Date.now(),
    });

    const createOutputNode = (imageUrl: string) => {
      const currentNode = useGraphStore.getState().nodes.find((n) => n.id === id);
      if (currentNode) createImageNodeOnCanvas(imageUrl, id, currentNode.x, currentNode.y, currentNode.width, setXyNodes, setXyEdges);
    };

    try {
      const result = await generateImage({
        model: effectiveModel,
        prompt: fullPrompt,
        referenceImage: sketchDataUrl,
        referenceImages: allRefImageUrls.length > 0 ? allRefImageUrls : undefined,
        n: 1,
        size: apiSize,
      });

      if (result.status === "succeeded" && result.imageUrl) {
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.imageUrl });
        createOutputNode(result.imageUrl);
        addToast("success", "画板生成完成");
        setGenerating(false);
        setCompletedStatus(true);
      } else if (result.taskId) {
        updateJob(jobId, { taskId: result.taskId });
        const pollInterval = setInterval(async () => {
          try {
            const pollResult = await pollTask(result.taskId);
            if (pollResult.status === "succeeded" && pollResult.imageUrl) {
              clearInterval(pollInterval);
              updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: pollResult.imageUrl });
              createOutputNode(pollResult.imageUrl);
              addToast("success", "画板生成完成");
              setGenerating(false);
              setCompletedStatus(true);
            } else if (pollResult.status === "failed") {
              clearInterval(pollInterval);
              updateJob(jobId, { status: "failed", error: pollResult.error });
              setError(pollResult.error || "生成失败");
              setGenerating(false);
            }
          } catch { /* keep polling */ }
        }, 3000);
        setTimeout(() => clearInterval(pollInterval), 300000);
      } else {
        updateJob(jobId, { status: "failed", error: "无法解析生成结果" });
        setError("无法解析生成结果");
        setGenerating(false);
      }
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : "生成失败" });
      setError(err instanceof Error ? err.message : "生成失败");
      setGenerating(false);
    }
  }, [id, settings.canvasPrompt, effectiveModel, settings.ratio, settings.strokes, settings.backgroundColor, settings.refBindings, upstreamImageRefs, upstreamTextSources, exportCanvasToDataUrl, addJob, updateJob, setXyNodes, setXyEdges, addToast]);

  // ── Render ──

  return (
    <BaseNode id={id} type="canvas-node" selected={selected} generationStatus={generationStatus}
      titleCenter={
        <span className="text-[10px] font-medium tracking-wide"
          style={{
            background: "linear-gradient(90deg, #f97316, #eab308)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
          嘎嘎鸿赞助
        </span>
      }
      actions={
        <button type="button" onClick={handleToggleMaximize}
          className="text-[10px] px-1 py-0.5 rounded nodrag"
          style={{ color: isDark ? "#a1a1aa" : "#71717a", background: isDark ? "#3f3f46" : "#e4e4e7" }}
          title={isMaximized ? "恢复" : "最大化"}>
          {isMaximized ? "⤓" : "⤢"}
        </button>
      }>
      <div className="flex flex-col gap-1.5">
        {/* Toolbar — consolidated single row */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* Tool buttons */}
          <button type="button" onClick={() => updateSettings({ tool: "brush" })}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium nodrag"
            style={{ background: settings.tool === "brush" ? "#3b82f6" : inputStyle.background, color: settings.tool === "brush" ? "#fff" : mutedColor, border: `1px solid ${settings.tool === "brush" ? "#3b82f6" : inputStyle.borderColor}` }}>
            画笔
          </button>
          <button type="button" onClick={() => updateSettings({ tool: "eraser" })}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium nodrag"
            style={{ background: settings.tool === "eraser" ? "#ef4444" : inputStyle.background, color: settings.tool === "eraser" ? "#fff" : mutedColor, border: `1px solid ${settings.tool === "eraser" ? "#ef4444" : inputStyle.borderColor}` }}>
            橡皮擦
          </button>
          <div className="w-px h-3.5" style={{ background: inputStyle.borderColor }} />

          {/* Brush size: circle preview + slider + number */}
          <div className="flex items-center gap-0.5 nodrag">
            <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
              <circle cx="7" cy="7"
                r={Math.max(1.5, Math.min(6, settings.brushSize / 2))}
                fill={settings.tool === "brush" ? settings.brushColor : "#ef4444"}
                stroke={isDark ? "#52525b" : "#a1a1aa"} strokeWidth="0.5" />
            </svg>
            <input type="range" title="笔刷大小" min={1} max={64} value={settings.brushSize}
              onChange={(e) => updateSettings({ brushSize: Number(e.target.value) })}
              className="w-12 h-1 nodrag cursor-pointer" style={{ accentColor: "#3b82f6" }} />
            <span className="text-[10px] font-mono font-medium shrink-0" style={{ color: textColor, minWidth: 14, textAlign: "center" }}>{settings.brushSize}</span>
          </div>
          <div className="w-px h-3.5" style={{ background: inputStyle.borderColor }} />

          {/* Brush color dropdown */}
          <div className="relative">
            <button type="button"
              onClick={() => { setBrushColorOpen(!brushColorOpen); setBgColorOpen(false); }}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded border nodrag text-[9px]"
              style={inputStyle}>
              画笔颜色
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: settings.brushColor, border: "1px solid rgba(0,0,0,0.2)" }} />
              <span style={{ color: mutedColor, fontSize: 7 }}>▼</span>
            </button>
            {brushColorOpen && (
              <div className="absolute top-full left-0 mt-0.5 z-50 p-1 rounded border shadow-lg nodrag"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ background: isDark ? "#27272a" : "#ffffff", borderColor: isDark ? "#3f3f46" : "#d4d4d8", minWidth: 96 }}>
                <div className="grid grid-cols-4 gap-0.5">
                  {COLOR_PALETTE.map((hex) => (
                    <button key={hex} type="button" title={`画笔颜色 ${hex}`}
                      onClick={() => { updateSettings({ brushColor: hex, tool: "brush" }); setBrushColorOpen(false); }}
                      className="w-5 h-5 rounded-sm nodrag"
                      style={{
                        background: hex,
                        border: settings.brushColor === hex ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.15)",
                        boxShadow: settings.brushColor === hex ? "0 0 0 1px #3b82f6" : "none",
                      }} />
                  ))}
                </div>
                <input type="color" title="自定义颜色" value={settings.brushColor}
                  onChange={(e) => { updateSettings({ brushColor: e.target.value, tool: "brush" }); setBrushColorOpen(false); }}
                  className="w-full h-5 mt-0.5 rounded nodrag cursor-pointer p-0 block" style={{ border: `1px solid ${inputStyle.borderColor}` }} />
              </div>
            )}
          </div>

          {/* Background color dropdown */}
          <div className="relative">
            <button type="button"
              onClick={() => { setBgColorOpen(!bgColorOpen); setBrushColorOpen(false); }}
              className="flex items-center gap-0.5 px-1 py-0.5 rounded border nodrag text-[9px]"
              style={inputStyle}>
              画板底色
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: settings.backgroundColor, border: "1px solid rgba(0,0,0,0.2)" }} />
              <span style={{ color: mutedColor, fontSize: 7 }}>▼</span>
            </button>
            {bgColorOpen && (
              <div className="absolute top-full left-0 mt-0.5 z-50 p-1 rounded border shadow-lg nodrag"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ background: isDark ? "#27272a" : "#ffffff", borderColor: isDark ? "#3f3f46" : "#d4d4d8", minWidth: 96 }}>
                <div className="grid grid-cols-4 gap-0.5">
                  {COLOR_PALETTE.map((hex) => (
                    <button key={hex} type="button" title={`画板底色 ${hex}`}
                      onClick={() => { updateSettings({ backgroundColor: hex }); setBgColorOpen(false); }}
                      className="w-5 h-5 rounded-sm nodrag"
                      style={{
                        background: hex,
                        border: settings.backgroundColor === hex ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.15)",
                        boxShadow: settings.backgroundColor === hex ? "0 0 0 1px #3b82f6" : "none",
                      }} />
                  ))}
                </div>
                <input type="color" title="自定义底色" value={settings.backgroundColor}
                  onChange={(e) => { updateSettings({ backgroundColor: e.target.value }); setBgColorOpen(false); }}
                  className="w-full h-5 mt-0.5 rounded nodrag cursor-pointer p-0 block" style={{ border: `1px solid ${inputStyle.borderColor}` }} />
              </div>
            )}
          </div>

          {/* Background image upload */}
          <button type="button"
            onClick={() => bgImageInputRef.current?.click()}
            className="text-[10px] px-1.5 py-0.5 rounded nodrag"
            title="上传背景图"
            style={{ background: inputStyle.background, color: settings.backgroundImageUrl ? "#22c55e" : mutedColor, border: `1px solid ${inputStyle.borderColor}` }}>
            背景图
          </button>
          {settings.backgroundImageUrl && (
            <>
              <button type="button"
                onClick={() => updateSettings({ backgroundImageUrl: "" })}
                className="text-[10px] px-1 py-0.5 rounded nodrag"
                title="清除背景图"
                style={{ background: inputStyle.background, color: "#ef4444", border: `1px solid ${inputStyle.borderColor}` }}>
                X
              </button>
              <select value={settings.backgroundFit}
                onChange={(e) => updateSettings({ backgroundFit: e.target.value as "contain" | "cover" | "stretch" })}
                title="背景图适配模式"
                aria-label="背景图适配模式"
                className="text-[9px] px-1 py-0.5 rounded border nodrag"
                style={inputStyle}>
                <option value="contain">适应</option>
                <option value="cover">填充</option>
                <option value="stretch">拉伸</option>
              </select>
            </>
          )}
          <input ref={bgImageInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                updateSettings({ backgroundImageUrl: ev.target?.result as string });
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }} />

          <div className="w-px h-3.5" style={{ background: inputStyle.borderColor }} />

          {/* Undo / Redo */}
          <button type="button" onClick={handleUndo} disabled={settings.strokes.length === 0}
            className="text-[10px] px-1 py-0.5 rounded nodrag" title="撤销 (Ctrl+Z)"
            style={{ background: inputStyle.background, color: settings.strokes.length === 0 ? (isDark ? "#52525b" : "#d4d4d8") : textColor, border: `1px solid ${inputStyle.borderColor}` }}>
            ↩
          </button>
          <button type="button" onClick={handleRedo} disabled={redoStack.length === 0}
            className="text-[10px] px-1 py-0.5 rounded nodrag" title="重做 (Ctrl+Y)"
            style={{ background: inputStyle.background, color: redoStack.length === 0 ? (isDark ? "#52525b" : "#d4d4d8") : textColor, border: `1px solid ${inputStyle.borderColor}` }}>
            ↪
          </button>
          <div className="w-px h-3.5" style={{ background: inputStyle.borderColor }} />

          {/* Clear / Save */}
          <button type="button" onClick={handleClearCanvas} disabled={settings.strokes.length === 0}
            className="text-[10px] px-1.5 py-0.5 rounded nodrag" title="清空画板"
            style={{ background: inputStyle.background, color: settings.strokes.length === 0 ? (isDark ? "#52525b" : "#d4d4d8") : "#ef4444", border: `1px solid ${inputStyle.borderColor}` }}>
            清空
          </button>
          <button type="button" onClick={handleSaveAsImageNode}
            className="text-[10px] px-1.5 py-0.5 rounded nodrag" title="另存为图片节点"
            style={{ background: inputStyle.background, color: "#8b5cf6", border: `1px solid ${inputStyle.borderColor}` }}>
            另存
          </button>
        </div>

        {/* ── Reference thumbnails section (image refs only) ── */}
        {upstreamImageRefs.length > 0 && (
          <div className="rounded border p-1.5" style={{ borderColor: inputStyle.borderColor, background: isDark ? "#18181b" : "#fafafa" }}>
            <div className="text-[9px] mb-1 font-medium" style={{ color: mutedColor }}>参考素材（点击选中 → 选类型 → 选颜色 → 画布绘制）</div>
            <div className="flex gap-1.5 flex-wrap">
              {upstreamImageRefs.map((ref) => {
                const binding = settings.refBindings.find((b) => b.nodeId === ref.nodeId);
                const isSelected = settings.selectedRefId === ref.nodeId;
                const isScene = binding?.type === "场景";
                return (
                  <div key={ref.edgeId}
                    className="relative rounded border nodrag cursor-pointer"
                    onClick={() => selectRef(ref.nodeId)}
                    style={{
                      borderColor: isSelected ? "#3b82f6" : inputStyle.borderColor,
                      background: isSelected ? (isDark ? "#27272a" : "#eff6ff") : inputStyle.background,
                      padding: 3,
                    }}>
                    <button
                      type="button"
                      className="absolute nodrag"
                      title={`删除引用 ${ref.nodeName || ref.nodeId}`}
                      aria-label={`删除引用 ${ref.nodeName || ref.nodeId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCanvasReference(ref);
                      }}
                      style={{
                        top: -5,
                        right: -5,
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        border: `1px solid ${isDark ? "#27272a" : "#ffffff"}`,
                        background: isDark ? "#18181b" : "#ffffff",
                        color: "#ef4444",
                        fontSize: 10,
                        lineHeight: 1,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      X
                    </button>
                    {/* Thumbnail */}
                    {ref.content ? (
                      <img src={ref.content} alt="参考" className="w-10 h-10 object-cover rounded" style={{ pointerEvents: "none" }} />
                    ) : (
                      <div className="w-10 h-10 rounded flex items-center justify-center text-[8px]" style={{ background: inputStyle.background, color: mutedColor }}>无图</div>
                    )}
                    {/* Row 1: Type select */}
                    <select title="选择类型" value={binding?.type ?? ""}
                      onChange={(e) => {
                        const type = e.target.value as RefCategory;
                        const newBindings = (() => {
                          const existing = settings.refBindings.find((b) => b.nodeId === ref.nodeId);
                          const usedColors = new Set(settings.refBindings.filter((b) => b.nodeId !== ref.nodeId).map((b) => b.color));
                          const autoColor = type === "场景" ? "" : (existing?.color && !usedColors.has(existing.color) ? existing.color : BIND_COLORS.find((c) => !usedColors.has(c.hex))?.hex ?? BIND_COLORS[0].hex);
                          if (existing) {
                            return settings.refBindings.map((b) => b.nodeId === ref.nodeId ? { ...b, type, color: autoColor } : b);
                          }
                          return [...settings.refBindings, { nodeId: ref.nodeId, type, color: autoColor }];
                        })();
                        updateSettings({ refBindings: newBindings });
                        if (type !== "场景") {
                          const color = newBindings.find((b) => b.nodeId === ref.nodeId)?.color;
                          if (color) updateSettings({ brushColor: color, tool: "brush" });
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-[8px] px-0.5 py-0 rounded border mt-0.5 nodrag"
                      style={{
                        ...inputStyle, fontSize: 8,
                        borderLeft: isScene ? "3px solid #22c55e" : binding && binding.color ? `3px solid ${binding.color}` : undefined,
                      }}>
                      <option value="" disabled>类型</option>
                      {REF_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    {/* Row 2: Color — full-fill button + popup (hidden for scene) */}
                    {binding && !isScene && (
                      <div className="relative mt-0.5">
                        <button type="button" title="选择颜色"
                          onClick={(e) => { e.stopPropagation(); setRefColorOpenId(refColorOpenId === ref.nodeId ? null : ref.nodeId); setBrushColorOpen(false); setBgColorOpen(false); }}
                          className="w-full h-4 rounded border nodrag"
                          style={{ background: binding.color, borderColor: binding.color }}>
                        </button>
                        {refColorOpenId === ref.nodeId && (
                          <div className="absolute top-full left-0 mt-0.5 z-50 p-0.5 rounded border shadow-lg nodrag"
                            style={{ background: isDark ? "#27272a" : "#ffffff", borderColor: isDark ? "#3f3f46" : "#d4d4d8", minWidth: 90 }}>
                            <div className="grid grid-cols-4 gap-0.5">
                              {BIND_COLORS.map((c) => {
                                const isUsed = settings.refBindings.some((b) => b.color === c.hex && b.nodeId !== ref.nodeId);
                                return (
                                  <button key={c.hex} type="button" title={`颜色 ${c.name}${isUsed ? " (已占用)" : ""}`}
                                    disabled={isUsed}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newBindings = settings.refBindings.map((b) =>
                                        b.nodeId === ref.nodeId ? { ...b, color: c.hex } : b
                                      );
                                      updateSettings({ refBindings: newBindings, brushColor: c.hex, tool: "brush" });
                                      setRefColorOpenId(null);
                                    }}
                                    className="w-5 h-5 rounded-sm nodrag"
                                    style={{
                                      background: c.hex,
                                      opacity: isUsed ? 0.3 : 1,
                                      border: binding.color === c.hex ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.15)",
                                    }} />
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Text source indicator (text nodes pass prompt only, not as reference) ── */}
        {upstreamTextSources.length > 0 && (
          <div className="rounded border px-2 py-1 flex items-center gap-1" style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8", background: isDark ? "#27272a" : "#f4f4f5" }}>
            <span className="text-[9px]" style={{ color: "#3b82f6" }}>文字输入</span>
            {upstreamTextSources.map((u) => (
              <span key={u.edgeId} className="inline-flex items-center gap-1 text-[9px] max-w-[150px]" style={{ color: mutedColor }} title={u.prompt || u.content}>
                {u.prompt || u.content ? `"${(u.prompt || u.content).slice(0, 20)}..."` : "(空)"}
                <button
                  type="button"
                  className="nodrag"
                  title="删除文字引用"
                  aria-label="删除文字引用"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCanvasReference(u);
                  }}
                  style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, lineHeight: 1 }}
                >
                  X
                </button>
              </span>
            ))}
            <span className="text-[8px]" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>→ 提示词</span>
          </div>
        )}

        {/* I.5 — Canvas area with ratio-linked dimensions */}
        <div ref={containerRef} className="relative rounded border overflow-hidden nodrag"
          style={{
            height: canvasDisplayHeight,
            borderColor: inputStyle.borderColor,
          }}>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
            style={{ cursor: settings.tool === "eraser" ? "cell" : "crosshair" }}
            onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} />
        </div>

        {/* Model + Ratio */}
        <div className="flex items-center gap-1">
          <select value={effectiveModel} onChange={(e) => updateSettings({ model: e.target.value })}
            title="选择生成模型"
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none nodrag min-w-0" style={inputStyle}>
            {imageModelOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={settings.ratio} onChange={(e) => updateSettings({ ratio: e.target.value })}
            title="选择生成比例"
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none nodrag min-w-0" style={inputStyle}>
            {RATIO_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Prompt with @-mention */}
        <div className="relative">
          <textarea ref={promptRef} value={settings.canvasPrompt}
            onChange={(e) => {
              const selection = readTextareaSelection(e.target, e.target.value.length);
              updateSettings({ canvasPrompt: e.target.value });
              restoreTextareaSelection(promptRef.current, selection.start);
              const pos = selection.start;
              const textBefore = e.target.value.slice(0, pos);
              const atMatch = textBefore.match(/@([^\s@]*)$/);
              if (atMatch && mentionableNodes.length > 0) {
                setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
                setMentionMenuPosition(getCaretMenuPosition(e.target));
              } else {
                setAtQuery(null);
                setMentionMenuPosition(null);
              }
            }}
            onKeyDown={(e) => {
              if (atQuery && filteredMentions.length > 0 && e.key === "Enter") {
                e.preventDefault();
                const pick = filteredMentions[0];
                insertMention(pick.nodeName);
              }
              if (atQuery && e.key === "Escape") {
                setAtQuery(null);
                setMentionMenuPosition(null);
              }
            }}
            placeholder="输入提示词，@引用图片素材..."
            className="w-full text-[11px] px-2 py-1 rounded border outline-none resize-none nodrag overflow-hidden"
            style={{ minHeight: 44, ...inputStyle }} />
          {/* @-mention dropdown */}
          {atQuery && filteredMentions.length > 0 && (
            <div
              className="nodrag rounded-lg border shadow-lg overflow-hidden"
              style={caretMenuStyle(mentionMenuPosition, {
                background: isDark ? "#27272a" : "#ffffff",
                borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              })}>
              {filteredMentions.map((node) => {
                return (
                  <button key={node.nodeId} type="button"
                    className="flex items-center gap-1.5 w-full px-2 py-1 text-left nodrag"
                    style={{ color: isDark ? "#e4e4e7" : "#18181b" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isDark ? "#3f3f46" : "#f4f4f5"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    onClick={() => insertMention(node.nodeName)}>
                    {(node.nodeType === "input-image" || node.nodeType === "gen-image") && node.content && <img src={node.content} alt="" className="w-4 h-4 rounded object-cover" />}
                    {node.nodeType === "video-input" && <span className="text-[10px]" style={{ color: "#f97316" }}>▶</span>}
                    {node.nodeType === "audio-input" && <span className="text-[10px]" style={{ color: "#22c55e" }}>♪</span>}
                    <span className="text-[10px]" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>@{node.nodeName}</span>
                    <span className="text-[9px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>{NODE_TYPE_LABELS[node.nodeType as NodeType]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* I.3 — Reference chips for prompt insertion */}
        {settings.refBindings.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] shrink-0" style={{ color: mutedColor }}>插入引用:</span>
            {settings.refBindings.map((b) => {
                const refNode = allNodes.find((n) => n.id === b.nodeId);
                const refName = refNode?.nodeName ?? b.nodeId;
                return (
              <button key={b.nodeId} type="button"
                onClick={() => insertRefTag(b)}
                className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded nodrag shrink-0"
                title={`点击插入 @${refName} 到提示词`}
                style={{
                  background: b.type === "场景"
                    ? "rgba(34,197,94,0.15)"
                    : `${b.color}20`,
                  color: b.type === "场景" ? "#22c55e" : b.color,
                  border: `1px solid ${b.type === "场景" ? "rgba(34,197,94,0.3)" : b.color}`,
                }}>
                @{refName}
                <span
                  role="button"
                  aria-label={`删除引用 ${refName}`}
                  title={`删除引用 ${refName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCanvasReference({ nodeId: b.nodeId, nodeName: refName });
                  }}
                  style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, lineHeight: 1 }}
                >
                  X
                </span>
              </button>
                );
              })}
          </div>
        )}

        {/* Generate button */}
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium nodrag"
          style={{
            background: generating ? (isDark ? "#3f3f46" : "#d4d4d8") : "#3b82f6",
            color: generating ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "生成中..." : "生成图片"}
        </button>

        {/* Error */}
        {error && (
          <div className="text-[10px] px-1 py-0.5 rounded" style={{ color: "#ef4444", background: isDark ? "#27272a" : "#fef2f2" }}>
            {error}
          </div>
        )}
      </div>
    </BaseNode>
  );
});
