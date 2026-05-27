import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useJobStore } from "../stores/jobStore";
import { useGraphStore } from "../stores/graphStore";
import { pollTask } from "../services/apiService";

export function useGenerationPoll(nodeId: string) {
  const hasActiveJobs = useJobStore((s) =>
    s.jobs.some(
      (j) => j.nodeId === nodeId && (j.status === "pending" || j.status === "running"),
    ),
  );
  const updateJob = useJobStore((s) => s.updateJob);
  const updateNode = useGraphStore((s) => s.updateNode);
  const { setNodes: setXyNodes } = useReactFlow();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!hasActiveJobs) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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
        if (!job.taskId) continue; // No real task ID yet — API hasn't responded
        try {
          const result = await pollTask(job.taskId);

          if (result.status === "succeeded") {
            const resultUrl = result.imageUrl ?? result.videoUrl ?? "";
            updateJob(job.id, {
              status: "succeeded",
              progress: 100,
              resultUrl,
            });
            // For analyze jobs, resultUrl may contain text — still write to content
            updateNode(nodeId, { content: resultUrl });
            setXyNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, content: resultUrl } } : n));
          } else if (result.status === "failed") {
            updateJob(job.id, {
              status: "failed",
              error: result.error,
            });
          } else if (result.status === "processing") {
            updateJob(job.id, { status: "running", progress: 50 });
          }
        } catch (err) {
          updateJob(job.id, {
            status: "failed",
            error: err instanceof Error ? err.message : "轮询失败",
          });
        }
      }
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveJobs, nodeId, updateJob, updateNode, setXyNodes]);
}
