import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useJobStore } from "../stores/jobStore";
import { useGraphStore } from "../stores/graphStore";
import { pollTask } from "../services/apiService";
import { v4 as uuid } from "uuid";
import { NODE_DEFAULT_SIZES, getDefaultSettings } from "../types/node";
import type { CanvasNode, CanvasEdge } from "../types/node";
import { toXyNode, toXyEdge } from "../utils/nodeConvert";

const POLL_INTERVAL = 2000;     // 2 seconds
const TIMEOUT_MS = 300000;      // 5 minutes
const MAX_CONSECUTIVE_ERRORS = 3;

export function useGenerationPoll(nodeId: string) {
  const hasActiveJobs = useJobStore((s) =>
    s.jobs.some(
      (j) => j.nodeId === nodeId && (j.status === "pending" || j.status === "running"),
    ),
  );
  const updateJob = useJobStore((s) => s.updateJob);
  const appendJobLog = useJobStore((s) => s.appendJobLog);
  const updateNode = useGraphStore((s) => s.updateNode);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!hasActiveJobs) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      errorCountsRef.current.clear();
      return;
    }

    if (intervalRef.current) return;

    intervalRef.current = setInterval(async () => {
      const currentJobs = useJobStore
        .getState()
        .jobs.filter(
          (j) =>
            j.nodeId === nodeId &&
            (j.status === "pending" || j.status === "running"),
        );

      if (currentJobs.length === 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      for (const job of currentJobs) {
        if (!job.taskId) continue;

        // Timeout check — 5 minutes from creation
        const elapsed = Date.now() - job.createdAt;
        if (elapsed > TIMEOUT_MS) {
          appendJobLog(job.id, `生成超时（${Math.round(TIMEOUT_MS / 1000)}秒），自动终止`);
          updateJob(job.id, {
            status: "failed",
            error: `生成超时（${Math.round(TIMEOUT_MS / 1000)}秒），请检查网络或稍后重试`,
            progress: 0,
          });
          errorCountsRef.current.delete(job.id);
          continue;
        }

        try {
          const result = await pollTask(job.taskId, job.apiBaseUrl, job.apiApiKey);

          // Reset error count on successful poll
          errorCountsRef.current.delete(job.id);

          // Log first poll for debugging
          if (elapsed < 6000) {
            const rawLog = result._raw ?? {};
            appendJobLog(job.id, `轮询原始返回: ${JSON.stringify(rawLog).slice(0, 500)}`);
          }

          if (result.status === "succeeded") {
            const resultUrl = result.imageUrl ?? result.videoUrl ?? "";
            // Log the raw response when succeeded — helps debug missing URL
            if (!resultUrl) {
              const rawLog = result._raw ?? {};
              appendJobLog(job.id, `生成完成但未找到URL，原始返回: ${JSON.stringify(rawLog).slice(0, 600)}`);
            } else {
              appendJobLog(job.id, `生成完成，URL: ${resultUrl.slice(0, 80)}...`);
            }
            updateJob(job.id, {
              status: "succeeded",
              progress: 100,
              resultUrl,
            });
            const gs = useGraphStore.getState();
            const currentNode = gs.nodes.find((n) => n.id === nodeId);
            const nodePatch: Partial<CanvasNode> = { content: resultUrl };
            if (resultUrl && result.videoUrl && currentNode?.type === "video-input") {
              nodePatch.settings = {
                ...currentNode.settings,
                source: "url",
                videoUrl: resultUrl,
                fileName: "generated.mp4",
              };
            }
            updateNode(nodeId, nodePatch);
            setXyNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...nodePatch } } : n));

            // Auto-create input-image node for gen-image nodes
            if (resultUrl && result.imageUrl) {
              const nodeType = currentNode?.type;
              if (nodeType === "gen-image" && currentNode) {
                const existingOutputEdge = gs.edges.find(
                  (e) => e.from === nodeId && gs.nodes.some((n) => n.id === e.to && n.type === "input-image"),
                );
                if (existingOutputEdge) {
                  gs.updateNode(existingOutputEdge.to, { content: resultUrl });
                  setXyNodes((nds) => nds.map((n) => n.id === existingOutputEdge.to ? { ...n, data: { ...n.data, content: resultUrl } } : n));
                } else {
                  const imgDims = NODE_DEFAULT_SIZES["input-image"] ?? { w: 260, h: 260 };
                  const newNodeId = uuid();
                  const newNode: CanvasNode = {
                    id: newNodeId,
                    type: "input-image",
                    x: currentNode.x + (currentNode.width || 320) + 30,
                    y: currentNode.y,
                    width: imgDims.w,
                    height: imgDims.h,
                    content: resultUrl,
                    prompt: "",
                    nodeName: currentNode.nodeName ? `${currentNode.nodeName} 结果` : "生成结果",
                    settings: { ...getDefaultSettings("input-image"), source: "upload", imageUrl: resultUrl, fileName: "generated.png" },
                  };
                  gs.addNode(newNode);
                  setXyNodes((nds) => [...nds, toXyNode(newNode)]);

                  const edge: CanvasEdge = {
                    id: uuid(),
                    from: nodeId,
                    to: newNodeId,
                    fromPort: "default",
                    toPort: "default",
                    inputType: "default",
                  };
                  gs.addEdge(edge);
                  setXyEdges((eds) => [...eds, toXyEdge(edge)]);
                }
              }
            }
          } else if (result.status === "failed") {
            appendJobLog(job.id, `生成失败: ${result.error || "未知错误"}`);
            updateJob(job.id, {
              status: "failed",
              error: result.error || "生成失败",
              progress: 0,
            });
          } else if (result.status === "processing") {
            const estimatedProgress = Math.min(90, 10 + Math.round((elapsed / 120000) * 80));
            updateJob(job.id, { status: "running", progress: estimatedProgress });
          } else {
            // "pending" / "queued" — auto-upgrade to "running" after 15s
            if (elapsed > 15000) {
              const estimatedProgress = Math.min(90, 10 + Math.round((elapsed / 120000) * 80));
              if (job.status !== "running") {
                appendJobLog(job.id, `排队中 → 生成中（已等待${Math.round(elapsed / 1000)}s）`);
              }
              updateJob(job.id, { status: "running", progress: estimatedProgress });
            } else {
              updateJob(job.id, { status: "pending", progress: 5 });
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const currentCount = (errorCountsRef.current.get(job.id) ?? 0) + 1;

          if (currentCount >= MAX_CONSECUTIVE_ERRORS) {
            appendJobLog(job.id, `连续${MAX_CONSECUTIVE_ERRORS}次轮询失败: ${errMsg}`);
            updateJob(job.id, {
              status: "failed",
              error: `连续${MAX_CONSECUTIVE_ERRORS}次轮询失败: ${errMsg}`,
              progress: 0,
            });
            errorCountsRef.current.delete(job.id);
          } else {
            appendJobLog(job.id, `轮询错误 (${currentCount}/${MAX_CONSECUTIVE_ERRORS}): ${errMsg}`);
            errorCountsRef.current.set(job.id, currentCount);
          }
        }
      }
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveJobs, nodeId, updateJob, appendJobLog, updateNode, setXyNodes]);
}
