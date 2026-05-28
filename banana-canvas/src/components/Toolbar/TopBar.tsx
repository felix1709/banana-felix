import { useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useUIStore } from "../../stores/uiStore";
import { useProjectStore } from "../../stores/projectStore";
import { useGraphStore } from "../../stores/graphStore";
import {
  serializeProject,
  deserializeProject,
  showSaveDialog,
  showOpenDialog,
  writeProjectFile,
  readProjectFile,
  browserDownloadProject,
  browserOpenProject,
} from "../../services/projectService";
import { toXyNode, toXyEdge } from "../../utils/nodeConvert";

interface TopBarProps {
  onOpenApiSettings: () => void;
  onOpenKeybindingSettings: () => void;
  onCheckUpdate: () => void;
}

const isTauri = "__TAURI_INTERNALS__" in window;

export function TopBar({ onOpenApiSettings, onOpenKeybindingSettings, onCheckUpdate }: TopBarProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const addToast = useUIStore((s) => s.addToast);

  const projectPath = useProjectStore((s) => s.projectPath);
  const projectName = useProjectStore((s) => s.projectName);
  const modified = useProjectStore((s) => s.modified);
  const setProjectPath = useProjectStore((s) => s.setProjectPath);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const markSaved = useProjectStore((s) => s.markSaved);
  const resetProject = useProjectStore((s) => s.resetProject);
  const markModified = useProjectStore((s) => s.markModified);

  const { setNodes, setEdges, zoomIn, zoomOut, fitView } = useReactFlow();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // ── Confirm unsaved changes ──
  const confirmDiscard = useCallback((): boolean => {
    if (!modified) return true;
    return window.confirm("当前项目有未保存的修改，是否放弃？");
  }, [modified]);

  // ── New Project ──
  const handleNew = useCallback(() => {
    if (!confirmDiscard()) return;
    useGraphStore.getState().clearGraph();
    setNodes([]);
    setEdges([]);
    resetProject();
    addToast("success", "已新建项目");
  }, [confirmDiscard, setNodes, setEdges, resetProject, addToast]);

  // ── Save Project ──
  const handleSave = useCallback(async () => {
    try {
      const content = serializeProject(projectName);

      if (isTauri) {
        let path = projectPath;
        if (!path) {
          path = await showSaveDialog(projectName);
          if (!path) return;
          setProjectPath(path);
        }
        await writeProjectFile(path, content);
        // Extract name from path
        const name = path.replace(/.*[/\\]/, "").replace(/\.gaga$/, "");
        if (name && name !== projectName) setProjectName(name);
      } else {
        browserDownloadProject(content, projectName);
      }

      markSaved();
      addToast("success", "项目已保存");
    } catch (err) {
      addToast("error", `保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  }, [projectName, projectPath, setProjectPath, setProjectName, markSaved, addToast]);

  // ── Save As ──
  const handleSaveAs = useCallback(async () => {
    try {
      const content = serializeProject(projectName);

      if (isTauri) {
        const path = await showSaveDialog(projectName);
        if (!path) return;
        await writeProjectFile(path, content);
        setProjectPath(path);
        const name = path.replace(/.*[/\\]/, "").replace(/\.gaga$/, "");
        if (name) setProjectName(name);
      } else {
        browserDownloadProject(content, `${projectName}_副本`);
      }

      markSaved();
      addToast("success", "项目已另存为");
    } catch (err) {
      addToast("error", `另存为失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  }, [projectName, setProjectPath, setProjectName, markSaved, addToast]);

  // ── Open Project ──
  const handleOpen = useCallback(async () => {
    if (!confirmDiscard()) return;

    try {
      let json: string | null = null;

      if (isTauri) {
        const path = await showOpenDialog();
        if (!path) return;
        json = await readProjectFile(path);
        if (!json) return;

        const data = deserializeProject(json);
        useGraphStore.getState().loadGraph(data.nodes, data.edges, data.groups);
        setNodes(data.nodes.map(toXyNode));
        setEdges(data.edges.map(toXyEdge));
        setProjectPath(path);
        setProjectName(data.projectName || "未命名项目");
        markSaved();
      } else {
        json = await browserOpenProject();
        if (!json) return;

        const data = deserializeProject(json);
        useGraphStore.getState().loadGraph(data.nodes, data.edges, data.groups);
        setNodes(data.nodes.map(toXyNode));
        setEdges(data.edges.map(toXyEdge));
        setProjectPath(null);
        setProjectName(data.projectName || "未命名项目");
        markModified();
      }

      addToast("success", "项目已打开");
    } catch (err) {
      addToast("error", `打开失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  }, [confirmDiscard, setNodes, setEdges, setProjectPath, setProjectName, markSaved, markModified, addToast]);

  // ── Name editing ──
  const startEdit = useCallback(() => {
    setNameDraft(projectName);
    setEditing(true);
  }, [projectName]);

  const commitEdit = useCallback(() => {
    const trimmed = nameDraft.trim() || "未命名项目";
    setProjectName(trimmed);
    setEditing(false);
    markModified();
  }, [nameDraft, setProjectName, markModified]);

  // ── Fullscreen ──
  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const btnBase: React.CSSProperties = {
    background: "transparent",
    color: isDark ? "#a1a1aa" : "#71717a",
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 4,
    whiteSpace: "nowrap",
  };

  const separator: React.CSSProperties = {
    width: 1,
    height: 16,
    background: isDark ? "#27272a" : "#e4e4e7",
    margin: "0 2px",
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center gap-1 px-2 z-[100]"
      style={{
        height: 36,
        background: isDark ? "#09090b" : "#ffffff",
        borderBottom: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`,
      }}
    >
      {/* Left: project name + file operations */}
      <span style={{ color: isDark ? "#facc15" : "#ca8a04", fontSize: 14, marginRight: 4 }}>&#x1F34C;</span>
      {editing ? (
        <input
          autoFocus
          value={nameDraft}
          title="项目名称"
          placeholder="输入项目名称..."
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
          className="text-xs px-1 py-0.5 rounded border outline-none"
          style={{ width: 140, background: isDark ? "#27272a" : "#f4f4f5", borderColor: isDark ? "#3f3f46" : "#d4d4d8", color: isDark ? "#e4e4e7" : "#18181b" }}
        />
      ) : (
        <button type="button" onClick={startEdit} style={{ ...btnBase, color: isDark ? "#f4f4f5" : "#18181b", fontWeight: 500 }}>
          {projectName}{modified ? " *" : ""}
        </button>
      )}

      <div style={separator} />

      <button type="button" onClick={handleNew} style={btnBase} title="新建项目">新建</button>
      <button type="button" onClick={handleSave} style={btnBase} title="保存 (Ctrl+S)">保存</button>
      <button type="button" onClick={handleSaveAs} style={btnBase} title="另存为 (Ctrl+Shift+S)">另存为</button>
      <button type="button" onClick={handleOpen} style={btnBase} title="打开项目">打开</button>

      <div style={{ flex: 1 }} />

      {/* Right controls */}
      <button type="button" onClick={() => toggleTheme()} style={btnBase} title="切换主题">
        {isDark ? "☀ 亮色" : "🌙 暗色"}
      </button>
      <button type="button" onClick={onOpenApiSettings} style={btnBase} title="API 设置">API 设置</button>
      <button type="button" onClick={onOpenKeybindingSettings} style={btnBase} title="按键设置">⌨ 按键设置</button>
      <button type="button" onClick={onCheckUpdate} style={btnBase} title="检查更新">🔄 更新</button>

      {/* Zoom */}
      <div className="flex items-center gap-0.5" style={{ borderLeft: `1px solid ${isDark ? "#27272a" : "#e4e4e7"}`, paddingLeft: 4, marginLeft: 4 }}>
        <button type="button" onClick={() => zoomOut()} style={btnBase} title="缩小">−</button>
        <button type="button" onClick={() => fitView()} style={{ ...btnBase, fontSize: 10 }} title="适应视口">Fit</button>
        <button type="button" onClick={() => zoomIn()} style={btnBase} title="放大">+</button>
      </div>

      <button type="button" onClick={handleFullscreen} style={btnBase} title="全屏">⛶</button>
    </div>
  );
}
