import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { CanvasNode, CanvasEdge, Group, DoodleStroke, TextBox, ViewState } from "../types/node";

interface GraphState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  view: ViewState;
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;
  groups: Group[];
  canvasTextBoxes: TextBox[];
  canvasDoodleStrokes: DoodleStroke[];

  addNode: (node: CanvasNode) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  resizeNode: (id: string, width: number, height: number) => void;

  addEdge: (edge: CanvasEdge) => void;
  removeEdge: (id: string) => void;

  setView: (view: Partial<ViewState>) => void;

  selectNode: (id: string | null) => void;
  selectNodes: (ids: Set<string>) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;

  addGroup: (group: Group) => void;
  removeGroup: (id: string) => void;
  updateGroup: (id: string, patch: Partial<Group>) => void;

  addTextBox: (textBox: TextBox) => void;
  removeTextBox: (id: string) => void;
  updateTextBox: (id: string, patch: Partial<TextBox>) => void;

  addDoodleStroke: (stroke: DoodleStroke) => void;
  removeDoodleStroke: (id: string) => void;
  clearDoodleStrokes: () => void;

  loadGraph: (
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    groups: Group[],
    extras?: {
      view?: ViewState;
      canvasTextBoxes?: TextBox[];
      canvasDoodleStrokes?: DoodleStroke[];
    },
  ) => void;
  clearGraph: () => void;
}

export const useGraphStore = create<GraphState>()(
  immer((set) => ({
    nodes: [],
    edges: [],
    view: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    selectedNodeIds: new Set<string>(),
    groups: [],
    canvasTextBoxes: [],
    canvasDoodleStrokes: [],

    addNode: (node) =>
      set((state) => {
        state.nodes.push(node);
      }),

    removeNode: (id) =>
      set((state) => {
        state.nodes = state.nodes.filter((n) => n.id !== id);
        state.edges = state.edges.filter((e) => e.from !== id && e.to !== id);
        if (state.selectedNodeId === id) state.selectedNodeId = null;
        state.selectedNodeIds.delete(id);
        for (const g of state.groups) {
          g.nodeIds = g.nodeIds.filter((nid) => nid !== id);
        }
      }),

    updateNode: (id, patch) =>
      set((state) => {
        const idx = state.nodes.findIndex((n) => n.id === id);
        if (idx !== -1) Object.assign(state.nodes[idx], patch);
      }),

    moveNode: (id, x, y) =>
      set((state) => {
        const idx = state.nodes.findIndex((n) => n.id === id);
        if (idx !== -1) {
          state.nodes[idx].x = x;
          state.nodes[idx].y = y;
        }
      }),

    resizeNode: (id, width, height) =>
      set((state) => {
        const idx = state.nodes.findIndex((n) => n.id === id);
        if (idx !== -1) {
          state.nodes[idx].width = width;
          state.nodes[idx].height = height;
        }
      }),

    addEdge: (edge) =>
      set((state) => {
        state.edges.push(edge);
      }),

    removeEdge: (id) =>
      set((state) => {
        state.edges = state.edges.filter((e) => e.id !== id);
      }),

    setView: (patch) =>
      set((state) => {
        Object.assign(state.view, patch);
      }),

    selectNode: (id) =>
      set((state) => {
        state.selectedNodeId = id;
        state.selectedNodeIds = id ? new Set([id]) : new Set();
      }),

    selectNodes: (ids) =>
      set((state) => {
        state.selectedNodeIds = ids;
        state.selectedNodeId = ids.size === 1 ? [...ids][0] : null;
      }),

    addToSelection: (id) =>
      set((state) => {
        state.selectedNodeIds.add(id);
        if (state.selectedNodeIds.size === 1) state.selectedNodeId = id;
        else if (state.selectedNodeIds.size > 1) state.selectedNodeId = null;
      }),

    removeFromSelection: (id) =>
      set((state) => {
        state.selectedNodeIds.delete(id);
        if (state.selectedNodeId === id) state.selectedNodeId = null;
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedNodeId = null;
        state.selectedNodeIds = new Set();
      }),

    addGroup: (group) =>
      set((state) => {
        state.groups.push(group);
      }),

    removeGroup: (id) =>
      set((state) => {
        state.groups = state.groups.filter((g) => g.id !== id);
      }),

    updateGroup: (id, patch) =>
      set((state) => {
        const idx = state.groups.findIndex((g) => g.id === id);
        if (idx !== -1) Object.assign(state.groups[idx], patch);
      }),

    addTextBox: (textBox) =>
      set((state) => {
        state.canvasTextBoxes.push(textBox);
      }),

    removeTextBox: (id) =>
      set((state) => {
        state.canvasTextBoxes = state.canvasTextBoxes.filter((t) => t.id !== id);
      }),

    updateTextBox: (id, patch) =>
      set((state) => {
        const idx = state.canvasTextBoxes.findIndex((t) => t.id === id);
        if (idx !== -1) Object.assign(state.canvasTextBoxes[idx], patch);
      }),

    addDoodleStroke: (stroke) =>
      set((state) => {
        state.canvasDoodleStrokes.push(stroke);
      }),

    removeDoodleStroke: (id) =>
      set((state) => {
        state.canvasDoodleStrokes = state.canvasDoodleStrokes.filter((s) => s.id !== id);
      }),

    clearDoodleStrokes: () =>
      set((state) => {
        state.canvasDoodleStrokes = [];
      }),

    loadGraph: (nodes, edges, groups, extras) =>
      set((state) => {
        state.nodes = nodes;
        state.edges = edges;
        state.groups = groups;
        if (extras?.view) state.view = extras.view;
        if (extras?.canvasTextBoxes) state.canvasTextBoxes = extras.canvasTextBoxes;
        if (extras?.canvasDoodleStrokes) state.canvasDoodleStrokes = extras.canvasDoodleStrokes;
        state.selectedNodeId = null;
        state.selectedNodeIds = new Set();
      }),

    clearGraph: () =>
      set((state) => {
        state.nodes = [];
        state.edges = [];
        state.groups = [];
        state.canvasTextBoxes = [];
        state.canvasDoodleStrokes = [];
        state.selectedNodeId = null;
        state.selectedNodeIds = new Set();
        state.view = { x: 0, y: 0, zoom: 1 };
      }),
  })),
);
