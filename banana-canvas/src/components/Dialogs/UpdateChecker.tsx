import { useState, useCallback, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useUIStore } from "../../stores/uiStore";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

interface UpdateInfo {
  version: string;
  body: string;
  date: string | null;
}

export function UpdateChecker() {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const isTauriEnv = "__TAURI_INTERNALS__" in window;

  useEffect(() => {
    handleCheck();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheck = useCallback(async () => {
    if (!isTauriEnv) {
      useUIStore.getState().addToast("info", "自动更新仅在桌面应用中可用");
      return;
    }

    setStatus("checking");
    setErrorMsg("");

    try {
      const update = await check();

      if (!update) {
        setStatus("idle");
        useUIStore.getState().addToast("success", "当前已是最新版本");
        return;
      }

      setUpdateInfo({
        version: update.version,
        body: update.body || "",
        date: update.date ?? null,
      });
      setStatus("available");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [isTauriEnv]);

  const handleDownload = useCallback(async () => {
    if (!updateInfo) return;
    setStatus("downloading");
    setProgress(0);

    try {
      const update = await check();
      if (!update) {
        setStatus("idle");
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setProgress(100);
            break;
        }
      });

      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [updateInfo]);

  const handleRestart = useCallback(async () => {
    await relaunch();
  }, []);

  const handleDismiss = useCallback(() => {
    setStatus("idle");
    setUpdateInfo(null);
    setProgress(0);
    setErrorMsg("");
  }, []);

  if (status === "idle") return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 400,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
  };

  const cardStyle: React.CSSProperties = {
    width: 400, borderRadius: 12,
    background: isDark ? "#18181b" : "#ffffff",
    border: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    padding: 24,
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    padding: "8px 20px", borderRadius: 8, border: "none",
    background: color, color: "#ffffff", fontSize: 12,
    fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
  });

  return (
    <div style={overlayStyle} onClick={handleDismiss}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {/* Checking */}
        {status === "checking" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔄</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#e4e4e7" : "#18181b" }}>
              正在检查更新...
            </div>
          </div>
        )}

        {/* Update available */}
        {status === "available" && updateInfo && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>🎉</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? "#e4e4e7" : "#18181b" }}>
                  发现新版本 v{updateInfo.version}
                </div>
                {updateInfo.date && (
                  <div style={{ fontSize: 10, color: isDark ? "#71717a" : "#a1a1aa" }}>
                    {new Date(updateInfo.date).toLocaleDateString("zh-CN")}
                  </div>
                )}
              </div>
            </div>
            {updateInfo.body && (
              <div style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                background: isDark ? "#0f0f0f" : "#f4f4f5",
                border: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
                fontSize: 12, color: isDark ? "#a1a1aa" : "#71717a",
                maxHeight: 160, overflowY: "auto", whiteSpace: "pre-wrap",
              }}>
                {updateInfo.body}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={handleDismiss} style={{
                padding: "8px 16px", borderRadius: 8,
                border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
                background: "transparent",
                color: isDark ? "#a1a1aa" : "#71717a", fontSize: 12, cursor: "pointer",
              }}>
                稍后再说
              </button>
              <button type="button" onClick={handleDownload} style={btnStyle("#3b82f6")}>
                立即更新
              </button>
            </div>
          </>
        )}

        {/* Downloading */}
        {status === "downloading" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>📥</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isDark ? "#e4e4e7" : "#18181b", marginBottom: 12 }}>
              正在下载更新... {progress}%
            </div>
            <div style={{
              width: "100%", height: 6, borderRadius: 3,
              background: isDark ? "#27272a" : "#e4e4e7",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${progress}%`, height: "100%", borderRadius: 3,
                background: "#3b82f6", transition: "width 0.3s",
              }} />
            </div>
          </div>
        )}

        {/* Ready to restart */}
        {status === "ready" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#e4e4e7" : "#18181b", marginBottom: 16 }}>
              更新已就绪，需要重启应用
            </div>
            <button type="button" onClick={handleRestart} style={btnStyle("#16a34a")}>
              立即重启
            </button>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>❌</span>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ef4444" }}>
                更新检查失败
              </div>
            </div>
            <div style={{
              padding: "8px 12px", borderRadius: 8, marginBottom: 16,
              background: isDark ? "#1c1010" : "#fef2f2",
              border: `1px solid ${isDark ? "#4a1c1c" : "#fecaca"}`,
              fontSize: 11, color: isDark ? "#fca5a5" : "#dc2626",
            }}>
              {errorMsg}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={handleDismiss} style={{
                padding: "8px 16px", borderRadius: 8,
                border: `1px solid ${isDark ? "#3f3f46" : "#d4d4d8"}`,
                background: "transparent",
                color: isDark ? "#a1a1aa" : "#71717a", fontSize: 12, cursor: "pointer",
              }}>
                关闭
              </button>
              <button type="button" onClick={handleCheck} style={btnStyle("#3b82f6")}>
                重试
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
