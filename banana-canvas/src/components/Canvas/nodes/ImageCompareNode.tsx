import { memo, useMemo, useCallback, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useUIStore } from "../../../stores/uiStore";
import type { ImageCompareSettings } from "../../../types/settings";

export const ImageCompareNode = memo(function ImageCompareNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<ImageCompareSettings>(id);
  const mode = settings.mode ?? "slider";

  // Ensure mode is set if node was created before default settings were added
  if (!settings.mode) {
    const gs = useGraphStore.getState();
    const node = gs.nodes.find((n) => n.id === id);
    const nodeSettings = node?.settings as ImageCompareSettings | undefined;
    if (node && !(nodeSettings?.mode)) {
      gs.updateNode(id, { settings: { ...node.settings, mode: "slider" } });
    }
  }

  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);

  // Find upstream images: split by connection order — first = left, second = right
  const { leftImage, rightImage } = useMemo(() => {
    const incoming = edges.filter((e) => e.to === id);
    const images: string[] = [];
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.from);
      if (!src || !src.content) continue;
      if (src.type !== "input-image" && src.type !== "gen-image") continue;
      if (edge.toPort === "right") {
        return { leftImage: images[0] ?? null, rightImage: src.content };
      }
      images.push(src.content);
    }
    return { leftImage: images[0] ?? null, rightImage: images[1] ?? null };
  }, [edges, id, nodes]);

  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const dragging = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const hasAny = !!leftImage || !!rightImage;
  const hasBoth = !!leftImage && !!rightImage;

  const placeholder = (label: string) => (
    <div
      className="flex items-center justify-center"
      style={{
        height: 140,
        background: isDark ? "#09090b" : "#e4e4e7",
        border: `1px dashed ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        borderRadius: 8,
      }}
    >
      <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
        {label}
      </span>
    </div>
  );

  const s = (base: Record<string, string>) => ({
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
    ...base,
  });

  return (
    <BaseNode id={id} type="image-compare" selected={selected}>
      {/* Mode selector */}
      <div className="flex gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => updateSettings({ mode: "slider" })}
          className="flex-1 text-[10px] px-1.5 py-1 rounded border"
          style={mode === "slider" ? { background: "#3b82f6", color: "#fff", borderColor: "#3b82f6" } : s({})}
        >
          滑动对比
        </button>
        <button
          type="button"
          onClick={() => updateSettings({ mode: "side" })}
          className="flex-1 text-[10px] px-1.5 py-1 rounded border"
          style={mode === "side" ? { background: "#3b82f6", color: "#fff", borderColor: "#3b82f6" } : s({})}
        >
          并排对比
        </button>
      </div>

      {/* No images at all */}
      {!hasAny && placeholder("连接两张图片到左图/右图端口")}

      {/* Side-by-side mode */}
      {hasAny && mode === "side" && (
        <div className="flex gap-1 w-full">
          <div className="flex-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}` }}>
            <div className="text-[9px] px-1 py-0.5" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#a1a1aa" : "#71717a" }}>左图</div>
            {leftImage
              ? <img src={leftImage} alt="左图" className="w-full object-contain" style={{ maxHeight: 140 }} />
              : placeholder("未连接左图")}
          </div>
          <div className="flex-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}` }}>
            <div className="text-[9px] px-1 py-0.5" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#a1a1aa" : "#71717a" }}>右图</div>
            {rightImage
              ? <img src={rightImage} alt="右图" className="w-full object-contain" style={{ maxHeight: 140 }} />
              : placeholder("未连接右图")}
          </div>
        </div>
      )}

      {/* Slider mode — one image only */}
      {hasAny && !hasBoth && mode === "slider" && (
        <div className="w-full">
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}` }}>
            <div className="text-[9px] px-1 py-0.5" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#a1a1aa" : "#71717a" }}>
              {leftImage ? "左图" : "右图"}
            </div>
            <img
              src={(leftImage || rightImage)!}
              alt="预览"
              className="w-full object-contain"
              style={{ maxHeight: 140 }}
            />
          </div>
          <div className="text-[10px] mt-1 text-center" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
            滑动对比需要连接两张图片
          </div>
        </div>
      )}

      {/* Slider mode — both images overlaid */}
      {hasBoth && mode === "slider" && (
        <div
          ref={sliderRef}
          className="relative w-full rounded-lg overflow-hidden select-none"
          style={{
            border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
            background: isDark ? "#09090b" : "#e4e4e7",
            cursor: "col-resize",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Right image — full width, behind */}
          <img
            src={rightImage!}
            alt="右图"
            draggable={false}
            className="w-full object-contain"
            style={{ maxHeight: 220, display: "block" }}
          />
          {/* Left image — exact same size/position, clipped via clip-path */}
          <img
            src={leftImage!}
            alt="左图"
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          />
          {/* Slider line */}
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${sliderPos}%`,
              width: 2,
              background: "#fff",
              boxShadow: "0 0 6px rgba(0,0,0,0.6)",
              zIndex: 10,
              transform: "translateX(-1px)",
            }}
          >
            {/* Drag handle circle */}
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 6px rgba(0,0,0,0.4)",
                left: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 2L2 6L4 10" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 2L10 6L8 10" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          {/* Labels */}
          <span className="absolute top-1.5 left-1.5 text-[9px] px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.5)", color: "#fff", zIndex: 5 }}>左</span>
          <span className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.5)", color: "#fff", zIndex: 5 }}>右</span>
        </div>
      )}
    </BaseNode>
  );
});
