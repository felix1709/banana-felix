import { useState, useCallback } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { testConnection } from "../../services/apiService";

interface ApiSettingsDialogProps {
  onClose: () => void;
}

export function ApiSettingsDialog({ onClose }: ApiSettingsDialogProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const baseUrl = useWorkspaceStore((s) => s.baseUrl);
  const apiKey = useWorkspaceStore((s) => s.apiKey);
  const setBaseUrl = useWorkspaceStore((s) => s.setBaseUrl);
  const setApiKey = useWorkspaceStore((s) => s.setApiKey);
  const setRemoteModels = useWorkspaceStore((s) => s.setRemoteModels);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);

  const [localUrl, setLocalUrl] = useState(baseUrl);
  const [localKey, setLocalKey] = useState(apiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    // Apply settings first
    setBaseUrl(localUrl.trim());
    setApiKey(localKey.trim());

    const result = await testConnection();
    if (result.ok) {
      // Store remote models
      const models = result.models ?? [];
      setRemoteModels(models);
      const imageCount = models.filter((m) => m.type === "image").length;
      const videoCount = models.filter((m) => m.type === "video").length;
      const chatCount = models.filter((m) => m.type === "chat").length;
      const unknownCount = models.filter((m) => m.type === "unknown").length;
      setTestResult({
        ok: true,
        msg: `连接成功！获取 ${models.length} 个模型（图片:${imageCount} 视频:${videoCount} 聊天:${chatCount} 其他:${unknownCount}）`,
      });
    } else {
      setTestResult({ ok: false, msg: result.error ?? "连接失败" });
    }
    setTesting(false);
  }, [localUrl, localKey, setBaseUrl, setApiKey, setRemoteModels]);

  const inputStyle = {
    background: isDark ? "#27272a" : "#ffffff",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };
  const labelStyle = { color: isDark ? "#a1a1aa" : "#71717a" };

  const imageModels = remoteModels.filter((m) => m.type === "image");
  const videoModels = remoteModels.filter((m) => m.type === "video");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl border p-6 w-[560px] max-h-[80vh] overflow-y-auto"
        style={{ background: isDark ? "#18181b" : "#ffffff", borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: isDark ? "#f4f4f5" : "#18181b" }}>
            API 设置
          </h2>
          <button type="button" onClick={onClose} className="text-lg leading-none" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
            ✕
          </button>
        </div>

        {/* Base URL */}
        <div className="mb-3">
          <label className="block text-[11px] mb-1" style={labelStyle}>Base URL</label>
          <input
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="https://api.openai.com"
            className="w-full text-xs px-3 py-2 rounded-lg border outline-none"
            style={inputStyle}
          />
          <div className="text-[9px] mt-0.5" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>
            OpenAI 兼容 API 地址，如 https://ai.leihuo.netease.com
          </div>
        </div>

        {/* API Key */}
        <div className="mb-3">
          <label className="block text-[11px] mb-1" style={labelStyle}>API Key</label>
          <input
            type="password"
            value={localKey}
            onChange={(e) => setLocalKey(e.target.value)}
            placeholder="sk-..."
            className="w-full text-xs px-3 py-2 rounded-lg border outline-none"
            style={inputStyle}
          />
          <div className="text-[9px] mt-0.5" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>
            密钥仅保存在本地，不会上传到任何服务器
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className="text-[11px] px-3 py-2 rounded-lg mb-3"
            style={{
              background: testResult.ok ? (isDark ? "#052e16" : "#f0fdf4") : (isDark ? "#450a0a" : "#fef2f2"),
              color: testResult.ok ? "#22c55e" : "#ef4444",
            }}
          >
            {testResult.msg}
          </div>
        )}

        {/* Remote models preview */}
        {remoteModels.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] mb-1" style={labelStyle}>已获取的模型</div>
            {imageModels.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] font-medium" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                  图片模型 ({imageModels.length}):
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {imageModels.map((m) => (
                    <span key={m.id} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#e4e4e7" : "#3f3f46" }}>
                      {m.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {videoModels.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] font-medium" style={{ color: isDark ? "#34d399" : "#059669" }}>
                  视频模型 ({videoModels.length}):
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {videoModels.map((m) => (
                    <span key={m.id} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#e4e4e7" : "#3f3f46" }}>
                      {m.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !localUrl.trim()}
            className="flex-1 text-xs px-3 py-2 rounded-lg border font-medium"
            style={{
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              background: isDark ? "#27272a" : "#f4f4f5",
              color: testing || !localUrl.trim() ? (isDark ? "#52525b" : "#a1a1aa") : (isDark ? "#e4e4e7" : "#18181b"),
            }}
          >
            {testing ? "连接中..." : "测试连接并获取模型"}
          </button>
          <button
            type="button"
            onClick={() => { setBaseUrl(localUrl.trim()); setApiKey(localKey.trim()); onClose(); }}
            className="flex-1 text-xs px-3 py-2 rounded-lg font-medium"
            style={{ background: "#3b82f6", color: "#fff" }}
          >
            保存并关闭
          </button>
        </div>
      </div>
    </div>
  );
}
