import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import { generateVideo } from "../../../services/apiService";
import { VIDEO_MODELS, getModelById } from "../../../types/model";
import type { GenVideoSettings } from "../../../types/settings";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { v4 as uuid } from "uuid";
import { parseMentions, getMentionableNodes } from "../../../hooks/useMentionParser";
import { buildAnchorText } from "../../../hooks/useAnchorText";
import { NODE_TYPE_LABELS } from "../../../types/node";
import type { CanvasEdge, NodeType } from "../../../types/node";
import { toXyNode, toXyEdge } from "../../../utils/nodeConvert";
import { buildVideoOutputNodeAndEdge } from "./videoOutputNode";
import { stripReferenceMention } from "./referenceRemoval";
import { caretMenuStyle, getCaretMenuPosition, type CaretMenuPosition } from "../../../utils/caretMenuPosition";
import { insertMentionAtSelection, readTextareaSelection, restoreTextareaSelection } from "./promptInsertion";

// ── Preset styles ──

const VIDEO_STYLES = [
  { id: "guofeng", label: "国风", prompt: "Chinese traditional painting style, ink wash, elegant, classical oriental aesthetics" },
  { id: "cg", label: "影视CG", prompt: "Cinematic CGI, photorealistic rendering, volumetric lighting, dramatic atmosphere" },
  { id: "commercial", label: "广告质感", prompt: "Commercial film quality, polished, clean composition, professional color grading, product showcase" },
  { id: "anime", label: "二次元", prompt: "Japanese anime style, vibrant colors, dynamic composition, detailed illustration" },
  { id: "cyberpunk", label: "赛博朋克", prompt: "Cyberpunk neon aesthetic, dark urban environment, holographic lights, futuristic" },
  { id: "watercolor", label: "水彩", prompt: "Watercolor painting style, soft washes, delicate brushwork, dreamy atmosphere" },
];

// ── Duration marks ──

const DURATION_MARKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const GenVideoNode = memo(function GenVideoNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const appendJobLog = useJobStore((s) => s.appendJobLog);
  const { settings, updateSettings } = useNodeSettings<GenVideoSettings>(id);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const prompt = (data?.prompt as string) ?? "";

  // @-mention state
  const [atQuery, setAtQuery] = useState<{ index: number; text: string } | null>(null);
  const [mentionMenuPosition, setMentionMenuPosition] = useState<CaretMenuPosition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const [styleOpen, setStyleOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [assigningSlot, setAssigningSlot] = useState<"start" | "end" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mentionableNodes = useMemo(
    () => getMentionableNodes(nodes, id).filter(
      (n) => ["input-image", "gen-image", "video-input", "gen-video", "audio-input", "gen-music", "text-node"].includes(n.nodeType),
    ),
    [nodes, id],
  );

  // Connected upstream materials
  const connectedRefs = useMemo(() => {
    const incoming = edges.filter((e) => e.to === id);
    return incoming
      .map((edge) => {
        const src = nodes.find((n) => n.id === edge.from);
        if (!src) return null;
        return { edgeId: edge.id, nodeId: src.id, nodeName: src.nodeName, nodeType: src.type as NodeType, content: src.content, fromPort: edge.fromPort, toPort: edge.toPort };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [edges, id, nodes]);

  // Image-type refs only (for frame assignment)
  const imageRefs = useMemo(
    () => connectedRefs.filter((r) => ["input-image", "gen-image"].includes(r.nodeType)),
    [connectedRefs],
  );

  const filteredMentions = useMemo(() => {
    if (!atQuery) return [];
    const q = atQuery.text.toLowerCase();
    return mentionableNodes.filter((n) => n.nodeName.toLowerCase().includes(q));
  }, [atQuery, mentionableNodes]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const selection = readTextareaSelection(e.target, val.length);
    updateNode(id, { prompt: val });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: val } } : n));
    restoreTextareaSelection(textareaRef.current, selection.start);

    const pos = selection.start;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch && mentionableNodes.length > 0) {
      setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
      setMentionMenuPosition(getCaretMenuPosition(e.target));
    } else {
      setAtQuery(null);
      setMentionMenuPosition(null);
    }
  }, [id, updateNode, setXyNodes, mentionableNodes.length]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [prompt]);

  const appendMentionToPrompt = useCallback((refName: string) => {
    const currentPrompt = textareaRef.current?.value ?? useGraphStore.getState().nodes.find((n) => n.id === id)?.prompt ?? "";
    const selection = readTextareaSelection(textareaRef.current, currentPrompt.length);
    const { nextText: newPrompt, cursor } = insertMentionAtSelection(currentPrompt, refName, selection);

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

    updateNode(id, { prompt: newPrompt });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: newPrompt } } : n));
    setAtQuery(null);
    setMentionMenuPosition(null);
    restoreTextareaSelection(textareaRef.current, cursor);
  }, [id, mentionableNodes, updateNode, setXyNodes, setXyEdges]);

  const insertMention = useCallback((refName: string) => {
    const currentPrompt = textareaRef.current?.value ?? useGraphStore.getState().nodes.find((n) => n.id === id)?.prompt ?? "";
    const selection = readTextareaSelection(textareaRef.current, currentPrompt.length);
    const { nextText: newVal, cursor } = insertMentionAtSelection(currentPrompt, refName, selection, atQuery);

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
    setMentionMenuPosition(null);
    restoreTextareaSelection(textareaRef.current, cursor);
  }, [atQuery, id, updateNode, setXyNodes, setXyEdges, mentionableNodes]);

  const applyStyle = useCallback((style: typeof VIDEO_STYLES[number]) => {
    const currentPrompt = prompt.trim();
    const newPrompt = currentPrompt ? `${currentPrompt}, ${style.prompt}` : style.prompt;
    updateNode(id, { prompt: newPrompt });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: newPrompt } } : n));
    setStyleOpen(false);
  }, [id, prompt, updateNode, setXyNodes]);

  // Assign a connected image ref to a frame slot
  const assignFrameRef = useCallback((slot: "start" | "end", nodeId: string) => {
    if (slot === "start") {
      updateSettings({ startFrameRef: nodeId });
    } else {
      updateSettings({ endFrameRef: nodeId });
    }
    setAssigningSlot(null);
  }, [updateSettings]);

  const removeConnectedRef = useCallback((ref: { edgeId: string; nodeId: string; nodeName: string }) => {
    useGraphStore.getState().removeEdge(ref.edgeId);
    setXyEdges((eds) => eds.filter((edge) => edge.id !== ref.edgeId));

    const currentPrompt = useGraphStore.getState().nodes.find((n) => n.id === id)?.prompt ?? "";
    const nextPrompt = stripReferenceMention(currentPrompt, ref.nodeName);
    updateNode(id, { prompt: nextPrompt });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: nextPrompt } } : n));

    const patch: Partial<GenVideoSettings> = {};
    if (settings.startFrameRef === ref.nodeId) patch.startFrameRef = "";
    if (settings.endFrameRef === ref.nodeId) patch.endFrameRef = "";
    if (Object.keys(patch).length > 0) updateSettings(patch);
  }, [id, settings.startFrameRef, settings.endFrameRef, updateNode, updateSettings, setXyEdges, setXyNodes]);

  const videoModelOptions = useMemo(() => {
    const dynamic = remoteModels.filter((m) => m.type === "video");
    if (dynamic.length > 0) {
      return dynamic.map((m) => ({ id: m.id, label: m.name }));
    }
    return VIDEO_MODELS.map((m) => ({ id: m.id, label: `${m.label} (${m.provider})` }));
  }, [remoteModels]);

  const modelDef = getModelById(settings.model);

  // Lookup assigned frame ref details
  const startFrameNode = useMemo(() => {
    if (!settings.startFrameRef) return null;
    const ref = imageRefs.find((item) => item.nodeId === settings.startFrameRef);
    if (ref) return { id: ref.nodeId, nodeName: ref.nodeName, content: ref.content, type: ref.nodeType, edgeId: ref.edgeId };
    return nodes.find((n) => n.id === settings.startFrameRef);
  }, [imageRefs, nodes, settings.startFrameRef]);

  const endFrameNode = useMemo(() => {
    if (!settings.endFrameRef) return null;
    const ref = imageRefs.find((item) => item.nodeId === settings.endFrameRef);
    if (ref) return { id: ref.nodeId, nodeName: ref.nodeName, content: ref.content, type: ref.nodeType, edgeId: ref.edgeId };
    return nodes.find((n) => n.id === settings.endFrameRef);
  }, [imageRefs, nodes, settings.endFrameRef]);

  const handleGenerate = useCallback(async () => {
    // ── 1. Read LATEST settings from store (never use stale closure) ──
    const liveNode = useGraphStore.getState().nodes.find((n) => n.id === id);
    const liveSettings = (liveNode?.settings ?? settings) as GenVideoSettings;

    if (!liveNode) {
      setValidationError("未找到当前视频生成节点");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    // Parameter validation
    if (!liveSettings.model) {
      setValidationError("请先选择模型");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }

    // ── 2. Collect ALL reference materials from connected edges ──
    const liveNodes = useGraphStore.getState().nodes;
    const liveEdges = useGraphStore.getState().edges;
    const incoming = liveEdges.filter((e) => e.to === id);

    const refImages: string[] = [];
    let refVideoUrl = "";
    let refAudioUrl = "";
    let startImage = "";
    let endImage = "";
    let upstreamPrompt = "";

    for (const edge of incoming) {
      const src = liveNodes.find((n) => n.id === edge.from);
      if (!src || (!src.content && !src.prompt)) continue;

      const handle = edge.toPort ?? "default";
      if (handle === "veo_start") {
        startImage = src.content;
      } else if (handle === "veo_end") {
        endImage = src.content;
      } else if (src.type === "input-image" || src.type === "gen-image") {
        refImages.push(src.content);
      } else if (src.type === "video-input" || src.type === "gen-video") {
        refVideoUrl = src.content;
      } else if (src.type === "audio-input" || src.type === "gen-music") {
        refAudioUrl = src.content;
      } else {
        const textPrompt = src.prompt || src.content;
        upstreamPrompt = upstreamPrompt
          ? `${upstreamPrompt}\n${textPrompt}`
          : textPrompt;
      }
    }

    // ── 3. Resolve @-mentioned nodes → collect their media URLs too ──
    const effectivePrompt = [upstreamPrompt, prompt].filter(Boolean).join("\n");
    if (!effectivePrompt && !startImage && !endImage && refImages.length === 0 && !refVideoUrl) {
      setValidationError("请输入提示词或指定参考素材");
      setTimeout(() => setValidationError(null), 3000);
      return;
    }
    setValidationError(null);

    const mentionResults = parseMentions(effectivePrompt, liveNodes);
    for (const m of mentionResults) {
      const mentionedNode = liveNodes.find((n) => n.id === m.nodeId);
      if (!mentionedNode || (!mentionedNode.content && !mentionedNode.prompt)) continue;

      if (mentionedNode.type === "input-image" || mentionedNode.type === "gen-image") {
        if (!refImages.includes(mentionedNode.content)) {
          refImages.push(mentionedNode.content);
        }
      } else if (mentionedNode.type === "video-input" || mentionedNode.type === "gen-video") {
        if (!refVideoUrl) refVideoUrl = mentionedNode.content;
      } else if (mentionedNode.type === "audio-input" || mentionedNode.type === "gen-music") {
        if (!refAudioUrl) refAudioUrl = mentionedNode.content;
      } else if (mentionedNode.type === "text-node") {
        const textNodePrompt = mentionedNode.prompt || mentionedNode.content;
        if (textNodePrompt && !upstreamPrompt.includes(textNodePrompt)) {
          upstreamPrompt = upstreamPrompt ? `${upstreamPrompt}\n${textNodePrompt}` : textNodePrompt;
        }
      }
    }

    // ── 4. Apply frame ref assignments (overrides edge-based assignment) ──
    if (liveSettings.startFrameRef) {
      const startNode = liveNodes.find((n) => n.id === liveSettings.startFrameRef);
      if (startNode?.content) startImage = startNode.content;
    }
    if (liveSettings.endFrameRef) {
      const endNode = liveNodes.find((n) => n.id === liveSettings.endFrameRef);
      if (endNode?.content) endImage = endNode.content;
    }

    const finalPrompt = [upstreamPrompt, prompt].filter(Boolean).join("\n");
    const anchoredPrompt = buildAnchorText(mentionResults, finalPrompt);
    const referenceImageUrl = refImages[0] || "";

    // ── 5. Build and send request with ALL parameters ──
    const jobId = uuid();
    setSubmitting(true);

    const existingOutputCount = liveEdges.filter(
      (e) => e.from === id && liveNodes.some((n) => n.id === e.to && n.type === "video-input"),
    ).length;
    const { node: outputNode, edge: outputEdge } = buildVideoOutputNodeAndEdge({
      sourceNode: liveNode,
      existingOutputCount,
    });
    const graph = useGraphStore.getState();
    graph.addNode(outputNode);
    graph.addEdge(outputEdge);
    setXyNodes((nds) => [...nds, toXyNode(outputNode)]);
    setXyEdges((eds) => [...eds, toXyEdge(outputEdge)]);

    try {
      const videoBaseUrl = useWorkspaceStore.getState().videoBaseUrl;
      const videoApiKey = useWorkspaceStore.getState().videoApiKey;

      const reqBody = {
        model: liveSettings.model,
        prompt: anchoredPrompt,
        negativePrompt: liveSettings.negativePrompt || undefined,
        duration: liveSettings.duration,
        fps: liveSettings.fps,
        resolution: liveSettings.resolution,
        seed: liveSettings.seed === -1 ? undefined : liveSettings.seed,
        startImage: startImage || undefined,
        endImage: endImage || undefined,
        ratio: liveSettings.ratio,
        generateAudio: liveSettings.generateAudio,
        smartDuration: liveSettings.smartDuration,
        referenceMode: liveSettings.referenceMode,
        referenceImageUrl: referenceImageUrl || undefined,
        referenceVideoUrl: refVideoUrl || undefined,
        referenceAudioUrl: refAudioUrl || undefined,
        images: refImages.length > 0 ? refImages : undefined,
      };

      // Log the full request body for debugging
      const logBody: Record<string, unknown> = { ...reqBody };
      if (typeof logBody.startImage === "string") logBody.startImage = logBody.startImage.slice(0, 40) + "...";
      if (typeof logBody.endImage === "string") logBody.endImage = logBody.endImage.slice(0, 40) + "...";
      if (typeof logBody.referenceImageUrl === "string") logBody.referenceImageUrl = logBody.referenceImageUrl.slice(0, 40) + "...";
      if (typeof logBody.referenceVideoUrl === "string") logBody.referenceVideoUrl = logBody.referenceVideoUrl.slice(0, 40) + "...";
      if (typeof logBody.referenceAudioUrl === "string") logBody.referenceAudioUrl = logBody.referenceAudioUrl.slice(0, 40) + "...";
      if (Array.isArray(logBody.images)) logBody.images = logBody.images.map((u: string) => u.slice(0, 40) + "...");

      addJob({
        id: jobId, nodeId: outputNode.id, type: "video", taskId: "", status: "pending", progress: 0, createdAt: Date.now(),
        apiBaseUrl: videoBaseUrl || undefined, apiApiKey: videoApiKey || undefined,
        log: [
          `开始生成 | 模型: ${liveSettings.model} | 时长: ${liveSettings.duration}s | 比例: ${liveSettings.ratio} | 音频: ${liveSettings.generateAudio ? "开" : "关"}`,
          `请求参数: ${JSON.stringify(logBody).slice(0, 400)}`,
        ],
      });

      const result = await generateVideo(reqBody);

      // Extract task ID — API may return "taskId", "id", or "task_id"
      const rawResult = result as unknown as Record<string, unknown>;
      const effectiveTaskId = String(rawResult.taskId || rawResult.id || rawResult.task_id || "");
      if (effectiveTaskId) {
        updateJob(jobId, { taskId: effectiveTaskId });
        appendJobLog(jobId, `任务ID: ${effectiveTaskId.slice(0, 12)}...`);
      }
      // Log raw API response for debugging
      appendJobLog(jobId, `API返回: ${JSON.stringify(rawResult).slice(0, 200)}`);
      if (result.status === "succeeded" && result.videoUrl) {
        appendJobLog(jobId, "生成完成");
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.videoUrl });
        const nextSettings = {
          ...outputNode.settings,
          source: "url",
          videoUrl: result.videoUrl,
          fileName: "generated.mp4",
        };
        updateNode(outputNode.id, { content: result.videoUrl, settings: nextSettings });
        setXyNodes((nds) => nds.map((n) => n.id === outputNode.id ? { ...n, data: { ...n.data, content: result.videoUrl, settings: nextSettings } } : n));
      } else if (result.status === "failed") {
        appendJobLog(jobId, `生成失败: ${result.error || "未知错误"}`);
        updateJob(jobId, { status: "failed", error: result.error });
      } else {
        appendJobLog(jobId, "等待处理...");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "生成失败";
      appendJobLog(jobId, `API错误: ${errMsg}`);
      updateJob(jobId, { status: "failed", error: errMsg });
    } finally {
      setSubmitting(false);
    }
  }, [id, prompt, settings, addJob, updateJob, appendJobLog, updateNode, setXyNodes, setXyEdges]);

  const border = isDark ? "#3f3f46" : "#d4d4d8";
  const fg = isDark ? "#e4e4e7" : "#18181b";
  const muted = isDark ? "#71717a" : "#a1a1aa";
  const inputBg = isDark ? "#18181b" : "#ffffff";

  const showStartFrameSlot = settings.referenceMode === "first_last_frame" || settings.referenceMode === "first_frame";
  const showEndFrameSlot = settings.referenceMode === "first_last_frame" || settings.referenceMode === "last_frame";

  return (
    <BaseNode id={id} type="gen-video" selected={selected}>
      {/* ── TOP: Title ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>🎬</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: fg }}>视频生成</span>
        <span style={{ fontSize: 9, color: muted, marginLeft: "auto" }}>{modelDef?.label ?? settings.model}</span>
      </div>

      {/* ── MIDDLE: Reference area ── */}
      {/* Connected refs — multimodal mode shows click-to-insert chips */}
      {connectedRefs.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, marginBottom: 4,
          padding: "4px 6px", borderRadius: 6,
          background: isDark ? "rgba(249,115,22,0.06)" : "rgba(249,115,22,0.04)",
          border: `1px solid ${isDark ? "rgba(249,115,22,0.2)" : "rgba(249,115,22,0.15)"}`,
        }}>
          {connectedRefs.map((ref) => (
            <button key={ref.edgeId} type="button" className="nodrag"
              onClick={() => appendMentionToPrompt(ref.nodeName)}
              title={`点击将 @${ref.nodeName} 添加到提示词`}
              style={{
                display: "flex", alignItems: "center", gap: 3, padding: "2px 6px",
                borderRadius: 4, border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
                background: inputBg, color: fg, fontSize: 9, cursor: "pointer",
              }}>
              {(ref.nodeType === "input-image" || ref.nodeType === "gen-image") && ref.content && (
                <img src={ref.content} alt="" style={{ width: 12, height: 12, borderRadius: 2, objectFit: "cover" }} />
              )}
              {(ref.nodeType === "video-input" || ref.nodeType === "gen-video") && <span style={{ fontSize: 8, color: "#f97316" }}>▶</span>}
              {(ref.nodeType === "audio-input" || ref.nodeType === "gen-music") && <span style={{ fontSize: 8, color: "#22c55e" }}>♪</span>}
              <span style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>@{ref.nodeName}</span>
              <span
                role="button"
                aria-label={`删除引用 ${ref.nodeName}`}
                title={`删除引用 ${ref.nodeName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeConnectedRef(ref);
                }}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  color: "#ef4444",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                X
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Frame reference slots — shown when not multimodal */}
      {(showStartFrameSlot || showEndFrameSlot) && (
        <div style={{
          display: "flex", gap: 4, marginTop: 6, marginBottom: 4,
        }}>
          {showStartFrameSlot && (
            <FrameSlot
              label="首帧"
              assignedNode={startFrameNode}
              imageRefs={imageRefs}
              isAssigning={assigningSlot === "start"}
              isDark={isDark}
              border={border}
              fg={fg}
              muted={muted}
              inputBg={inputBg}
              onOpenAssign={() => setAssigningSlot(assigningSlot === "start" ? null : "start")}
              onAssign={(nodeId) => assignFrameRef("start", nodeId)}
              onClear={() => {
                const ref = imageRefs.find((item) => item.nodeId === settings.startFrameRef);
                if (ref) removeConnectedRef(ref);
                else updateSettings({ startFrameRef: "" });
              }}
            />
          )}
          {showEndFrameSlot && (
            <FrameSlot
              label="尾帧"
              assignedNode={endFrameNode}
              imageRefs={imageRefs}
              isAssigning={assigningSlot === "end"}
              isDark={isDark}
              border={border}
              fg={fg}
              muted={muted}
              inputBg={inputBg}
              onOpenAssign={() => setAssigningSlot(assigningSlot === "end" ? null : "end")}
              onAssign={(nodeId) => assignFrameRef("end", nodeId)}
              onClear={() => {
                const ref = imageRefs.find((item) => item.nodeId === settings.endFrameRef);
                if (ref) removeConnectedRef(ref);
                else updateSettings({ endFrameRef: "" });
              }}
            />
          )}
        </div>
      )}

      {/* ── MIDDLE: Prompt input ── */}
      <div style={{ position: "relative", marginBottom: 4 }}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handlePromptChange}
          placeholder="描述你要生成的画面内容。例如:古风女战士, 长发, 红色战甲, 手持长剑..."
          className="w-full text-[11px] px-2 py-1.5 rounded-lg border outline-none resize-none nodrag"
          style={{ minHeight: 52, maxHeight: 100, overflowY: "auto", background: inputBg, borderColor: border, color: fg, lineHeight: 1.5 }}
          onKeyDown={(e) => {
            if (atQuery && filteredMentions.length > 0 && e.key === "Enter") {
              e.preventDefault();
              insertMention(filteredMentions[0].nodeName);
            }
            if (atQuery && e.key === "Escape") {
              setAtQuery(null);
              setMentionMenuPosition(null);
            }
          }}
        />
        {/* @-mention dropdown */}
        {atQuery && filteredMentions.length > 0 && (
          <div className="nodrag" style={{
            ...caretMenuStyle(mentionMenuPosition, { background: inputBg, borderColor: border }),
            border: `1px solid ${border}`, borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}>
            {filteredMentions.map((node) => (
              <button key={node.nodeId} type="button"
                className="flex items-center gap-1.5 w-full px-2 py-1 text-left nodrag"
                style={{ color: fg }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "#3f3f46" : "#f4f4f5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                onClick={() => insertMention(node.nodeName)}>
                {(node.nodeType === "input-image" || node.nodeType === "gen-image") && node.content && (
                  <img src={node.content} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
                )}
                {(node.nodeType === "video-input" || node.nodeType === "gen-video") && <span style={{ fontSize: 10, color: "#f97316" }}>▶</span>}
                {(node.nodeType === "audio-input" || node.nodeType === "gen-music") && <span style={{ fontSize: 10, color: "#22c55e" }}>♪</span>}
                <span style={{ fontSize: 10, color: isDark ? "#a78bfa" : "#7c3aed" }}>@{node.nodeName}</span>
                <span style={{ fontSize: 9, color: muted }}>{NODE_TYPE_LABELS[node.nodeType as NodeType]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── BOTTOM: Parameters ── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
        padding: "4px 0", borderTop: `1px solid ${border}`, marginTop: 2,
      }}>
        {/* Reference mode */}
        <select value={settings.referenceMode}
          onChange={(e) => updateSettings({ referenceMode: e.target.value as GenVideoSettings["referenceMode"] })}
          title="参考模式" aria-label="参考模式"
          className="nodrag"
          style={{ fontSize: 9, padding: "2px 4px", borderRadius: 4, border: `1px solid ${border}`, background: inputBg, color: fg }}>
          <option value="multimodal">多模态参考</option>
          <option value="first_last_frame">首位帧</option>
          <option value="first_frame">首帧</option>
          <option value="last_frame">末帧</option>
        </select>

        {/* Style button (moved to bottom) */}
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => { setStyleOpen(!styleOpen); setAtQuery(null); }}
            className="nodrag"
            style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${styleOpen ? "#f97316" : border}`,
              background: styleOpen ? "rgba(249,115,22,0.1)" : inputBg,
              color: styleOpen ? "#f97316" : fg, display: "flex", alignItems: "center", gap: 2,
            }}>
            🎨 风格
          </button>
          {styleOpen && (
            <div className="nodrag" style={{
              position: "absolute", bottom: "100%", left: 0, zIndex: 50, marginBottom: 2,
              background: inputBg, border: `1px solid ${border}`, borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)", minWidth: 100, padding: 4,
            }}>
              {VIDEO_STYLES.map((s) => (
                <button key={s.id} type="button" onClick={() => applyStyle(s)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "4px 8px",
                    fontSize: 10, border: "none", background: "transparent", color: fg,
                    cursor: "pointer", borderRadius: 3,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "#3f3f46" : "#f4f4f5"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Model */}
        <select value={settings.model}
          onChange={(e) => updateSettings({ model: e.target.value })}
          title="模型版本" aria-label="模型版本"
          className="nodrag"
          style={{ fontSize: 9, padding: "2px 4px", borderRadius: 4, border: `1px solid ${border}`, background: inputBg, color: fg }}>
          {videoModelOptions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        {/* Ratio */}
        <select value={settings.ratio}
          onChange={(e) => updateSettings({ ratio: e.target.value })}
          title="生成比例" aria-label="生成比例"
          className="nodrag"
          style={{ fontSize: 9, padding: "2px 4px", borderRadius: 4, border: `1px solid ${border}`, background: inputBg, color: fg }}>
          {["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "auto"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Resolution */}
        <select value={settings.resolution}
          onChange={(e) => updateSettings({ resolution: e.target.value })}
          title="分辨率" aria-label="分辨率"
          className="nodrag"
          style={{ fontSize: 9, padding: "2px 4px", borderRadius: 4, border: `1px solid ${border}`, background: inputBg, color: fg }}>
          <option value="480p">480p</option>
          <option value="720p">720p</option>
        </select>

        {/* Audio toggle */}
        <button type="button" className="nodrag"
          onClick={() => updateSettings({ generateAudio: !settings.generateAudio })}
          title={`生成音频: ${settings.generateAudio ? "开启" : "关闭"}`}
          style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 4,
            border: `1px solid ${settings.generateAudio ? "#22c55e" : border}`,
            background: settings.generateAudio ? "rgba(34,197,94,0.1)" : inputBg,
            color: settings.generateAudio ? "#22c55e" : fg, cursor: "pointer",
          }}>
          🔊 {settings.generateAudio ? "开" : "关"}
        </button>

        {/* Smart duration toggle */}
        <button type="button" className="nodrag"
          onClick={() => updateSettings({ smartDuration: !settings.smartDuration })}
          title={`智能时长: ${settings.smartDuration ? "开启" : "关闭"}`}
          style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 4,
            border: `1px solid ${settings.smartDuration ? "#3b82f6" : border}`,
            background: settings.smartDuration ? "rgba(59,130,246,0.1)" : inputBg,
            color: settings.smartDuration ? "#3b82f6" : fg, cursor: "pointer",
          }}>
          ⏱ {settings.smartDuration ? "开" : "关"}
        </button>

        {/* Duration — click to expand timeline */}
        <div style={{ position: "relative" }}>
          <button type="button" className="nodrag"
            onClick={() => setDurationOpen(!durationOpen)}
            title={`时长: ${settings.duration}s（点击调节）`}
            style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4,
              border: `1px solid ${durationOpen ? "#f97316" : border}`,
              background: durationOpen ? "rgba(249,115,22,0.1)" : inputBg,
              color: durationOpen ? "#f97316" : fg, cursor: "pointer",
              fontVariantNumeric: "tabular-nums",
            }}>
            🕐 {settings.duration}s
          </button>
          {durationOpen && (
            <div className="nodrag" style={{
              position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
              zIndex: 50, marginBottom: 4,
              background: inputBg, border: `1px solid ${border}`, borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)", padding: "8px 12px",
              width: 220,
            }}>
              {/* Timeline axis — clean style, no gray dots */}
              <div style={{ position: "relative", height: 20, margin: "4px 0" }}>
                {/* Track background */}
                <div style={{
                  position: "absolute", top: 8, left: 0, right: 0,
                  height: 4, borderRadius: 2,
                  background: isDark ? "#3f3f46" : "#e4e4e7",
                }} />
                {/* Filled portion */}
                <div style={{
                  position: "absolute", top: 8, left: 0,
                  width: `${((settings.duration - 1) / 14) * 100}%`,
                  height: 4, borderRadius: 2,
                  background: "#f97316",
                  transition: "width 0.15s",
                }} />
                {/* Active marker */}
                <div style={{
                  position: "absolute",
                  left: `${((settings.duration - 1) / 14) * 100}%`,
                  top: 4,
                  transform: "translateX(-50%)",
                  width: 12, height: 12,
                  borderRadius: "50%",
                  background: "#f97316",
                  border: "2px solid #fff",
                  boxShadow: "0 0 4px rgba(249,115,22,0.5)",
                  transition: "left 0.15s",
                }} />
              </div>
              {/* Clickable number labels */}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                {DURATION_MARKS.filter((d) => [1, 3, 5, 8, 10, 13, 15].includes(d)).map((d) => (
                  <button key={d} type="button"
                    onClick={() => updateSettings({ duration: d })}
                    style={{
                      fontSize: d === settings.duration ? 10 : 8,
                      fontWeight: d === settings.duration ? 700 : 400,
                      color: d === settings.duration ? "#f97316" : muted,
                      background: "none", border: "none", cursor: "pointer",
                      padding: 0, width: 20, textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                    {d}
                  </button>
                ))}
              </div>
              {/* Quick select row */}
              <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                {[3, 5, 8, 10, 15].map((d) => (
                  <button key={d} type="button"
                    onClick={() => updateSettings({ duration: d })}
                    style={{
                      flex: 1, padding: "3px 0", fontSize: 9,
                      borderRadius: 4, border: `1px solid ${d === settings.duration ? "#f97316" : border}`,
                      background: d === settings.duration ? "rgba(249,115,22,0.1)" : "transparent",
                      color: d === settings.duration ? "#f97316" : fg,
                      cursor: "pointer", fontVariantNumeric: "tabular-nums",
                    }}>
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Generate button */}
        <button type="button" onClick={handleGenerate} disabled={submitting} className="nodrag"
          title={submitting ? "正在提交..." : "生成视频"}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
            border: "none", cursor: submitting ? "not-allowed" : "pointer",
            background: submitting ? (isDark ? "#3f3f46" : "#d4d4d8") : "#f97316",
            color: submitting ? muted : "#fff",
          }}>
          ↑
        </button>
      </div>

      {/* Validation error */}
      {validationError && (
        <div style={{
          fontSize: 9, color: "#ef4444", padding: "2px 6px", borderRadius: 4,
          background: "rgba(239,68,68,0.1)", marginTop: 2, textAlign: "center",
        }}>
          {validationError}
        </div>
      )}
    </BaseNode>
  );
});

// ── FrameSlot sub-component ──

interface FrameSlotProps {
  label: string;
  assignedNode: { id: string; nodeName: string; content: string; type: string; edgeId?: string } | null | undefined;
  imageRefs: Array<{ edgeId: string; nodeId: string; nodeName: string; nodeType: string; content: string }>;
  isAssigning: boolean;
  isDark: boolean;
  border: string;
  fg: string;
  muted: string;
  inputBg: string;
  onOpenAssign: () => void;
  onAssign: (nodeId: string) => void;
  onClear: () => void;
}

function FrameSlot({ label, assignedNode, imageRefs, isAssigning, isDark, border, fg, muted, inputBg, onOpenAssign, onAssign, onClear }: FrameSlotProps) {
  return (
    <div style={{ flex: 1, position: "relative" }}>
      <div style={{
        borderRadius: 6, border: `1px solid ${isAssigning ? "#f97316" : border}`,
        background: isAssigning ? "rgba(249,115,22,0.06)" : (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"),
        padding: 4, display: "flex", flexDirection: "column", gap: 2, minHeight: 44,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 8, color: muted, fontWeight: 500 }}>{label}</span>
          {assignedNode && (
            <button type="button" className="nodrag" onClick={onClear}
              title="清除"
              style={{
                marginLeft: "auto", fontSize: 8, lineHeight: 1, padding: "0 3px",
                borderRadius: 2, border: "none", background: "rgba(239,68,68,0.1)",
                color: "#ef4444", cursor: "pointer",
              }}>
              ✕
            </button>
          )}
        </div>
        {assignedNode ? (
          <button type="button" className="nodrag" onClick={onOpenAssign}
            style={{
              display: "flex", alignItems: "center", gap: 4, padding: "2px 4px",
              borderRadius: 4, border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
              background: inputBg, color: fg, fontSize: 9, cursor: "pointer",
              width: "100%", textAlign: "left",
            }}>
            {assignedNode.content && (
              <img src={assignedNode.content} alt="" style={{ width: 16, height: 16, borderRadius: 2, objectFit: "cover" }} />
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{assignedNode.nodeName}</span>
            <span
              role="button"
              aria-label={`删除引用 ${assignedNode.nodeName}`}
              title={`删除引用 ${assignedNode.nodeName}`}
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              style={{ color: "#ef4444", fontSize: 10, lineHeight: 1, fontWeight: 700 }}
            >
              X
            </span>
          </button>
        ) : (
          <button type="button" className="nodrag" onClick={onOpenAssign}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
              padding: "4px", borderRadius: 4,
              border: `1px dashed ${muted}`, background: "transparent",
              color: muted, fontSize: 9, cursor: "pointer", width: "100%",
            }}>
            <span style={{ fontSize: 11 }}>+</span> 指定素材
          </button>
        )}
      </div>
      {/* Assignment dropdown */}
      {isAssigning && (
        <div className="nodrag" style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 2,
          background: inputBg, border: `1px solid ${border}`, borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)", overflow: "hidden",
          maxHeight: 120, overflowY: "auto",
        }}>
          {imageRefs.length === 0 ? (
            <div style={{ padding: "6px 8px", fontSize: 9, color: muted, textAlign: "center" }}>
              请先连接图片素材
            </div>
          ) : (
            imageRefs.map((ref) => (
              <button key={ref.nodeId} type="button"
                className="nodrag"
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
                  fontSize: 9, border: "none", background: "transparent", color: fg,
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "#3f3f46" : "#f4f4f5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                onClick={() => onAssign(ref.nodeId)}>
                {ref.content && (
                  <img src={ref.content} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
                )}
                <span>{ref.nodeName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
