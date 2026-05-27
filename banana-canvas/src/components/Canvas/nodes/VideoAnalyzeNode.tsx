import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useGraphStore } from "../../../stores/graphStore";
import { useJobStore } from "../../../stores/jobStore";
import { useUIStore } from "../../../stores/uiStore";
import { useGenerationPoll } from "../../../hooks/useGenerationPoll";
import { analyzeVideo } from "../../../services/apiService";
import type { VideoAnalyzeSettings } from "../../../types/settings";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { v4 as uuid } from "uuid";

const ANALYSIS_PRESETS: Record<Exclude<VideoAnalyzeSettings["analysisType"], "custom">, string> = {
  scene: "以下是视频的多个关键帧截图，请根据这些画面详细描述这个视频的场景内容、环境、光照和氛围",
  shot: "以下是视频的多个关键帧截图，请逐镜头分析这个视频的镜头语言：景别、角度、运动方式",
  motion: "以下是视频的多个关键帧截图，请分析这个视频中人物/物体的运动轨迹和动作特征",
};

const FRAME_COUNT = 6;

function extractVideoFrames(videoUrl: string, count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";

    const frames: string[] = [];
    let currentFrame = 0;

    const seekNext = () => {
      if (currentFrame >= count || !video.duration) {
        video.remove();
        resolve(frames);
        return;
      }
      const t = (video.duration / (count + 1)) * (currentFrame + 1);
      video.currentTime = Math.min(t, video.duration - 0.1);
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = Math.min(video.videoWidth || 640, 512);
        const h = Math.round(w * (video.videoHeight || 360) / (video.videoWidth || 640));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { video.remove(); reject(new Error("Canvas context failed")); return; }
        ctx.drawImage(video, 0, 0, w, h);
        frames.push(canvas.toDataURL("image/jpeg", 0.7));
        currentFrame++;
        seekNext();
      } catch {
        video.remove();
        resolve(frames);
      }
    };

    const onLoaded = () => {
      if (!video.duration || video.duration === Infinity) {
        video.remove();
        resolve(frames);
        return;
      }
      seekNext();
    };

    const onError = () => {
      video.remove();
      reject(new Error("Failed to load video for frame extraction"));
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = videoUrl;
  });
}

export const VideoAnalyzeNode = memo(function VideoAnalyzeNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const addJob = useJobStore((s) => s.addJob);
  const updateJob = useJobStore((s) => s.updateJob);
  const { settings, updateSettings } = useNodeSettings<VideoAnalyzeSettings>(id);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);
  const { setNodes: setXyNodes } = useReactFlow();

  const content = (data?.content as string) ?? "";

  // Upstream video
  const edges = useGraphStore((s) => s.edges);
  const nodes = useGraphStore((s) => s.nodes);
  const upstreamVideo = useMemo(() => {
    const incoming = edges.filter((e) => e.to === id);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.from);
      if (!src) continue;
      if (src.type === "video-input" || src.type === "gen-video") {
        const srcContent = src.content || "";
        if (srcContent) {
          return { nodeId: src.id, content: srcContent, name: src.nodeName || "视频" };
        }
      }
    }
    return null;
  }, [edges, id, nodes]);

  // Jobs
  const allJobs = useJobStore((s) => s.jobs);
  const latestJob = useMemo(() => {
    const j = allJobs.filter((j) => j.nodeId === id);
    return j.length > 0 ? j.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)) : undefined;
  }, [allJobs, id]);

  useGenerationPoll(id);

  const [elapsed, setElapsed] = useState("0.0");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = latestJob?.status === "pending" || latestJob?.status === "running";
  const hasResult = !!content && !content.startsWith("http") && !content.startsWith("data:");

  // Model options: chat-type models (vision-capable)
  const modelOptions = useMemo(() => {
    const chatModels = remoteModels.filter((m) => m.type === "chat");
    if (chatModels.length > 0) {
      return chatModels.map((m) => ({ id: m.id, label: m.name }));
    }
    return [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "qwen-vl-max", label: "Qwen-VL Max" },
    ];
  }, [remoteModels]);

  // Auto-select first available model if current one isn't in the list
  useEffect(() => {
    if (modelOptions.length > 0 && !modelOptions.some((m) => m.id === settings.model)) {
      updateSettings({ model: modelOptions[0].id });
    }
  }, [modelOptions, settings.model, updateSettings]);

  // Timer
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

  const handleAnalyze = useCallback(async () => {
    const liveNodes = useGraphStore.getState().nodes;
    const liveEdges = useGraphStore.getState().edges;
    const incoming = liveEdges.filter((e) => e.to === id);
    let videoUrl = "";
    for (const edge of incoming) {
      const src = liveNodes.find((n) => n.id === edge.from);
      if (!src) continue;
      if ((src.type === "video-input" || src.type === "gen-video") && src.content) {
        videoUrl = src.content;
        break;
      }
    }
    if (!videoUrl) return;

    const prompt = settings.analysisType === "custom"
      ? settings.customPrompt
      : ANALYSIS_PRESETS[settings.analysisType];
    if (!prompt?.trim()) return;

    // Extract frames from the video for vision models
    let frameImageUrls: string[] = [];
    try {
      frameImageUrls = await extractVideoFrames(videoUrl, FRAME_COUNT);
    } catch { /* frame extraction failed, proceed without */ }

    const jobId = uuid();
    try {
      addJob({ id: jobId, nodeId: id, type: "analyze", taskId: "", status: "pending", progress: 0, createdAt: Date.now() });

      const result = await analyzeVideo({ model: settings.model, videoUrl, frameImageUrls, prompt });

      if (result.taskId) updateJob(jobId, { taskId: result.taskId });

      if (result.status === "succeeded" && result.result) {
        updateJob(jobId, { status: "succeeded", progress: 100, resultUrl: result.result });
        updateNode(id, { content: result.result });
        setXyNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, content: result.result } } : n));
      } else if (result.status === "failed") {
        updateJob(jobId, { status: "failed", error: result.result });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "分析失败";
      updateJob(jobId, { status: "failed", error: msg });
      useUIStore.getState().addToast("error", msg);
    }
  }, [id, settings, addJob, updateJob, updateNode, setXyNodes]);

  const s = (base: Record<string, string>) => ({
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
    ...base,
  });

  return (
    <BaseNode id={id} type="video-analyze" selected={selected}>
      {/* Upstream video indicator */}
      {upstreamVideo ? (
        <div
          className="flex items-center gap-1.5 mb-1.5 px-1.5 py-1 rounded-lg"
          style={{ background: isDark ? "#1c1917" : "#fef3c7" }}
        >
          <span style={{ fontSize: 14 }}>🎬</span>
          <span className="text-[10px] truncate" style={{ color: isDark ? "#fbbf24" : "#92400e" }}>
            {upstreamVideo.name}
          </span>
        </div>
      ) : (
        <div className="text-[10px] mb-1.5" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          请连接视频输入节点
        </div>
      )}

      {/* Model selector */}
      <select
        value={settings.model}
        onChange={(e) => updateSettings({ model: e.target.value })}
        className="w-full text-[11px] px-1.5 py-1 rounded border outline-none mb-1.5"
        style={s({})}
        title="分析模型"
      >
        {modelOptions.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>

      {/* Analysis type */}
      <select
        value={settings.analysisType}
        onChange={(e) => updateSettings({ analysisType: e.target.value as VideoAnalyzeSettings["analysisType"] })}
        className="w-full text-[11px] px-1.5 py-1 rounded border outline-none mb-1.5"
        style={s({})}
        title="分析类型"
      >
        <option value="scene">场景描述</option>
        <option value="shot">镜头分解</option>
        <option value="motion">运动分析</option>
        <option value="custom">自定义</option>
      </select>

      {/* Custom prompt */}
      {settings.analysisType === "custom" && (
        <textarea
          value={settings.customPrompt}
          onChange={(e) => updateSettings({ customPrompt: e.target.value })}
          placeholder="输入自定义分析提示词..."
          className="w-full text-[11px] px-2 py-1.5 rounded-lg border outline-none resize-none mb-1.5"
          style={{ height: 60, ...s({}) }}
        />
      )}

      {/* Result / Progress */}
      <div
        className="w-full rounded-lg overflow-y-auto custom-scrollbar"
        style={{
          minHeight: 120,
          maxHeight: 240,
          background: isDark ? "#09090b" : "#e4e4e7",
          border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
          padding: 8,
        }}
      >
        {isRunning ? (
          <div className="flex flex-col items-center gap-1.5 py-4">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] font-mono" style={{ color: isDark ? "#a1a1aa" : "#71717a" }}>
              {elapsed}s
            </span>
          </div>
        ) : latestJob?.status === "failed" ? (
          <div className="text-center py-2">
            <span className="text-[11px] text-red-400">{latestJob.error || "分析失败"}</span>
          </div>
        ) : hasResult ? (
          <pre
            className="text-[11px] whitespace-pre-wrap break-words m-0"
            style={{ color: isDark ? "#e4e4e7" : "#18181b", fontFamily: "inherit" }}
          >
            {content}
          </pre>
        ) : (
          <div className="flex items-center justify-center py-8">
            <span className="text-[11px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>点击分析</span>
          </div>
        )}
      </div>

      {/* Analyze button */}
      <div className="flex items-center justify-center mt-2">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isRunning}
          className="w-full text-[12px] px-3 py-1.5 rounded font-medium"
          style={{
            background: isRunning ? (isDark ? "#3f3f46" : "#d4d4d8") : "#3b82f6",
            color: isRunning ? (isDark ? "#71717a" : "#a1a1aa") : "#fff",
          }}
        >
          {isRunning ? `分析中 ${elapsed}s` : hasResult ? "重新分析" : "分析"}
        </button>
      </div>
    </BaseNode>
  );
});
