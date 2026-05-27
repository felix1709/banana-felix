import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useGraphStore } from "./stores/graphStore";
import { useUIStore } from "./stores/uiStore";
import { useHistoryStore } from "./stores/historyStore";

import { nodeTypes } from "./components/Canvas/nodes";
import { CanvasEdge } from "./components/Canvas/CanvasEdge";
import { NodeCreationMenu } from "./components/Canvas/NodeCreationMenu";
import { CanvasContextMenu } from "./components/Canvas/CanvasContextMenu";
import { ApiSettingsDialog } from "./components/Dialogs/ApiSettingsDialog";
import { TopBar } from "./components/Toolbar/TopBar";
import { LeftToolbar } from "./components/Toolbar/LeftToolbar";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { DoodleOverlay } from "./components/Canvas/DoodleOverlay";
import type { CanvasNode, CanvasEdge as CanvasEdgeType, NodeType } from "./types/node";
import { NODE_DEFAULT_SIZES, NODE_TYPE_LABELS, getDefaultSettings } from "./types/node";
import { v4 as uuid } from "uuid";

const edgeTypes = { canvas: CanvasEdge };

function pushSnapshot() {
  const { nodes, edges, groups } = useGraphStore.getState();
  useHistoryStore.getState().push({
    nodes: JSON.stringify(nodes),
    edges: JSON.stringify(edges),
    groups: JSON.stringify(groups),
  });
}

import { toXyNode, toXyEdge } from "./utils/nodeConvert";

function CanvasApp() {
  const theme = useUIStore((s) => s.theme);
  const performanceMode = useUIStore((s) => s.performanceMode);
  const contextMenu = useUIStore((s) => s.contextMenu);
  const leftToolbarOpen = useUIStore((s) => s.leftToolbarOpen);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const { screenToFlowPosition, getNodes, setNodes, setEdges } = useReactFlow();

  const initialNodes = useMemo(
    () => useGraphStore.getState().nodes.map(toXyNode),
    [],
  );
  const initialEdges = useMemo(
    () => useGraphStore.getState().edges.map(toXyEdge),
    [],
  );

  const [creationMenu, setCreationMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);

  const dragSnapshotTaken = useRef(false);
  const [showApiSettings, setShowApiSettings] = useState(false);

  // ── xyflow change handlers ──

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          useGraphStore.getState().updateNode(change.id, {
            x: change.position.x,
            y: change.position.y,
          });
        } else if (change.type === "dimensions" && change.dimensions) {
          useGraphStore.getState().updateNode(change.id, {
            width: change.dimensions.width,
            height: change.dimensions.height,
          });
        } else if (change.type === "select" && change.selected !== undefined) {
          if (change.selected) {
            useGraphStore.getState().addToSelection(change.id);
          } else {
            useGraphStore.getState().removeFromSelection(change.id);
          }
        }
      }
    },
    [setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      for (const change of changes) {
        if (change.type === "remove") {
          useGraphStore.getState().removeEdge(change.id);
        }
      }
    },
    [setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const existing = useGraphStore.getState().edges;
      const isDuplicate = existing.some(
        (e) =>
          e.from === connection.source &&
          e.to === connection.target &&
          e.fromPort === (connection.sourceHandle || "default") &&
          e.toPort === (connection.targetHandle || "default"),
      );
      if (isDuplicate) return;
      pushSnapshot();
      const edge: CanvasEdgeType = {
        id: uuid(),
        from: connection.source,
        to: connection.target,
        fromPort: connection.sourceHandle || "default",
        toPort: (connection.targetHandle as CanvasEdgeType["toPort"]) || "default",
        inputType: "default",
      };
      useGraphStore.getState().addEdge(edge);
      setEdges((eds) => [...eds, toXyEdge(edge)]);
    },
    [setEdges],
  );

  const onNodeDragStart = useCallback(() => {
    if (!dragSnapshotTaken.current) {
      pushSnapshot();
      dragSnapshotTaken.current = true;
    }
  }, []);

  const onNodeDragStop = useCallback(() => {
    dragSnapshotTaken.current = false;
  }, []);

  const onPaneClick = useCallback(() => {
    useGraphStore.getState().clearSelection();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    useUIStore.getState().hideContextMenu();
    setCreationMenu(null);
  }, [setNodes]);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setCreationMenu(null);
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      useUIStore.getState().showContextMenu({
        type: "canvas",
        x: clientX,
        y: clientY,
      });
    },
    [],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setCreationMenu(null);
      useGraphStore.getState().selectNode(node.id);
      setNodes((nds) =>
        nds.map((n) => ({ ...n, selected: n.id === node.id })),
      );
      useUIStore.getState().showContextMenu({
        type: "node",
        x: event.clientX,
        y: event.clientY,
        targetId: node.id,
      });
    },
    [setNodes],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setCreationMenu(null);
      useUIStore.getState().showContextMenu({
        type: "edge",
        x: event.clientX,
        y: event.clientY,
        targetId: edge.id,
      });
    },
    [],
  );

  // Double-click on pane to create node
  useEffect(() => {
    const tryAttach = () => {
      const container = document.querySelector(".react-flow__pane");
      if (!container) return false;
      const handler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const me = e as MouseEvent;
        useUIStore.getState().hideContextMenu();
        const flowPos = screenToFlowPosition({ x: me.clientX, y: me.clientY });
        setCreationMenu({
          x: me.clientX,
          y: me.clientY,
          flowX: flowPos.x,
          flowY: flowPos.y,
        });
      };
      container.addEventListener("dblclick", handler as EventListener);
      return true;
    };
    if (!tryAttach()) {
      const timer = setInterval(() => {
        if (tryAttach()) clearInterval(timer);
      }, 200);
      return () => clearInterval(timer);
    }
  }, [screenToFlowPosition]);

  // ── Programmatic mutations ──

  const handleCreateNode = useCallback(
    (type: NodeType) => {
      if (!creationMenu) return;
      const dims = NODE_DEFAULT_SIZES[type];
      pushSnapshot();
      const id = uuid();
      const existingCount = useGraphStore.getState().nodes.filter((n) => n.type === type).length;
      let defaultName: string;
      if (type === "input-image") {
        defaultName = `图片${existingCount + 1}`;
      } else if (type === "video-input") {
        defaultName = `视频${existingCount + 1}`;
      } else if (type === "audio-input") {
        defaultName = `音频${existingCount + 1}`;
      } else {
        defaultName = existingCount > 0
          ? `${NODE_TYPE_LABELS[type]} ${existingCount + 1}`
          : NODE_TYPE_LABELS[type];
      }
      const nodeSettings = getDefaultSettings(type);
      // Auto-assign materialOrder for resource input nodes
      if (type === "input-image" || type === "video-input" || type === "audio-input") {
        const maxOrder = useGraphStore.getState().nodes
          .filter((n) => n.type === type)
          .reduce((max, n) => {
            const ord = (n.settings as Record<string, unknown>)?.materialOrder as number ?? 0;
            return ord > max ? ord : max;
          }, 0);
        (nodeSettings as Record<string, unknown>).materialOrder = maxOrder + 1;
      }
      const node: CanvasNode = {
        id,
        type,
        x: creationMenu.flowX - dims.w / 2,
        y: creationMenu.flowY - dims.h / 2,
        width: dims.w,
        height: dims.h,
        content: "",
        prompt: "",
        settings: nodeSettings,
        nodeName: defaultName,
      };
      useGraphStore.getState().addNode(node);
      setNodes((nds) => [...nds, toXyNode(node)]);
      setCreationMenu(null);
    },
    [creationMenu, setNodes],
  );

  const handleCreateNodeFromContextMenu = useCallback(
    (screenX: number, screenY: number) => {
      const flowPos = screenToFlowPosition({ x: screenX, y: screenY });
      setCreationMenu({
        x: screenX,
        y: screenY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    [screenToFlowPosition],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      pushSnapshot();
      useGraphStore.getState().removeNode(nodeId);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    },
    [setNodes],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      useGraphStore.getState().removeEdge(edgeId);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [setEdges],
  );

  // ── Keyboard shortcuts ──

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isEditing) return;

      // Ctrl+S — save project
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        (async () => {
          try {
            const { useProjectStore } = await import("./stores/projectStore");
            const { serializeProject, showSaveDialog, writeProjectFile, browserDownloadProject } = await import("./services/projectService");
            const ps = useProjectStore.getState();
            const content = serializeProject(ps.projectName);
            const isTauriEnv = "__TAURI_INTERNALS__" in window;

            if (isTauriEnv) {
              let path = ps.projectPath;
              if (!path) {
                path = await showSaveDialog(ps.projectName);
                if (!path) return;
                ps.setProjectPath(path);
              }
              await writeProjectFile(path, content);
              const name = path.replace(/.*[/\\]/, "").replace(/\.gaga$/, "");
              if (name) ps.setProjectName(name);
            } else {
              browserDownloadProject(content, ps.projectName);
            }
            ps.markSaved();
            useUIStore.getState().addToast("success", "项目已保存");
          } catch (err) {
            useUIStore.getState().addToast("error", `保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
          }
        })();
        return;
      }
      // Ctrl+Shift+S — save as
      if ((e.ctrlKey || e.metaKey) && e.key === "S") {
        e.preventDefault();
        (async () => {
          try {
            const { useProjectStore } = await import("./stores/projectStore");
            const { serializeProject, showSaveDialog, writeProjectFile, browserDownloadProject } = await import("./services/projectService");
            const ps = useProjectStore.getState();
            const content = serializeProject(ps.projectName);
            const isTauriEnv = "__TAURI_INTERNALS__" in window;

            if (isTauriEnv) {
              const path = await showSaveDialog(ps.projectName);
              if (!path) return;
              await writeProjectFile(path, content);
              ps.setProjectPath(path);
              const name = path.replace(/.*[/\\]/, "").replace(/\.gaga$/, "");
              if (name) ps.setProjectName(name);
            } else {
              browserDownloadProject(content, `${ps.projectName}_副本`);
            }
            ps.markSaved();
            useUIStore.getState().addToast("success", "项目已另存为");
          } catch (err) {
            useUIStore.getState().addToast("error", `另存为失败: ${err instanceof Error ? err.message : "未知错误"}`);
          }
        })();
        return;
      }
      // Ctrl+A — select all nodes
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        const allNodes = getNodes();
        useGraphStore.getState().clearSelection();
        for (const n of allNodes) {
          useGraphStore.getState().addToSelection(n.id);
        }
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }
      // Ctrl+D — duplicate selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        const xyNodes = getNodes();
        const selected = xyNodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        pushSnapshot();
        const newNodes: Node[] = [];
        for (const n of selected) {
          const id = uuid();
          const src = useGraphStore.getState().nodes.find((gn) => gn.id === n.id);
          if (!src) continue;
          const dup: CanvasNode = {
            ...src,
            id,
            x: src.x + 40,
            y: src.y + 40,
            nodeName: src.nodeName || NODE_TYPE_LABELS[src.type] || src.type,
          };
          useGraphStore.getState().addNode(dup);
          newNodes.push(toXyNode(dup));
        }
        setNodes((nds) => [...nds, ...newNodes]);
        return;
      }
      // V — select tool
      if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
        return;
      }
      // B — brush tool
      if (e.key === "b" || e.key === "B") {
        setActiveTool("brush");
        return;
      }
      // E — eraser tool
      if (e.key === "e" || e.key === "E") {
        setActiveTool("eraser");
        return;
      }
      // Ctrl+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const entry = useHistoryStore.getState().undo();
        if (entry) {
          const parsedNodes = JSON.parse(entry.nodes);
          const parsedEdges = JSON.parse(entry.edges);
          const parsedGroups = JSON.parse(entry.groups);
          useGraphStore.getState().loadGraph(parsedNodes, parsedEdges, parsedGroups);
          setNodes(parsedNodes.map(toXyNode));
          setEdges(parsedEdges.map(toXyEdge));
        }
        return;
      }
      // Ctrl+Y / Ctrl+Shift+Z — redo
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        const entry = useHistoryStore.getState().redo();
        if (entry) {
          const parsedNodes = JSON.parse(entry.nodes);
          const parsedEdges = JSON.parse(entry.edges);
          const parsedGroups = JSON.parse(entry.groups);
          useGraphStore.getState().loadGraph(parsedNodes, parsedEdges, parsedGroups);
          setNodes(parsedNodes.map(toXyNode));
          setEdges(parsedEdges.map(toXyEdge));
        }
        return;
      }
      // Delete — delete selected nodes
      if (e.key === "Delete") {
        e.preventDefault();
        const xyNodes = getNodes();
        const selected = xyNodes.filter((n) => n.selected);
        if (selected.length === 0) return;
        pushSnapshot();
        for (const n of selected) {
          useGraphStore.getState().removeNode(n.id);
        }
        setNodes((nds) => nds.filter((n) => !n.selected));
        return;
      }
      // Escape
      if (e.key === "Escape") {
        useGraphStore.getState().clearSelection();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        useUIStore.getState().hideContextMenu();
        setCreationMenu(null);
        return;
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [getNodes, setNodes, setEdges]);

  // ── Crash recovery on startup ──
  useEffect(() => {
    (async () => {
      const { getLocalAutoSave, clearLocalAutoSave, deserializeProject } = await import("./services/projectService");
      const autoSave = getLocalAutoSave();
      if (!autoSave) return;
      try {
        const data = JSON.parse(autoSave);
        const timeSinceAutoSave = Date.now() - (data.autoSavedAt || 0);
        if (timeSinceAutoSave > 30 * 60 * 1000) {
          clearLocalAutoSave();
          return;
        }
        const recovered = window.confirm(
          `检测到未保存的项目（${new Date(data.autoSavedAt).toLocaleString()}），是否恢复？`
        );
        if (recovered) {
          const projectData = deserializeProject(autoSave);
          useGraphStore.getState().loadGraph(projectData.nodes, projectData.edges, projectData.groups);
          setNodes(projectData.nodes.map(toXyNode));
          setEdges(projectData.edges.map(toXyEdge));
          const { useProjectStore } = await import("./stores/projectStore");
          useProjectStore.getState().setProjectName(projectData.projectName || "未命名项目");
          useProjectStore.getState().markModified();
          useUIStore.getState().addToast("success", "项目已恢复");
        }
        clearLocalAutoSave();
      } catch {
        clearLocalAutoSave();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save every 30s ──
  useEffect(() => {
    const interval = setInterval(() => {
      (async () => {
        const { useProjectStore } = await import("./stores/projectStore");
        const ps = useProjectStore.getState();
        if (!ps.modified) return;
        const { autoSaveToLocal } = await import("./services/projectService");
        autoSaveToLocal();
        ps.setLastAutoSavedAt(Date.now());
      })();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ── Mark modified on graph changes ──
  useEffect(() => {
    const unsub = useGraphStore.subscribe(() => {
      import("./stores/projectStore").then(({ useProjectStore }) => {
        useProjectStore.getState().markModified();
      });
    });
    return unsub;
  }, []);

  return (
    <div className={`theme-${theme} canvas-root`}>
      <TopBar onOpenApiSettings={() => setShowApiSettings(true)} />

      <div style={{ paddingTop: 36, paddingLeft: leftToolbarOpen ? 36 : 0, height: "100%" }}>
        <ReactFlow
          defaultNodes={initialNodes}
          defaultEdges={initialEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={() => {
            useUIStore.getState().setConnectingTarget("");
          }}
          onConnectEnd={() => {
            useUIStore.getState().setConnectingTarget(null);
          }}
          onNodeMouseEnter={(_event, node) => {
            const ct = useUIStore.getState().connectingTarget;
            if (ct !== null) {
              useUIStore.getState().setConnectingTarget(node.id);
            }
          }}
          onNodeMouseLeave={() => {
            const ct = useUIStore.getState().connectingTarget;
            if (ct !== null) {
              useUIStore.getState().setConnectingTarget("");
            }
          }}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Strict}
          fitView
          minZoom={0.1}
          maxZoom={3}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          {!performanceMode && (
            <Background
              color={theme === "dark" ? "#27272a" : "#d4d4d8"}
              gap={20}
              size={1}
            />
          )}
          <MiniMap
            nodeColor={(node) =>
              node.id === selectedNodeId
                ? "#3b82f6"
                : theme === "dark"
                  ? "#27272a"
                  : "#d4d4d8"
            }
            maskColor={
              theme === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)"
            }
          />
          <Controls showInteractive={false} />
          <DoodleOverlay />
        </ReactFlow>
      </div>

      <LeftToolbar onCreateNode={handleCreateNodeFromContextMenu} />

      {creationMenu && (
        <NodeCreationMenu
          x={creationMenu.x}
          y={creationMenu.y}
          onCreateNode={handleCreateNode}
          onClose={() => setCreationMenu(null)}
        />
      )}

      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          targetId={contextMenu.targetId}
          onClose={() => useUIStore.getState().hideContextMenu()}
          onCreateNode={handleCreateNodeFromContextMenu}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
        />
      )}

      {showApiSettings && <ApiSettingsDialog onClose={() => setShowApiSettings(false)} />}

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasApp />
    </ReactFlowProvider>
  );
}
