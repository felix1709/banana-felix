import { useState, useCallback } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { testConnection } from "../../services/apiService";

interface ApiSettingsDialogProps {
  onClose: () => void;
}

function ApiSection({ title, color, urlValue, urlSetter, urlPlaceholder, keyValue, keySetter, hint }: {
  title: string;
  color: string;
  urlValue: string;
  urlSetter: (v: string) => void;
  urlPlaceholder: string;
  keyValue: string;
  keySetter: (v: string) => void;
  hint?: string;
}) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const inputStyle = { background: isDark ? "#27272a" : "#ffffff", borderColor: isDark ? "#3f3f46" : "#d4d4d8", color: isDark ? "#e4e4e7" : "#18181b" };
  const labelStyle = { color: isDark ? "#a1a1aa" : "#71717a" };

  return (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: isDark ? "#27272a" : "#f4f4f5", marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color, marginBottom: 6 }}>{title}</div>
      <div className="mb-2">
        <label className="block text-[11px] mb-1" style={labelStyle}>Base URL</label>
        <input type="text" value={urlValue} onChange={(e) => urlSetter(e.target.value)} placeholder={urlPlaceholder}
          className="w-full text-xs px-3 py-2 rounded-lg border outline-none" style={inputStyle} />
        {hint && <div className="text-[9px] mt-0.5" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>{hint}</div>}
      </div>
      <div>
        <label className="block text-[11px] mb-1" style={labelStyle}>API Key</label>
        <input type="password" value={keyValue} onChange={(e) => keySetter(e.target.value)} placeholder="留空则使用通用 API Key"
          className="w-full text-xs px-3 py-2 rounded-lg border outline-none" style={inputStyle} />
      </div>
    </div>
  );
}

export function ApiSettingsDialog({ onClose }: ApiSettingsDialogProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const setBaseUrl = useWorkspaceStore((s) => s.setBaseUrl);
  const setApiKey = useWorkspaceStore((s) => s.setApiKey);
  const setChatBaseUrl = useWorkspaceStore((s) => s.setChatBaseUrl);
  const setChatApiKey = useWorkspaceStore((s) => s.setChatApiKey);
  const setVideoBaseUrl = useWorkspaceStore((s) => s.setVideoBaseUrl);
  const setVideoApiKey = useWorkspaceStore((s) => s.setVideoApiKey);
  const setRemoteModels = useWorkspaceStore((s) => s.setRemoteModels);
  const remoteModels = useWorkspaceStore((s) => s.remoteModels);

  const [localUrl, setLocalUrl] = useState(useWorkspaceStore.getState().baseUrl);
  const [localKey, setLocalKey] = useState(useWorkspaceStore.getState().apiKey);
  const [localChatUrl, setLocalChatUrl] = useState(useWorkspaceStore.getState().chatBaseUrl);
  const [localChatKey, setLocalChatKey] = useState(useWorkspaceStore.getState().chatApiKey);
  const [localVideoUrl, setLocalVideoUrl] = useState(useWorkspaceStore.getState().videoBaseUrl);
  const [localVideoKey, setLocalVideoKey] = useState(useWorkspaceStore.getState().videoApiKey);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const applySettings = useCallback(() => {
    setBaseUrl(localUrl.trim());
    setApiKey(localKey.trim());
    setChatBaseUrl(localChatUrl.trim());
    setChatApiKey(localChatKey.trim());
    setVideoBaseUrl(localVideoUrl.trim());
    setVideoApiKey(localVideoKey.trim());
  }, [localUrl, localKey, localChatUrl, localChatKey, localVideoUrl, localVideoKey, setBaseUrl, setApiKey, setChatBaseUrl, setChatApiKey, setVideoBaseUrl, setVideoApiKey]);

  const handleTestAndSave = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    applySettings();

    const result = await testConnection();
    if (result.ok) {
      const models = result.models ?? [];
      setRemoteModels(models);
      const imageCount = models.filter((m) => m.type === "image").length;
      const videoCount = models.filter((m) => m.type === "video").length;
      const chatCount = models.filter((m) => m.type === "chat").length;
      setTestResult({ ok: true, msg: `连接成功！获取 ${models.length} 个模型（图片:${imageCount} 视频:${videoCount} 聊天:${chatCount}）` });
      setTesting(false);
      setTimeout(onClose, 1200);
    } else {
      setTestResult({ ok: false, msg: result.error ?? "连接失败，请检查地址和密钥" });
      setTesting(false);
    }
  }, [applySettings, setRemoteModels, onClose]);

  const handleSaveOnly = useCallback(() => {
    applySettings();
    onClose();
  }, [applySettings, onClose]);

  const labelStyle = { color: isDark ? "#a1a1aa" : "#71717a" };

  const imageModels = remoteModels.filter((m) => m.type === "image");
  const videoModels = remoteModels.filter((m) => m.type === "video");
  const chatModels = remoteModels.filter((m) => m.type === "chat");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="rounded-xl shadow-2xl border p-6 w-[580px] max-h-[85vh] overflow-y-auto"
        style={{ background: isDark ? "#18181b" : "#ffffff", borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: isDark ? "#f4f4f5" : "#18181b" }}>API 设置</h2>
          <button type="button" onClick={onClose} className="text-lg leading-none" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>✕</button>
        </div>

        {/* 通用 API */}
        <ApiSection title="通用 API（图片生成）" color={isDark ? "#a78bfa" : "#7c3aed"}
          urlValue={localUrl} urlSetter={setLocalUrl} urlPlaceholder="https://api.openai.com"
          keyValue={localKey} keySetter={setLocalKey}
          hint="OpenAI 兼容 API 地址，用于图片生成" />

        {/* 对话 API */}
        <ApiSection title="对话 API（蕉蕉 / Agent）" color={isDark ? "#60a5fa" : "#2563eb"}
          urlValue={localChatUrl} urlSetter={setLocalChatUrl} urlPlaceholder="留空则使用通用 API 地址"
          keyValue={localChatKey} keySetter={setLocalChatKey}
          hint="对话模型专用 API 地址，如 Claude、DeepSeek 等。留空则复用通用 API" />

        {/* 视频 API */}
        <ApiSection title="视频 API（视频生成）" color={isDark ? "#34d399" : "#059669"}
          urlValue={localVideoUrl} urlSetter={setLocalVideoUrl} urlPlaceholder="留空则使用通用 API 地址"
          keyValue={localVideoKey} keySetter={setLocalVideoKey}
          hint="视频生成专用 API 地址，如 Seedance、可灵等。留空则复用通用 API" />

        {/* Test result */}
        {testResult && (
          <div className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{
            background: testResult.ok ? (isDark ? "#052e16" : "#f0fdf4") : (isDark ? "#450a0a" : "#fef2f2"),
            color: testResult.ok ? "#22c55e" : "#ef4444",
          }}>
            {testResult.msg}
          </div>
        )}

        {/* Remote models preview */}
        {remoteModels.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] mb-1" style={labelStyle}>已获取的模型</div>
            {chatModels.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] font-medium" style={{ color: isDark ? "#60a5fa" : "#2563eb" }}>
                  对话 ({chatModels.length}):
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {chatModels.map((m) => (
                    <span key={m.id} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#e4e4e7" : "#3f3f46" }}>{m.id}</span>
                  ))}
                </div>
              </div>
            )}
            {imageModels.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] font-medium" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                  图片 ({imageModels.length}):
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {imageModels.map((m) => (
                    <span key={m.id} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#e4e4e7" : "#3f3f46" }}>{m.id}</span>
                  ))}
                </div>
              </div>
            )}
            {videoModels.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] font-medium" style={{ color: isDark ? "#34d399" : "#059669" }}>
                  视频 ({videoModels.length}):
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {videoModels.map((m) => (
                    <span key={m.id} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#e4e4e7" : "#3f3f46" }}>{m.id}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button type="button" onClick={handleTestAndSave} disabled={testing || !localUrl.trim()}
            className="flex-1 text-xs px-3 py-2 rounded-lg font-medium"
            style={{
              background: (testing || !localUrl.trim()) ? "#27272a" : "#3b82f6",
              color: (testing || !localUrl.trim()) ? "#52525b" : "#ffffff",
              cursor: (testing || !localUrl.trim()) ? "not-allowed" : "pointer",
            }}>
            {testing ? "连接中..." : "测试并保存"}
          </button>
          <button type="button" onClick={handleSaveOnly}
            className="text-xs px-3 py-2 rounded-lg border font-medium"
            style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8", background: isDark ? "#27272a" : "#f4f4f5", color: isDark ? "#a1a1aa" : "#71717a" }}>
            仅保存
          </button>
        </div>
        <div className="text-[9px] mt-3" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>
          配置保存在本地，应用重启后自动加载，无需重复测试
        </div>
      </div>
    </div>
  );
}
