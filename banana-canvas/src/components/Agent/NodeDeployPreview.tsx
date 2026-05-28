import { memo, useCallback } from "react";
import type { DeployPreview, StoryboardOutput, PromptOptimizeOutput } from "../../types/agent";
import { parseStoryboardOutput, parsePromptOptimizeOutput } from "../../services/skillRegistry";

interface NodeDeployPreviewProps {
  preview: DeployPreview;
  skillId: string;
  data: unknown;
  onConfirm: () => void;
  onAdjust: () => void;
}

export const NodeDeployPreview = memo(function NodeDeployPreview({ preview, skillId, data, onConfirm, onAdjust }: NodeDeployPreviewProps) {
  if (skillId === "storyboard-builder") {
    const storyboard = parseStoryboardOutput(data);
    if (storyboard) {
      return <StoryboardPreview storyboard={storyboard} nodeCount={preview.nodes.length} onConfirm={onConfirm} onAdjust={onAdjust} />;
    }
  }

  if (skillId === "prompt-optimize") {
    const promptResult = parsePromptOptimizeOutput(data);
    if (promptResult) {
      return <PromptPreview result={promptResult} onConfirm={onConfirm} onAdjust={onAdjust} />;
    }
  }

  // Generic fallback
  return (
    <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 8 }}>
        将部署 {preview.nodes.length} 个节点到画布
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onConfirm} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#22c55e", color: "#fff", fontSize: 12, cursor: "pointer" }}>
          确认部署
        </button>
        <button type="button" onClick={onAdjust} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}>
          调整
        </button>
      </div>
    </div>
  );
});

function StoryboardPreview({ storyboard, nodeCount, onConfirm, onAdjust }: { storyboard: StoryboardOutput; nodeCount: number; onConfirm: () => void; onAdjust: () => void }) {
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
        {storyboard.shots.map((shot) => (
          <div key={shot.cut} style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid #3f3f46" }}>
            <span style={{ color: "#e4e4e7" }}>Cut {shot.cut}</span>{" "}
            {shot.time_range} · {shot.camera}
            <div style={{ color: "#71717a", marginTop: 1 }}>主体：{shot.subject} — {shot.action}</div>
            <div style={{ color: "#52525b", marginTop: 1 }}>{shot.description}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8 }}>
        将创建 {nodeCount} 个节点（每镜头：gen-image + text-node）
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onConfirm} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#22c55e", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
          确认部署
        </button>
        <button type="button" onClick={onAdjust} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}>
          调整
        </button>
      </div>
    </div>
  );
}

function PromptPreview({ result, onConfirm, onAdjust }: { result: PromptOptimizeOutput; onConfirm: () => void; onAdjust: () => void }) {
  const handleConfirm = useCallback(() => onConfirm(), [onConfirm]);
  const handleAdjust = useCallback(() => onAdjust(), [onAdjust]);

  return (
    <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#eab308", marginBottom: 6 }}>✨ 提示词优化结果</div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 2 }}>原文：</div>
      <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 6, padding: "4px 8px", background: "#0f0f0f", borderRadius: 4 }}>{result.original}</div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 2 }}>优化后：</div>
      <div style={{ fontSize: 11, color: "#e4e4e7", marginBottom: 6, padding: "4px 8px", background: "#0f0f0f", borderRadius: 4 }}>{result.optimized}</div>
      {result.improvements.length > 0 && (
        <div style={{ fontSize: 10, color: "#71717a", marginBottom: 8 }}>
          改进：{result.improvements.join("；")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleConfirm} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "none", background: "#22c55e", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
          应用优化
        </button>
        <button type="button" onClick={handleAdjust} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}>
          调整
        </button>
      </div>
    </div>
  );
}
