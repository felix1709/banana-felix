import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
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
import { KeybindingSettingsDialog } from "./components/Dialogs/KeybindingSettingsDialog";
import { UpdateChecker } from "./components/Dialogs/UpdateChecker";
import { TopBar } from "./components/Toolbar/TopBar";
import { LeftToolbar } from "./components/Toolbar/LeftToolbar";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { DoodleOverlay } from "./components/Canvas/DoodleOverlay";
import type { CanvasNode, CanvasEdge as CanvasEdgeType, NodeType } from "./types/node";
import { NODE_DEFAULT_SIZES, NODE_TYPE_LABELS, getDefaultSettings } from "./types/node";
import { v4 as uuid } from "uuid";
import { appendUniqueXyEdge, dedupeCanvasEdges } from "./utils/edgeDedup";

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
import { JiaojiaoBubble } from "./components/Agent/JiaojiaoBubble";
import { JiaojiaoPanel } from "./components/Agent/JiaojiaoPanel";
import { useAgentStore } from "./stores/agentStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useProjectAutoSave } from "./hooks/useProjectAutoSave";
import { getMaterialFileName, getNextMaterialName, getNextMaterialOrder } from "./utils/materialNaming";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], .nodrag"));
}

function CanvasApp() {
  const theme = useUIStore((s) => s.theme);
  const performanceMode = useUIStore((s) => s.performanceMode);
  const contextMenu = useUIStore((s) => s.contextMenu);
  const leftToolbarOpen = useUIStore((s) => s.leftToolbarOpen);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const { screenToFlowPosition, getNodes, setNodes, setEdges, setViewport, zoomIn, zoomOut } = useReactFlow();
  useProjectAutoSave(setNodes, setEdges, setViewport);

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
  const lastCanvasPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showKeybindingSettings, setShowKeybindingSettings] = useState(false);
  const [showUpdateChecker, setShowUpdateChecker] = useState(false);

  const keybinding = useUIStore((s) => s.keybinding);

  const panOnDrag = useMemo(() => {
    const map: Record<string, number> = { left: 0, middle: 1, right: 2 };
    return [map[keybinding.panButton]];
  }, [keybinding.panButton]);

  const selectionKeyCode = useMemo(() => {
    if (keybinding.selectButton === "left") return null;
    return null;
  }, [keybinding.selectButton]);

  const handleReverseWheel = useCallback((event: React.WheelEvent) => {
    const delta = event.deltaY;
    if (delta > 0) { zoomIn(); } else if (delta < 0) { zoomOut(); }
  }, [zoomIn, zoomOut]);

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
      setEdges((eds) => appendUniqueXyEdge(eds, toXyEdge(edge)));
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

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const ids = new Set(selectedNodes.map((n) => n.id));
      useGraphStore.getState().selectNodes(ids);
    },
    [],
  );

  // ── Canvas drag & drop (Feature 1) ──

  const [dragOverActive, setDragOverActive] = useState(false);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasFile = Array.from(event.dataTransfer.types).includes("Files");
    if (hasFile) {
      event.dataTransfer.dropEffect = "copy";
      setDragOverActive(true);
    }
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (event.clientX <= rect.left || event.clientX >= rect.right ||
        event.clientY <= rect.top || event.clientY >= rect.bottom) {
      setDragOverActive(false);
    }
  }, []);

  const createImageInputNodeFromFile = useCallback(
    (file: File, screenX: number, screenY: number, offsetIndex = 0) => {
      if (!file.type.startsWith("image/")) return;
      const flowPos = screenToFlowPosition({ x: screenX, y: screenY });
      const dims = NODE_DEFAULT_SIZES["input-image"] ?? { w: 260, h: 260 };
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const graphNodes = useGraphStore.getState().nodes;
        const nodeName = getNextMaterialName(graphNodes, "input-image");
        const nodeSettings = getDefaultSettings("input-image");
        (nodeSettings as Record<string, unknown>).imageUrl = dataUrl;
        (nodeSettings as Record<string, unknown>).fileName = getMaterialFileName(nodeName, "input-image");
        (nodeSettings as Record<string, unknown>).materialOrder = getNextMaterialOrder(graphNodes, "input-image");

        const node: CanvasNode = {
          id: uuid(),
          type: "input-image",
          x: flowPos.x - dims.w / 2 + offsetIndex * 30,
          y: flowPos.y - dims.h / 2 + offsetIndex * 30,
          width: dims.w,
          height: dims.h,
          content: dataUrl,
          prompt: "",
          settings: nodeSettings,
          nodeName,
        };
        useGraphStore.getState().addNode(node);
        setNodes((nds) => [...nds, toXyNode(node)]);
      };
      reader.readAsDataURL(file);
    },
    [screenToFlowPosition, setNodes],
  );

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOverActive(false);
    const files = Array.from(event.dataTransfer.files);
    const mediaFiles = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (mediaFiles.length === 0) return;

    const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    pushSnapshot();

    let offsetX = 0;
    let offsetY = 0;

    for (const file of mediaFiles) {
      if (file.size > 50 * 1024 * 1024) {
        useUIStore.getState().addToast("warning", `文件较大（${(file.size / 1024 / 1024).toFixed(1)}MB），加载可能较慢`);
      }

      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) continue;

      const nodeType: NodeType = isImage ? "input-image" : "video-input";
      const dims = NODE_DEFAULT_SIZES[nodeType] ?? { w: 260, h: 260 };
      const nodeOffsetX = offsetX;
      const nodeOffsetY = offsetY;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const id = uuid();
        const graphNodes = useGraphStore.getState().nodes;
        const defaultName = getNextMaterialName(graphNodes, nodeType);
        const materialOrder = getNextMaterialOrder(graphNodes, nodeType);

        const nodeSettings = getDefaultSettings(nodeType);
        if (isImage) {
          (nodeSettings as Record<string, unknown>).imageUrl = dataUrl;
          (nodeSettings as Record<string, unknown>).fileName = getMaterialFileName(defaultName, nodeType);
          (nodeSettings as Record<string, unknown>).materialOrder = materialOrder;
        } else {
          (nodeSettings as Record<string, unknown>).videoUrl = dataUrl;
          (nodeSettings as Record<string, unknown>).fileName = getMaterialFileName(defaultName, nodeType);
          (nodeSettings as Record<string, unknown>).materialOrder = materialOrder;
        }

        const node: CanvasNode = {
          id,
          type: nodeType,
          x: flowPos.x - dims.w / 2 + nodeOffsetX,
          y: flowPos.y - dims.h / 2 + nodeOffsetY,
          width: dims.w,
          height: dims.h,
          content: dataUrl,
          prompt: "",
          settings: nodeSettings,
          nodeName: defaultName,
        };
        useGraphStore.getState().addNode(node);
        setNodes((nds) => [...nds, toXyNode(node)]);
      };
      reader.readAsDataURL(file);

      offsetX += 30;
      offsetY += 30;
    }
  }, [screenToFlowPosition, setNodes]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest(".react-flow")) {
        lastCanvasPointerRef.current = { x: event.clientX, y: event.clientY };
      }
    };
    document.addEventListener("pointermove", handlePointerMove, true);
    return () => document.removeEventListener("pointermove", handlePointerMove, true);
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const clipboard = event.clipboardData;
      if (!clipboard) return;

      const imageFiles = [
        ...Array.from(clipboard.files).filter((file) => file.type.startsWith("image/")),
        ...Array.from(clipboard.items)
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => Boolean(file)),
      ];
      const uniqueFiles = imageFiles.filter((file, index, list) =>
        list.findIndex((item) => item.name === file.name && item.size === file.size && item.type === file.type) === index,
      );
      if (uniqueFiles.length === 0) return;

      event.preventDefault();
      pushSnapshot();
      const pane = document.querySelector(".react-flow__pane") as HTMLElement | null;
      const paneRect = pane?.getBoundingClientRect();
      const pointer = lastCanvasPointerRef.current;
      const screenPoint = pointer && paneRect &&
        pointer.x >= paneRect.left && pointer.x <= paneRect.right &&
        pointer.y >= paneRect.top && pointer.y <= paneRect.bottom
        ? pointer
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

      uniqueFiles.forEach((file, index) => {
        createImageInputNodeFromFile(file, screenPoint.x, screenPoint.y, index);
      });
      useUIStore.getState().addToast("success", `已从剪贴板创建 ${uniqueFiles.length} 个图片节点`);
    };

    document.addEventListener("paste", handlePaste, true);
    return () => document.removeEventListener("paste", handlePaste, true);
  }, [createImageInputNodeFromFile]);

  const onPaneClick = useCallback(() => {
    useGraphStore.getState().clearSelection();
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    useUIStore.getState().hideContextMenu();
    setCreationMenu(null);
    useAgentStore.getState().closePanel();
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
        if (isEditableTarget(e.target) || (e.target as HTMLElement | null)?.closest(".react-flow__node")) return;
        if (e.target !== container) return;
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
      if (type === "input-image" || type === "video-input" || type === "audio-input") {
        defaultName = getNextMaterialName(useGraphStore.getState().nodes, type);
      } else {
        defaultName = existingCount > 0
          ? `${NODE_TYPE_LABELS[type]} ${existingCount + 1}`
          : NODE_TYPE_LABELS[type];
      }
      const nodeSettings = getDefaultSettings(type);
      // Auto-assign materialOrder for resource input nodes
      if (type === "input-image" || type === "video-input" || type === "audio-input") {
        (nodeSettings as Record<string, unknown>).materialOrder = getNextMaterialOrder(useGraphStore.getState().nodes, type);
        (nodeSettings as Record<string, unknown>).fileName = getMaterialFileName(defaultName, type);
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
            const { serializeProject, showSaveDialog, writeProjectFile, browserDownloadProject, clearTemporaryProject } = await import("./services/projectService");
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
              clearTemporaryProject();
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
            const { serializeProject, showSaveDialog, writeProjectFile, browserDownloadProject, clearTemporaryProject } = await import("./services/projectService");
            const ps = useProjectStore.getState();
            const content = serializeProject(ps.projectName);
            const isTauriEnv = "__TAURI_INTERNALS__" in window;

            if (isTauriEnv) {
              const path = await showSaveDialog(ps.projectName);
              if (!path) return;
              await writeProjectFile(path, content);
              clearTemporaryProject();
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
          setEdges(dedupeCanvasEdges(parsedEdges).map(toXyEdge));
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
          setEdges(dedupeCanvasEdges(parsedEdges).map(toXyEdge));
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

  // ── Silently fetch models on startup ──
  useEffect(() => {
    useWorkspaceStore.getState().fetchModelsSilently();
  }, []);

  return (
    <div className={`theme-${theme} canvas-root`}>
      <TopBar onOpenApiSettings={() => setShowApiSettings(true)} onOpenKeybindingSettings={() => setShowKeybindingSettings(true)} onCheckUpdate={() => setShowUpdateChecker(true)} />

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
          onSelectionChange={onSelectionChange}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={onDragLeave}
          onMoveEnd={(_, viewport) => {
            useGraphStore.getState().setView(viewport);
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Strict}
          noDragClassName="nodrag"
          fitView
          minZoom={0.1}
          maxZoom={3}
          deleteKeyCode={null}
          zoomOnDoubleClick={false}
          selectionOnDrag={keybinding.selectButton === "left"}
          selectionKeyCode={selectionKeyCode}
          panOnDrag={panOnDrag}
          panOnScroll={false}
          zoomOnScroll={keybinding.zoomDirection !== "reverse"}
          onWheel={keybinding.zoomDirection === "reverse" ? handleReverseWheel : undefined}
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
          <DoodleOverlay />
          {dragOverActive && (
            <div
              style={{
                position: "absolute", inset: 0, zIndex: 5,
                background: "rgba(59,130,246,0.08)",
                border: "2px dashed rgba(59,130,246,0.5)",
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <div style={{
                background: "rgba(9,9,11,0.85)", borderRadius: 12, padding: "16px 28px",
                color: "#60a5fa", fontSize: 14, fontWeight: 600,
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              }}>
                释放以导入素材
              </div>
            </div>
          )}
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
      {showKeybindingSettings && <KeybindingSettingsDialog onClose={() => setShowKeybindingSettings(false)} />}
      {showUpdateChecker && <UpdateChecker />}

      <ToastContainer />

      <JiaojiaoBubble />
      <JiaojiaoPanel />
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
