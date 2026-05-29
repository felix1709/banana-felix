import { useEffect, useRef, useState } from "react";
import { useUIStore } from "../../stores/uiStore";
import { NODE_TYPE_LABELS, type NodeType } from "../../types/node";

const NODE_CATEGORIES: Record<string, NodeType[]> = {
  "输入": ["input-image", "text-node", "video-input", "audio-input"],
  "生成": ["gen-image", "gen-video", "gen-music"],
  "编辑": ["inpaint-crop", "inpaint-stitch", "jimeng-super-resolution", "topaz-upscale"],
  "画板": ["canvas-node", "doodle-canvas"],
  "影视": ["camera-movement", "professional-camera", "global-perspective"],
  "角色/场景": [
    "extract-characters-scenes",
    "character-description",
    "scene-description",
    "create-character",
    "create-scene",
    "generate-character-video",
    "generate-scene-video",
    "generate-character-image",
    "generate-scene-image",
  ],
  "工具": ["video-analyze", "motion-control", "custom-agent", "image-compare", "preview", "local-save"],
};

interface NodeCreationMenuProps {
  x: number;
  y: number;
  onCreateNode: (type: NodeType) => void;
  onClose: () => void;
}

export function NodeCreationMenu({ x, y, onCreateNode, onClose }: NodeCreationMenuProps) {
  const theme = useUIStore((s) => s.theme);
  const [search, setSearch] = useState("");
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const isDark = theme === "dark";

  const filteredCategories: Record<string, NodeType[]> = search
    ? Object.fromEntries(
        Object.entries(NODE_CATEGORIES)
          .map(([cat, types]) => [cat, types.filter((t) => NODE_TYPE_LABELS[t].includes(search))])
          .filter(([, types]) => types.length > 0),
      )
    : NODE_CATEGORIES;

  // Search mode: flat list
  if (search) {
    return (
      <div
        ref={ref}
        className="fixed z-[100] w-56 max-h-80 overflow-y-auto rounded-lg shadow-2xl border custom-scrollbar"
        style={{
          left: x,
          top: y,
          background: isDark ? "#18181b" : "#ffffff",
          borderColor: isDark ? "#3f3f46" : "#d4d4d8",
        }}
      >
        <div className="p-2 border-b" style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
          <input
            type="text"
            placeholder="搜索节点..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            autoFocus
            className="w-full px-2 py-1 rounded text-xs outline-none"
            style={{
              background: isDark ? "#27272a" : "#f4f4f5",
              color: isDark ? "#f4f4f5" : "#18181b",
              border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
            }}
          />
        </div>
        <div className="p-1">
          {Object.entries(filteredCategories).map(([category, types]) => (
            <div key={category}>
              <div className="px-2 py-1 text-[10px] font-medium" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
                {category}
              </div>
              {types.map((type) => (
                <button
                  key={type}
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded cursor-pointer"
                  style={{ color: isDark ? "#f4f4f5" : "#18181b" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isDark ? "#27272a" : "#f4f4f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={() => onCreateNode(type)}
                >
                  {NODE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Normal mode: category list on left, sub-menu expands to right
  return (
    <div
      ref={ref}
      className="fixed z-[100] flex rounded-lg shadow-2xl border overflow-hidden"
      style={{
        left: x,
        top: y,
        background: isDark ? "#18181b" : "#ffffff",
        borderColor: isDark ? "#3f3f46" : "#d4d4d8",
      }}
    >
      {/* Left column: categories */}
      <div className="w-32 border-r" style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
        <div className="p-2 border-b" style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
          <input
            type="text"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            autoFocus
            className="w-full px-2 py-1 rounded text-xs outline-none"
            style={{
              background: isDark ? "#27272a" : "#f4f4f5",
              color: isDark ? "#f4f4f5" : "#18181b",
              border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
            }}
          />
        </div>
        <div className="py-1">
          {Object.keys(filteredCategories).map((category) => (
            <button
              key={category}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs flex items-center justify-between cursor-pointer"
              style={{
                color: isDark ? "#f4f4f5" : "#18181b",
                background: hoveredCat === category ? (isDark ? "#27272a" : "#f4f4f5") : "transparent",
              }}
              onMouseEnter={() => setHoveredCat(category)}
              onClick={() => setHoveredCat(hoveredCat === category ? null : category)}
            >
              <span>{category}</span>
              <span style={{ color: isDark ? "#71717a" : "#a1a1aa", fontSize: 10 }}>▸</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right column: sub-menu */}
      {hoveredCat && filteredCategories[hoveredCat] && (
        <div className="w-36 max-h-80 overflow-y-auto custom-scrollbar py-1">
          {filteredCategories[hoveredCat].map((type) => (
            <button
              key={type}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs rounded cursor-pointer"
              style={{ color: isDark ? "#f4f4f5" : "#18181b" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = isDark ? "#27272a" : "#f4f4f5";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
              onClick={() => onCreateNode(type)}
            >
              {NODE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
