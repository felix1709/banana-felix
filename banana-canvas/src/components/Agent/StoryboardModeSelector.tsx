import { memo } from "react";
import type { StoryboardOutput, OutputMode } from "../../types/agent";

interface StoryboardModeSelectorProps {
  storyboard: StoryboardOutput;
  onModeSelect: (mode: OutputMode) => void;
}

export const StoryboardModeSelector = memo(function StoryboardModeSelector({ storyboard, onModeSelect }: StoryboardModeSelectorProps) {
  return (
    <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#f97316", marginBottom: 4 }}>
        🎬 {storyboard.title} — {storyboard.genre}
      </div>
      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>
        比例 {storyboard.aspect_ratio} · 总时长 {storyboard.total_duration_s}s · {storyboard.shots.length} 个镜头
      </div>
      {storyboard.style && (
        <div style={{ fontSize: 10, color: "#52525b", marginBottom: 6 }}>
          风格：{storyboard.style.art_style} | 色彩：{storyboard.style.color_palette} | 光影：{storyboard.style.lighting}
        </div>
      )}
      <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 8 }} className="custom-scrollbar">
        {storyboard.shots.map((shot, i) => (
          <div key={`${shot.cut}-${i}`} style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid #3f3f46" }}>
            <span style={{ color: "#e4e4e7" }}>Cut {shot.cut}</span>{" "}
            {shot.time_range}
            <div style={{ color: "#71717a", marginTop: 1 }}>
              <div>主体：{shot.subject}</div>
              <div>动作：{shot.action}</div>
              <div>描述：{shot.description}</div>
              <div>镜头：{shot.camera}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 8, fontWeight: 600 }}>
        请选择输出模式：
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => onModeSelect("full-board")}
          style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "2px solid #f97316", background: "rgba(249,115,22,0.1)", color: "#f97316", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
        >
          📋 整版输出
        </button>
        <button
          type="button"
          onClick={() => onModeSelect("per-shot")}
          style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "2px solid #22c55e", background: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
        >
          ✂️ 分镜头输出
        </button>
      </div>
      <div style={{ fontSize: 9, color: "#52525b", marginTop: 6 }}>
        整版：单份完整提示词 · 分镜头：每个镜头独立提示词
      </div>
    </div>
  );
});
