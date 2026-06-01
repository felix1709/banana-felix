import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import { useGenerationPoll } from "../../../hooks/useGenerationPoll";
import { generateImage, type ImageGenerateRequest } from "../../../services/apiService";
import { ASPECT_RATIOS, RESOLUTIONS, getPixelSize, getModelById } from "../../../types/model";
import type { GenImageSettings } from "../../../types/settings";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { getImageModelOptions } from "./imageModelOptions";
import { v4 as uuid } from "uuid";
import { parseMentions, getMentionableNodes, buildMergedPrompt } from "../../../hooks/useMentionParser";
import { buildAnchorText } from "../../../hooks/useAnchorText";
import { NODE_TYPE_LABELS, NODE_DEFAULT_SIZES, getDefaultSettings } from "../../../types/node";
import type { NodeType, CanvasEdge, CanvasNode } from "../../../types/node";
import { toXyNode, toXyEdge } from "../../../utils/nodeConvert";
import { getIncomingReferenceEdgeIdsToRemove, stripReferenceMention } from "./referenceRemoval";
import { UpstreamReferenceHeader } from "./UpstreamReferenceHeader";

export const GenImageNode = memo(function GenImageNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { settings, updateSettings } = useNodeSettings<GenImageSettings>(id);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const content = (data?.content as string) ?? "";
  const prompt = (data?.prompt as string) ?? "";

  // Connected reference images (reactive for UI display)
  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);
  const referenceImages = useMemo(() => {
    const incoming = edges.filter((e) => e.to === id);
    let imgIdx = 0;
    return incoming
      .map((edge) => {
        const src = nodes.find((n) => n.id === edge.from);
        if (!src) return null;
        const handle = edge.toPort ?? "default";
        if (handle === "sref" || handle === "oref") return null;
        if (src.type !== "input-image" && src.type !== "gen-image") return null;
        if (!src.content) return null;
        imgIdx++;
        const name = src.nodeName || `图片${imgIdx}`;
        return { edgeId: edge.id, nodeId: src.id, content: src.content, name, idx: imgIdx };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [edges, id, nodes]);

  const otherReferenceItems = useMemo(() => {
    return edges
      .filter((edge) => edge.to === id)
      .map((edge) => {
        const src = nodes.find((node) => node.id === edge.from);
        if (!src) return null;
        const handle = edge.toPort ?? "default";
        if (handle === "sref" || handle === "oref") return null;
        if ((src.type === "input-image" || src.type === "gen-image") && src.content) return null;
        return { edgeId: edge.id, nodeId: src.id, nodeName: src.nodeName, nodeType: src.type, content: src.content };
      })
      .filter((ref): ref is NonNullable<typeof ref> => ref !== null);
  }, [edges, id, nodes]);

  // Compute merged upstream prompt text (for auto-fill)
  const upstreamMergedText = useMemo(() => {
    const incoming = edges.filter((e) => e.to === id);
    const parts: string[] = [];
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.from);
      if (!src) continue;
      const handle = edge.toPort ?? "default";
      if (handle === "sref" || handle === "oref") continue;
      if (src.type === "input-image" || src.type === "gen-image") continue;
      const merged = buildMergedPrompt(src);
      if (merged) parts.push(merged);
    }
    return parts.join("\n");
  }, [edges, id, nodes]);

  // Auto-sync upstream text into localPrompt when isAutoPrompt is true
  const isAutoPrompt = settings.isAutoPrompt ?? true;
  useEffect(() => {
    if (!isAutoPrompt) return;
    const currentLocal = settings.localPrompt ?? "";
    // Only update if upstream text differs from what's currently in the prompt
    if (upstreamMergedText !== currentLocal) {
      updateSettings({ localPrompt: upstreamMergedText });
      setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: upstreamMergedText } } : n));
    }
  }, [upstreamMergedText, isAutoPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a new edge connects to this node, reset isAutoPrompt so content auto-fills
  const prevEdgeCount = useRef(edges.filter((e) => e.to === id).length);
  useEffect(() => {
    const currentCount = edges.filter((e) => e.to === id).length;
    if (currentCount > prevEdgeCount.current && !isAutoPrompt) {
      updateSettings({ isAutoPrompt: true });
    }
    prevEdgeCount.current = currentCount;
  }, [edges, id, isAutoPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Latest job
  const allJobs = useJobStore((s) => s.jobs);
  const latestJob = useMemo(() => {
    const j = allJobs.filter((j) => j.nodeId === id);
    return j.length > 0 ? j.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : undefined;
  }, [allJobs, id]);

  useGenerationPoll(id);

  // Generation timer
  const [elapsed, setElapsed] = useState("0.0");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = latestJob?.status === "pending" || latestJob?.status === "running";
  const hasResult = !!content && (content.startsWith("http") || content.startsWith("data:"));
  const imageModelOptions = useMemo(() => getImageModelOptions(), []);
  const effectiveModel = useMemo(() => {
    if (imageModelOptions.some((m) => m.id === settings.model)) return settings.model;
    return imageModelOptions[0]?.id ?? "gpt-image-2";
  }, [settings.model, imageModelOptions]);

  const modelDef = getModelById(effectiveModel);
  const features = modelDef?.features;

  // @-mention autocomplete state
  const [atQuery, setAtQuery] = useState<{ index: number; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // All mentionable nodes (image, video, audio) for @dropdown
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

  // Auto-resize prompt textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [settings.localPrompt]);

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    // User manually edited → mark as not auto
    updateSettings({ localPrompt: val, isAutoPrompt: false });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: val } } : n));

    // Detect @-mention
    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch && mentionableNodes.length > 0) {
      setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
    } else {
      setAtQuery(null);
    }
  }, [id, updateSettings, setXyNodes, mentionableNodes.length]);

  const insertMention = useCallback((refName: string) => {
    if (!atQuery || !textareaRef.current) return;
    const before = settings.localPrompt.slice(0, atQuery.index);
    const after = settings.localPrompt.slice(textareaRef.current.selectionStart);
    const newVal = `${before}@${refName} ${after}`;

    // Auto-connect: create edge if not already connected
    const mentionedNode = mentionableNodes.find((n) => n.nodeName === refName);
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
        setXyEdges((eds) => [...eds, {
          id: edge.id, source: edge.from, target: edge.to,
          sourceHandle: edge.fromPort, targetHandle: edge.toPort,
          type: "canvas", data: { inputType: edge.inputType },
        }]);
      }
    }

    updateSettings({ localPrompt: newVal, isAutoPrompt: false });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: newVal } } : n));
    setAtQuery(null);
    setTimeout(() => {
      const newPos = before.length + refName.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [atQuery, settings.localPrompt, id, updateSettings, setXyNodes, setXyEdges, mentionableNodes]);

  // Re-enable auto-sync button
  const handleResync = useCallback(() => {
    updateSettings({ isAutoPrompt: true, localPrompt: upstreamMergedText });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: upstreamMergedText } } : n));
  }, [id, updateSettings, setXyNodes, upstreamMergedText]);

  // Timer effect
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
    const liveNodes = useGraphStore.getState().nodes;
    const liveEdges = useGraphStore.getState().edges;
    const incoming = liveEdges.filter((e) => e.to === id);

    const liveUpstream = { referenceImage: "", srefImage: "", orefImage: "" };
    for (const edge of incoming) {
      const src = liveNodes.find((n) => n.id === edge.from);
      if (!src) continue;
      const handle = edge.toPort ?? "default";
      if (handle === "sref") liveUpstream.srefImage = src.content;
      else if (handle === "oref") liveUpstream.orefImage = src.content;
      else if (src.type === "input-image" || src.type === "gen-image") liveUpstream.referenceImage = src.content;
    }

    // Use localPrompt directly (already contains merged upstream text if isAutoPrompt)
    const localP = useGraphStore.getState().nodes.find((n) => n.id === id);
    const effectivePrompt = (localP?.settings as GenImageSettings)?.localPrompt ?? settings.localPrompt ?? "";

    // Resolve @mentions to auto-bind referenced images
    const mentionResults = parseMentions(effectivePrompt, liveNodes);
    const mentionedImageUrls = mentionResults
      .filter((m) => {
        const node = liveNodes.find((n) => n.id === m.nodeId);
        return node && (node.type === "input-image" || node.type === "gen-image") && node.content;
      })
      .map((m) => {
        const node = liveNodes.find((n) => n.id === m.nodeId);
        return node!.content;
      });
    if (!liveUpstream.referenceImage && mentionedImageUrls.length > 0) {
      liveUpstream.referenceImage = mentionedImageUrls[0];
    }

    if (!effectivePrompt && !liveUpstream.referenceImage) return;

    // Build anchor text for model recognition
    const anchoredPrompt = buildAnchorText(mentionResults, effectivePrompt);

    const { width, height } = getPixelSize(settings.ratio, settings.resolution);
    const jobId = uuid();

    try {
      // Determine API routing for Gemini models
      const geminiBaseUrl = features?.geminiChat
        ? useWorkspaceStore.getState().geminiBaseUrl
        : undefined;
      const geminiApiKey = features?.geminiChat
        ? useWorkspaceStore.getState().geminiApiKey
        : undefined;

      addJob({
        id: jobId, nodeId: id, type: "image", taskId: "", status: "pending", progress: 0, createdAt: Date.now(),
        apiBaseUrl: geminiBaseUrl || undefined,
        apiApiKey: geminiApiKey || undefined,
      });

      // Collect all reference images (edge-connected + @mentioned)
      const allRefImages: string[] = [];
      if (liveUpstream.referenceImage) allRefImages.push(liveUpstream.referenceImage);
      if (mentionedImageUrls.length > 0) {
        for (const url of mentionedImageUrls) {
          if (!allRefImages.includes(url)) allRefImages.push(url);
        }
      }

      const req: ImageGenerateRequest = {
        model: effectiveModel,
        prompt: anchoredPrompt,
        n: settings.batchCount || 1,
        size: `${width}x${height}`,
        ratio: settings.ratio,
        referenceImages: allRefImages.length > 0 ? allRefImages : undefined,
      };
      if (liveUpstream.srefImage) req.sref = liveUpstream.srefImage;
      if (liveUpstream.orefImage) req.oref = liveUpstream.orefImage;
      if (features?.quality && settings.quality) req.quality = settings.quality;
      if (features?.style && settings.style) req.style = settings.style;
      if (features?.outputFormat && settings.outputFormat) req.output_format = settings.outputFormat;
      if (features?.moderation && settings.moderation) req.moderation = settings.moderation;

      const result = await generateImage(req);

      if (result.taskId) updateJob(jobId, { taskId: result.taskId });

      if (result.status === "succeeded" && result.imageUrl) {
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.imageUrl });
        updateNode(id, { content: result.imageUrl });
        setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: result.imageUrl } } : n));
        spawnInputImageNode(result.imageUrl);
      } else if (result.status === "failed") {
        updateJob(jobId, { status: "failed", error: result.error });
      }
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : "生成失败" });
    }
  }, [id, prompt, settings, effectiveModel, features, addJob, updateJob, updateNode, setXyNodes]);

  const handleCancel = useCallback(() => {
    if (latestJob) updateJob(latestJob.id, { status: "cancelled" });
  }, [latestJob, updateJob]);

  // ── Auto-create input-image node when generation succeeds ──
  // Every generation creates a NEW result node (never overwrites existing ones)
  const spawnInputImageNode = useCallback((imageUrl: string) => {
    const gs = useGraphStore.getState();
    const currentNode = gs.nodes.find((n) => n.id === id);
    if (!currentNode) return;

    // Count existing result nodes connected from this gen-image node
    const existingResultEdges = gs.edges.filter(
      (e) => e.from === id && gs.nodes.some((n) => n.id === e.to && n.type === "input-image"),
    );
    const resultIndex = existingResultEdges.length; // 0-based, so first result = 0

    // Create new input-image node — offset downward for each additional result
    const imgDims = NODE_DEFAULT_SIZES["input-image"] ?? { w: 260, h: 260 };
    const newNodeId = uuid();
    const newNode: CanvasNode = {
      id: newNodeId,
      type: "input-image",
      x: currentNode.x + (currentNode.width || 320) + 30,
      y: currentNode.y + resultIndex * (imgDims.h + 20),
      width: imgDims.w,
      height: imgDims.h,
      content: imageUrl,
      prompt: "",
      nodeName: currentNode.nodeName ? `${currentNode.nodeName} 结果${resultIndex + 1}` : `生成结果${resultIndex + 1}`,
      settings: { ...getDefaultSettings("input-image"), source: "upload", imageUrl, fileName: `generated_${resultIndex + 1}.png` },
    };

    gs.addNode(newNode);
    setXyNodes((nds) => [...nds, toXyNode(newNode)]);

    // Create edge from gen-image output to input-image input
    const edge: CanvasEdge = {
      id: uuid(),
      from: id,
      to: newNodeId,
      fromPort: "default",
      toPort: "default",
      inputType: "default",
    };
    gs.addEdge(edge);
    setXyEdges((eds) => [...eds, toXyEdge(edge)]);
  }, [id, setXyNodes, setXyEdges]);

  // ── Prompt presets: quick-fill buttons ──
  const PROMPT_PRESETS = [
    { key: "multi-view", label: "多视图", text: "请生成这个角色的四视图，按照正视图、背视图、左侧视图和右侧视图排列，纯灰色背景，图片中不得出现任何编号、文字标注、中英文字符或水印。" },
    { key: "3d-render", label: "3D渲染", text: "去掉背景，渲染图中角色为3d写实风格，细腻的皮肤，明亮，高清，人物材质清晰，纯灰色背景，虚幻引擎5.5，电影级质感。" },
    { key: "scene-angle", label: "场景角度", text: "根据图片场景生成一张9宫格场景的不同角度展示，通过不同角度展示场景。要求电影级CG风格。" },
  ] as const;

  const handlePresetPrompt = useCallback((text: string) => {
    updateSettings({ localPrompt: text, isAutoPrompt: false });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: text } } : n));
  }, [id, updateSettings, setXyNodes]);

  const removeReferenceImage = useCallback((ref: { edgeId: string; nodeId: string; name: string }) => {
    const graph = useGraphStore.getState();
    const edgeIdsToRemove = getIncomingReferenceEdgeIdsToRemove(graph.edges, {
      targetNodeId: id,
      sourceNodeId: ref.nodeId,
      edgeId: ref.edgeId,
      ignoredTargetPorts: ["sref", "oref"],
    });

    for (const edgeId of edgeIdsToRemove) graph.removeEdge(edgeId);
    setXyEdges((eds) => eds.filter((edge) => {
      const targetHandle = edge.targetHandle ?? "default";
      if (edgeIdsToRemove.has(edge.id)) return false;
      return !(edge.target === id && edge.source === ref.nodeId && targetHandle !== "sref" && targetHandle !== "oref");
    }));

    const nextPrompt = stripReferenceMention(settings.localPrompt ?? "", ref.name);
    updateSettings({ localPrompt: nextPrompt, isAutoPrompt: false });
    setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: nextPrompt } } : n));
  }, [id, settings.localPrompt, updateSettings, setXyEdges, setXyNodes]);

  const s = (base: Record<string, string>) => ({
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
    ...base,
  });

  return (
    <BaseNode id={id} type="gen-image" selected={selected}>
      {/* Header toolbar: sync + preset prompts */}
      <div className="flex items-center gap-1 -mt-1 mb-1">
        {!isAutoPrompt && upstreamMergedText && (
          <button
            type="button"
            onClick={handleResync}
            className="text-[9px] px-1 py-0.5 rounded"
            style={{ color: "#22c55e" }}
            title="重新同步上游提示词"
          >
            ↻同步
          </button>
        )}
        <div className="flex gap-1 ml-auto">
          {PROMPT_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePresetPrompt(p.text)}
              className="text-[9px] px-1.5 py-0.5 rounded border nodrag"
              style={{
                borderColor: isDark ? "#3f3f46" : "#d4d4d8",
                background: isDark ? "#27272a" : "#f4f4f5",
                color: isDark ? "#e4e4e7" : "#18181b",
              }}
              title={p.text}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model selector */}
      <select
        value={effectiveModel}
        onChange={(e) => updateSettings({ model: e.target.value })}
        className="w-full text-[11px] px-1.5 py-1 rounded border outline-none mb-1.5"
        style={s({})}
        title="模型"
      >
        {imageModelOptions.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      {/* Prompt textarea with @-mention — merged upstream text fills here */}
      <div className="relative mb-1.5">
        <textarea
          ref={textareaRef}
          value={settings.localPrompt ?? ""}
          onChange={handlePromptChange}
          placeholder="输入提示词，@引用其他节点..."
          className="w-full text-[11px] px-2 py-1.5 rounded-lg border outline-none resize-none overflow-hidden"
          style={{ minHeight: 44, ...s({}) }}
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
        {/* @-mention dropdown */}
        {atQuery && filteredMentions.length > 0 && (
          <div
            className="absolute left-0 right-0 z-50 rounded-lg border shadow-lg overflow-hidden"
            style={{
              top: "100%",
              background: isDark ? "#27272a" : "#ffffff",
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
            }}
          >
            {filteredMentions.map((node) => {
              return (
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
              );
            })}
          </div>
        )}
        {/* Reference image chips */}
        {referenceImages.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {referenceImages.map((ref) => (
              <button
                key={ref.edgeId}
                type="button"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border"
                style={{
                  background: isDark ? "#2e1065" : "#f3e8ff",
                  borderColor: isDark ? "#4c1d95" : "#c4b5fd",
                }}
                onClick={() => {
                  const newVal = (settings.localPrompt ?? "") + `@${ref.name} `;
                  updateSettings({ localPrompt: newVal, isAutoPrompt: false });
                  setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: newVal } } : n));
                  textareaRef.current?.focus();
                }}
                title={`点击插入 @${ref.name}`}
              >
                <img src={ref.content} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                <span className="text-[9px]" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                  @{ref.name}
                </span>
                <span
                  role="button"
                  aria-label={`删除引用 ${ref.name}`}
                  title={`删除引用 ${ref.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeReferenceImage(ref);
                  }}
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 12,
                    height: 12,
                    color: "#ef4444",
                    fontSize: 10,
                    lineHeight: 1,
                    fontWeight: 700,
                  }}
                >
                  X
                </span>
              </button>
            ))}
          </div>
        )}
        {otherReferenceItems.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {otherReferenceItems.map((ref) => (
              <UpstreamReferenceHeader
                key={ref.edgeId}
                targetNodeId={id}
                reference={ref}
                isDark={isDark}
                promptValue={settings.localPrompt ?? ""}
                onPromptChange={(nextPrompt) => {
                  updateSettings({ localPrompt: nextPrompt, isAutoPrompt: false });
                  setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, prompt: nextPrompt } } : n));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ratio + Resolution row */}
      <div className="flex gap-1 mb-1.5">
        <select
          value={settings.ratio}
          onChange={(e) => updateSettings({ ratio: e.target.value })}
          className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
          style={s({})}
          title="宽高比"
        >
          {ASPECT_RATIOS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <select
          value={settings.resolution}
          onChange={(e) => updateSettings({ resolution: e.target.value })}
          className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
          style={s({})}
          title="分辨率"
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Pixel size indicator */}
      <div className="text-[9px] mb-1.5" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
        {(() => { const sz = getPixelSize(settings.ratio, settings.resolution); return `${sz.width}×${sz.height}`; })()}
      </div>

      {/* GPT-specific: quality + style */}
      {features?.quality && (
        <div className="flex gap-1 mb-1.5">
          <select
            value={settings.quality ?? "medium"}
            onChange={(e) => updateSettings({ quality: e.target.value as "low" | "medium" | "high" })}
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
            style={s({})}
            title="质量"
          >
            <option value="low">低质量</option>
            <option value="medium">中质量</option>
            <option value="high">高质量</option>
          </select>
          <select
            value={settings.style ?? "natural"}
            onChange={(e) => updateSettings({ style: e.target.value as "natural" | "vivid" })}
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
            style={s({})}
            title="风格"
          >
            <option value="natural">自然</option>
            <option value="vivid">生动</option>
          </select>
        </div>
      )}

      {/* GPT-specific: output format + moderation */}
      {features?.outputFormat && (
        <div className="flex gap-1 mb-1.5">
          <select
            value={settings.outputFormat ?? "PNG"}
            onChange={(e) => updateSettings({ outputFormat: e.target.value as "PNG" | "JPEG" | "WEBP" })}
            className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
            style={s({})}
            title="输出格式"
          >
            <option value="PNG">PNG</option>
            <option value="JPEG">JPEG</option>
            <option value="WEBP">WEBP</option>
          </select>
          {features?.moderation && (
            <select
              value={settings.moderation ?? "auto"}
              onChange={(e) => updateSettings({ moderation: e.target.value as "auto" | "low" })}
              className="flex-1 text-[10px] px-1 py-0.5 rounded border outline-none"
              style={s({})}
              title="审核级别"
            >
              <option value="auto">Auto</option>
              <option value="low">Low</option>
            </select>
          )}
        </div>
      )}

      {/* Batch count */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>数量</span>
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => updateSettings({ batchCount: n })}
            className="text-[10px] w-6 h-5 rounded border"
            style={{
              borderColor: settings.batchCount === n ? "#3b82f6" : (isDark ? "#3f3f46" : "#d4d4d8"),
              background: settings.batchCount === n ? "#3b82f6" : (isDark ? "#27272a" : "#f4f4f5"),
              color: settings.batchCount === n ? "#fff" : (isDark ? "#e4e4e7" : "#18181b"),
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Compact generation status */}
      {isRunning && (
        <div className="flex items-center gap-2 mt-1.5 mb-1">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-mono" style={{ color: "#3b82f6" }}>{elapsed}s</span>
          <span className="text-[9px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>{modelDef?.label ?? settings.model}</span>
          <button
            type="button"
            onClick={handleCancel}
            className="text-[9px] px-1.5 py-0.5 rounded border ml-auto"
            style={{ borderColor: "#ef4444", color: "#ef4444" }}
          >
            取消
          </button>
        </div>
      )}
      {latestJob?.status === "failed" && (
        <div className="flex items-center gap-2 mt-1.5 mb-1">
          <span className="text-[10px] text-red-400 truncate flex-1">{latestJob.error || "生成失败"}</span>
          <button
            type="button"
            onClick={handleGenerate}
            className="text-[9px] px-1.5 py-0.5 rounded border shrink-0"
            style={{ borderColor: "#f97316", color: "#f97316" }}
          >
            重试
          </button>
        </div>
      )}
      {hasResult && !isRunning && (
        <div className="flex items-center gap-1 mt-1.5 mb-1">
          <span className="text-[10px]" style={{ color: "#22c55e" }}>已生成 → 图片输入节点</span>
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center justify-center mt-1">
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
