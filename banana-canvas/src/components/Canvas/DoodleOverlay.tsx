import { useCallback, useRef, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useUIStore } from "../../stores/uiStore";
import { useGraphStore } from "../../stores/graphStore";
import type { DoodleStroke } from "../../types/node";
import { v4 as uuid } from "uuid";

const DEFAULT_COLOR = "#ef4444";

export function DoodleOverlay() {
  const activeTool = useUIStore((s) => s.activeTool);
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const addDoodleStroke = useGraphStore((s) => s.addDoodleStroke);
  const strokes = useGraphStore((s) => s.canvasDoodleStrokes);

  const { screenToFlowPosition, flowToScreenPosition, getViewport } = useReactFlow();

  const drawingRef = useRef(false);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const colorRef = useRef(DEFAULT_COLOR);
  const widthRef = useRef(3);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isDrawing = activeTool === "brush" || activeTool === "eraser";

  const ensureCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return canvas.getContext("2d");
  }, []);

  const clientToCanvas = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const flowToCanvas = useCallback(
    (fx: number, fy: number) => {
      const screen = flowToScreenPosition({ x: fx, y: fy });
      return clientToCanvas(screen.x, screen.y);
    },
    [flowToScreenPosition, clientToCanvas],
  );

  const renderStrokes = useCallback(() => {
    const ctx = ensureCanvasSize();
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const { zoom } = getViewport();

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = stroke.color === "eraser" ? (isDark ? "#09090b" : "#f4f4f5") : stroke.color;
      ctx.lineWidth = stroke.width * zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = stroke.color === "eraser" ? 1 : 0.85;
      ctx.beginPath();
      const first = flowToCanvas(stroke.points[0].x, stroke.points[0].y);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p = flowToCanvas(stroke.points[i].x, stroke.points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [strokes, ensureCanvasSize, flowToCanvas, isDark, getViewport]);

  useEffect(() => {
    renderStrokes();
  }, [renderStrokes]);

  useEffect(() => {
    const vp = document.querySelector(".react-flow__viewport");
    if (!vp) return;
    const observer = new MutationObserver(() => renderStrokes());
    observer.observe(vp, { attributes: true, attributeFilter: ["transform"] });
    return () => observer.disconnect();
  }, [renderStrokes]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      e.stopPropagation();
      drawingRef.current = true;

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      pointsRef.current = [{ x: flowPos.x, y: flowPos.y }];
      colorRef.current = activeTool === "eraser" ? "eraser" : DEFAULT_COLOR;
      widthRef.current = activeTool === "eraser" ? 20 : 3;

      const ctx = ensureCanvasSize();
      if (ctx) {
        const { zoom } = getViewport();
        const pos = clientToCanvas(e.clientX, e.clientY);
        ctx.save();
        ctx.strokeStyle = colorRef.current === "eraser" ? (isDark ? "#09090b" : "#f4f4f5") : colorRef.current;
        ctx.lineWidth = widthRef.current * zoom;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    },
    [isDrawing, activeTool, screenToFlowPosition, ensureCanvasSize, clientToCanvas, getViewport, isDark],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      pointsRef.current.push({ x: flowPos.x, y: flowPos.y });

      const ctx = ensureCanvasSize();
      if (ctx) {
        const pos = clientToCanvas(e.clientX, e.clientY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    },
    [screenToFlowPosition, ensureCanvasSize, clientToCanvas],
  );

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    const ctx = ensureCanvasSize();
    if (ctx) {
      ctx.restore();
    }

    if (pointsRef.current.length >= 2) {
      const stroke: DoodleStroke = {
        id: uuid(),
        points: [...pointsRef.current],
        color: colorRef.current,
        width: widthRef.current,
      };
      addDoodleStroke(stroke);
    }
    pointsRef.current = [];
  }, [addDoodleStroke, ensureCanvasSize]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: isDrawing ? "auto" : "none",
        cursor: isDrawing ? (activeTool === "eraser" ? "cell" : "crosshair") : "default",
        zIndex: isDrawing ? 5 : 0,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
