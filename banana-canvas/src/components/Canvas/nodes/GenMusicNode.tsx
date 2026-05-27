import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { v4 as uuid } from "uuid";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import type { GenMusicSettings } from "../../../types/settings";
import { getMentionableNodes, parseMentions } from "../../../hooks/useMentionParser";
import { buildAnchorText } from "../../../hooks/useAnchorText";
import { NODE_TYPE_LABELS } from "../../../types/node";
import type { CanvasEdge, NodeType } from "../../../types/node";

const MUSIC_MODELS = [
  { value: "musicgen", label: "MusicGen" },
  { value: "stable-audio", label: "Stable Audio" },
];
const MUSIC_STYLES = ["cinematic", "electronic", "classical", "jazz", "rock", "ambient", "pop", "folk"];

export const GenMusicNode = memo(function GenMusicNode({ id, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const { settings, updateSettings } = useNodeSettings<GenMusicSettings>(id);
  const [generating, setGenerating] = useState(false);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();
  const nodes = useGraphStore((s) => s.nodes);

  // @-mention state
  const [atQuery, setAtQuery] = useState<{ index: number; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionableNodes = useMemo(
    () => getMentionableNodes(nodes, id).filter(
      (n) => ["input-image", "gen-image", "video-input", "audio-input"].includes(n.nodeType),
    ),
    [nodes, id],
  );

  const filteredMentions = useMemo(() => {
    if (!atQuery) return [];
    const q = atQuery.text.toLowerCase();
    return mentionableNodes.filter((n) => n.nodeName.toLowerCase().includes(q));
  }, [atQuery, mentionableNodes]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateSettings({ prompt: val });

    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch && mentionableNodes.length > 0) {
      setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
    } else {
      setAtQuery(null);
    }
  }, [updateSettings, mentionableNodes.length]);

  const insertMention = useCallback((refName: string) => {
    if (!atQuery || !textareaRef.current) return;
    const currentPrompt = settings.prompt;
    const before = currentPrompt.slice(0, atQuery.index);
    const after = currentPrompt.slice(textareaRef.current.selectionStart);
    const newVal = `${before}@${refName} ${after}`;

    const mentionedNode = mentionableNodes.find((n) => n.nodeName === refName);
    if (mentionedNode) {
      const existingEdges = useGraphStore.getState().edges;
      const alreadyConnected = existingEdges.some((e) => e.from === mentionedNode.nodeId && e.to === id);
      if (!alreadyConnected) {
        const edge: CanvasEdge = {
          id: uuid(), from: mentionedNode.nodeId, to: id,
          fromPort: "default", toPort: "default", inputType: "default",
        };
        useGraphStore.getState().addEdge(edge);
        setXyEdges((eds) => [...eds, {
          id: edge.id, source: edge.from, target: edge.to,
          sourceHandle: edge.fromPort, targetHandle: edge.toPort,
          type: "canvas", data: { inputType: edge.inputType },
        }]);
      }
    }

    updateSettings({ prompt: newVal });
    setAtQuery(null);
    setTimeout(() => {
      const newPos = before.length + refName.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [atQuery, settings.prompt, id, updateSettings, setXyEdges, mentionableNodes]);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const sliderChange = useCallback(
    (key: keyof GenMusicSettings, val: number) => updateSettings({ [key]: val }),
    [updateSettings],
  );

  // Auto-resize prompt textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [settings.prompt]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);

    const liveNodes = useGraphStore.getState().nodes;
    const mentionResults = parseMentions(settings.prompt, liveNodes);
    const anchoredPrompt = buildAnchorText(mentionResults, settings.prompt);

    const jobId = addJob({ id: uuid(), nodeId: id, type: "gen-music", taskId: "", status: "running", progress: 0, createdAt: Date.now() });

    // Placeholder: simulate generation with anchored prompt
    void anchoredPrompt;

    // Placeholder: simulate generation
    setTimeout(() => {
      updateJob(jobId, { status: "succeeded" });
      const placeholderUrl = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEA";
      useGraphStore.getState().updateNode(id, { content: placeholderUrl });
      setXyNodes((nds) =>
        nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: placeholderUrl } } : n),
      );
      setGenerating(false);
    }, 2000);
  }, [id, settings.prompt, addJob, updateJob, setXyNodes]);

  return (
    <BaseNode id={id} type="gen-music" selected={selected}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>模型</span>
          <select value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {MUSIC_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>时长</span>
          <input type="range" min={1} max={60} value={settings.duration}
            onChange={(e) => sliderChange("duration", Number(e.target.value))}
            className="flex-1 nodrag" style={{ accentColor: "#3b82f6" }} />
          <span className="text-[10px] w-8 text-right" style={{ color: isDark ? "#e4e4e7" : "#18181b" }}>{settings.duration}s</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>BPM</span>
          <input type="number" value={settings.tempo} min={40} max={240}
            onChange={(e) => sliderChange("tempo", Number(e.target.value))}
            className="w-14 text-[11px] px-1.5 py-0.5 rounded border outline-none" style={inputStyle} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] w-10 shrink-0" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>风格</span>
          <select value={settings.style}
            onChange={(e) => updateSettings({ style: e.target.value })}
            className="flex-1 text-[11px] px-1.5 py-1 rounded border outline-none" style={inputStyle}>
            {MUSIC_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="relative">
          <textarea ref={textareaRef} value={settings.prompt}
            onChange={handlePromptChange}
            placeholder="描述你想要的音乐，@引用素材..."
            className="w-full text-[11px] px-2 py-1 rounded border outline-none resize-none nodrag overflow-hidden"
            style={{ minHeight: 44, ...inputStyle }}
            onKeyDown={(e) => {
              if (atQuery && filteredMentions.length > 0 && e.key === "Enter") {
                e.preventDefault();
                insertMention(filteredMentions[0].nodeName);
              }
              if (atQuery && e.key === "Escape") {
                setAtQuery(null);
              }
            }} />
          {atQuery && filteredMentions.length > 0 && (
            <div
              className="absolute left-0 right-0 z-50 rounded-lg border shadow-lg overflow-hidden"
              style={{
                top: "100%",
                background: isDark ? "#27272a" : "#ffffff",
                borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              }}
            >
              {filteredMentions.map((node) => (
                <button
                  key={node.nodeId}
                  type="button"
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-left nodrag"
                  style={{ color: isDark ? "#e4e4e7" : "#18181b" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isDark ? "#3f3f46" : "#f4f4f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={() => insertMention(node.nodeName)}
                >
                  {(node.nodeType === "input-image" || node.nodeType === "gen-image") && node.content && (
                    <img src={node.content} alt="" className="w-4 h-4 rounded object-cover" />
                  )}
                  {node.nodeType === "video-input" && (
                    <span className="text-[10px]" style={{ color: "#f97316" }}>▶</span>
                  )}
                  {node.nodeType === "audio-input" && (
                    <span className="text-[10px]" style={{ color: "#22c55e" }}>♪</span>
                  )}
                  <span className="text-[10px]" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                    @{node.nodeName}
                  </span>
                  <span className="text-[9px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
                    {NODE_TYPE_LABELS[node.nodeType as NodeType]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="w-full text-[11px] px-2 py-1.5 rounded font-medium"
          style={{
            background: generating ? (isDark ? "#3f3f46" : "#d4d4d8") : "#8b5cf6",
            color: generating ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}>
          {generating ? "生成中..." : "生成音乐"}
        </button>
      </div>
    </BaseNode>
  );
});
