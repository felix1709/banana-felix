import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import { useGenerationPoll } from "../../../hooks/useGenerationPoll";
import { generateVideo } from "../../../services/apiService";
import { VIDEO_MODELS, getModelById } from "../../../types/model";
import type { GenVideoSettings } from "../../../types/settings";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { v4 as uuid } from "uuid";
import { parseMentions, getMentionableNodes } from "../../../hooks/useMentionParser";
import { buildAnchorText } from "../../../hooks/useAnchorText";
import { NODE_TYPE_LABELS } from "../../../types/node";
import type { CanvasEdge, NodeType } from "../../../types/node";

export const GenVideoNode = memo(function GenVideoNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { settings, updateSettings } = useNodeSettings<GenVideoSettings>(id);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const content = (data?.content as string) ?? "";
  const prompt = (data?.prompt as string) ?? "";

  // @-mention state
  const [atQuery, setAtQuery] = useState<{ index: number; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodes = useGraphStore((s) => s.nodes);

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
    updateNode(id, { prompt: val });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: val } } : n));

    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch && mentionableNodes.length > 0) {
      setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
    } else {
      setAtQuery(null);
    }
  }, [id, updateNode, setXyNodes, mentionableNodes.length]);

  // Auto-resize prompt textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [prompt]);

  const insertMention = useCallback((refName: string) => {
    if (!atQuery || !textareaRef.current) return;
    const currentPrompt = useGraphStore.getState().nodes.find((n) => n.id === id)?.prompt ?? "";
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

    updateNode(id, { prompt: newVal });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: newVal } } : n));
    setAtQuery(null);
    setTimeout(() => {
      const newPos = before.length + refName.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [atQuery, id, updateNode, setXyNodes, setXyEdges, mentionableNodes]);

  const allJobs = useJobStore((s) => s.jobs);
  const latestJob = useMemo(() => {
    const j = allJobs.filter((j) => j.nodeId === id);
    return j.length > 0 ? j.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : undefined;
  }, [allJobs, id]);

  useGenerationPoll(id);

  const [elapsed, setElapsed] = useState("0.0");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = latestJob?.status === "pending" || latestJob?.status === "running";
  const hasResult = !!content && (content.startsWith("http") || content.startsWith("data:"));
  const isVideo = hasResult && /\.(mp4|webm)/.test(content);

  const videoModelOptions = useMemo(() => {
    const dynamic = remoteModels.filter((m) => m.type === "video");
    if (dynamic.length > 0) {
      return dynamic.map((m) => ({ id: m.id, label: m.name }));
    }
    return VIDEO_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.provider})` }));
  }, [remoteModels]);

  const modelDef = getModelById(settings.model);

  useEffect(() => {
    if (isRunning) {
      const start = Date.now();
      timerRef.current = setInterval(() => setElapsed(((Date.now() - start) / 1000).toFixed(1)), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setElapsed("0.0");
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  const handleGenerate = useCallback(async () => {
    // Read live from store to avoid stale closure when onBlur and onClick fire in same batch
    const liveNodes = useGraphStore.getState().nodes;
    const liveEdges = useGraphStore.getState().edges;
    const incoming = liveEdges.filter((e) => e.to === id);
    const liveUpstream = { promptText: "", referenceImage: "", startImage: "", endImage: "" };
    for (const edge of incoming) {
      const src = liveNodes.find((n) => n.id === edge.from);
      if (!src) continue;
      const handle = edge.toPort ?? "default";
      if (handle === "veo_start") liveUpstream.startImage = src.content;
      else if (handle === "veo_end") liveUpstream.endImage = src.content;
      else if (src.type === "input-image" || src.type === "gen-image") liveUpstream.referenceImage = src.content;
      else liveUpstream.promptText = src.prompt || src.content;
    }

    const effectivePrompt = prompt || liveUpstream.promptText;
    if (!effectivePrompt && !liveUpstream.startImage && !liveUpstream.endImage) return;

    // Build anchor text for model recognition
    const mentionResults = parseMentions(effectivePrompt, liveNodes);
    const anchoredPrompt = buildAnchorText(mentionResults, effectivePrompt);

    const jobId = uuid();

    try {
      addJob({ id: jobId, nodeId: id, type: "video", taskId: "", status: "pending", progress: 0, createdAt: Date.now() });

      const result = await generateVideo({
        model: settings.model,
        prompt: anchoredPrompt,
        negativePrompt: settings.negativePrompt || undefined,
        duration: settings.duration,
        fps: settings.fps,
        resolution: settings.resolution,
        seed: settings.seed === -1 ? undefined : settings.seed,
        startImage: liveUpstream.startImage || undefined,
        endImage: liveUpstream.endImage || undefined,
      });

      if (result.taskId) updateJob(jobId, { taskId: result.taskId });
      if (result.status === "succeeded" && result.videoUrl) {
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.videoUrl });
        updateNode(id, { content: result.videoUrl });
        setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: result.videoUrl } } : n));
      } else if (result.status === "failed") {
        updateJob(jobId, { status: "failed", error: result.error });
      }
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : "生成失败" });
    }
  }, [id, prompt, settings, addJob, updateJob, updateNode, setXyNodes]);

  const handleCancel = useCallback(() => {
    if (latestJob) updateJob(latestJob.id, { status: "cancelled" });
  }, [latestJob, updateJob]);

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  return (
    <BaseNode id={id} type="gen-video" selected={selected}>
      {/* Model selector */}
      <select
        value={settings.model}
        onChange={(e) => updateSettings({ model: e.target.value })}
        className="w-full text-[11px] px-1.5 py-1 rounded border outline-none mb-1.5"
        style={inputStyle}
        title="模型"
      >
        {videoModelOptions.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      {/* Duration + FPS + Resolution */}
      <div className="grid grid-cols-3 gap-1 mb-1.5">
        <div className="flex items-center gap-0.5">
          <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>时长</span>
          <select
            value={settings.duration}
            onChange={(e) => updateSettings({ duration: Number(e.target.value) })}
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
            style={inputStyle}
            title="时长"
          >
            {[2, 4, 6, 8, 10].map((d) => (
              <option key={d} value={d}>{d}s</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>FPS</span>
          <select
            value={settings.fps}
            onChange={(e) => updateSettings({ fps: Number(e.target.value) })}
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
            style={inputStyle}
            title="帧率"
          >
            <option value={24}>24</option>
            <option value={30}>30</option>
          </select>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>分辨率</span>
          <select
            value={settings.resolution}
            onChange={(e) => updateSettings({ resolution: e.target.value })}
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
            style={inputStyle}
            title="分辨率"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="4K">4K</option>
          </select>
        </div>
      </div>

      {/* Negative prompt */}
      <input
        type="text"
        value={settings.negativePrompt}
        onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
        placeholder="负面提示词（可选）"
        className="w-full text-[10px] px-2 py-1 rounded border outline-none mb-1.5"
        style={inputStyle}
      />

      {/* Prompt textarea with @-mention */}
      <div className="relative mb-1.5">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handlePromptChange}
          placeholder="输入提示词，@引用素材..."
          className="w-full text-[11px] px-2 py-1.5 rounded-lg border outline-none resize-none nodrag overflow-hidden"
          style={{ minHeight: 44, ...inputStyle }}
          onKeyDown={(e) => {
            if (atQuery && filteredMentions.length > 0 && e.key === "Enter") {
              e.preventDefault();
              insertMention(filteredMentions[0].nodeName);
            }
            if (atQuery && e.key === "Escape") {
              setAtQuery(null);
            }
          }}
        />
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

      {/* Handles for edge connections */}
      <Handle type="target" position={Position.Left} id="veo_start" style={{ top: "30%", width: 8, height: 8, background: "#22c55e", border: "2px solid " + (isDark ? "#3f3f46" : "#d4d4d8"), left: -4 }} />
      <Handle type="target" position={Position.Left} id="veo_end" style={{ top: "70%", width: 8, height: 8, background: "#ef4444", border: "2px solid " + (isDark ? "#3f3f46" : "#d4d4d8"), left: -4 }} />

      {/* Video preview / progress */}
      <div
        className="w-full rounded flex items-center justify-center overflow-hidden"
        style={{
          height: 150,
          background: isDark ? "#27272a" : "#f4f4f5",
          border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
        }}
      >
        {isRunning ? (
          <div className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-blue-500" />
            </div>
            <span className="text-[11px] font-mono" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>
              {elapsed}s
            </span>
            <span className="text-[9px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
              {modelDef?.label ?? settings.model}
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: "#ef4444", color: "#ef4444" }}
            >
              取消
            </button>
          </div>
        ) : latestJob?.status === "failed" ? (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <span className="text-[11px] text-red-400">{latestJob.error || "生成失败"}</span>
            <button
              type="button"
              onClick={handleGenerate}
              className="text-[10px] px-2 py-0.5 rounded border"
              style={{ borderColor: "#f97316", color: "#f97316" }}
            >
              重试
            </button>
          </div>
        ) : hasResult && isVideo ? (
          <video src={content} className="w-full h-full object-contain" controls autoPlay={false} muted />
        ) : hasResult ? (
          <img src={content} alt="生成结果" className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>点击生成</span>
        )}
      </div>

      {/* Generate button */}
      <div className="flex items-center justify-center mt-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isRunning}
          className="w-full text-[12px] px-3 py-1.5 rounded font-medium"
          style={{
            background: isRunning ? (isDark ? "#3f3f46" : "#d4d4d8") : "#3b82f6",
            color: isRunning ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}
        >
          {isRunning ? `生成中 ${elapsed}s` : hasResult ? "重新生成" : "生成"}
        </button>
      </div>
    </BaseNode>
  );
});
