import { memo, useCallback, useState, useRef, useMemo, useEffect } from "react";
import { v4 as uuid } from "uuid";
import type { NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { BaseNode } from "../BaseNode";
import { useGraphStore } from "../../../stores/graphStore";
import { useNodeSettings } from "../../../hooks/useNodeSettings";
import { useUIStore } from "../../../stores/uiStore";
import { usePresetStore } from "../../../stores/promptPresetStore";
import { getMentionableNodes, parseMentions } from "../../../hooks/useMentionParser";
import { NODE_TYPE_LABELS } from "../../../types/node";
import type { CanvasEdge, NodeType } from "../../../types/node";
import type { TextNodeSettings } from "../../../types/settings";
import { stripReferenceMention } from "./referenceRemoval";
import { caretMenuStyle, getCaretMenuPosition, type CaretMenuPosition } from "../../../utils/caretMenuPosition";
import { insertMentionAtSelection, readTextareaSelection, restoreTextareaSelection } from "./promptInsertion";

interface AtQuery {
  index: number;
  text: string;
}

type PromptTab = "positive" | "negative" | "quality";

const TAB_META: Record<PromptTab, { label: string; color: string; activeColor: string }> = {
  positive: { label: "正向提示", color: "#3b82f6", activeColor: "#3b82f6" },
  negative: { label: "负面提示", color: "#ef4444", activeColor: "#ef4444" },
  quality: { label: "质量提示", color: "#22c55e", activeColor: "#22c55e" },
};

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const updateNode = useGraphStore((s) => s.updateNode);
  const allNodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const { settings, updateSettings } = useNodeSettings<TextNodeSettings>(id);
  const { setNodes: setXyNodes, setEdges: setXyEdges } = useReactFlow();

  const prompt = (data?.prompt as string) ?? "";
  const content = (data?.content as string) ?? "";
  const [tab, setTab] = useState<PromptTab>("positive");

  const currentText = tab === "positive"
    ? prompt
    : tab === "negative"
      ? (settings.negativePrompt ?? content)
      : (settings.qualityPrompt ?? "");

  // Controlled textarea state
  const [localText, setLocalText] = useState(currentText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [atQuery, setAtQuery] = useState<AtQuery | null>(null);
  const [mentionMenuPosition, setMentionMenuPosition] = useState<CaretMenuPosition | null>(null);

  // Sync when tab or external data changes
  useEffect(() => {
    setLocalText(currentText);
    setAtQuery(null);
    setMentionMenuPosition(null);
  }, [currentText, tab]);

  // Mentionable nodes
  const mentionableNodes = useMemo(
    () => getMentionableNodes(allNodes, id),
    [allNodes, id],
  );

  const filteredMentions = useMemo(() => {
    if (!atQuery) return [];
    const q = atQuery.text.toLowerCase();
    return mentionableNodes.filter((n) => n.nodeName.toLowerCase().includes(q));
  }, [atQuery, mentionableNodes]);

  const referenceChips = useMemo(() => {
    const byKey = new Map<string, { nodeId: string; nodeName: string; nodeType: NodeType; content: string; edgeId?: string }>();

    for (const edge of edges.filter((edge) => edge.to === id)) {
      const node = allNodes.find((n) => n.id === edge.from);
      if (!node) continue;
      byKey.set(edge.id, {
        edgeId: edge.id,
        nodeId: node.id,
        nodeName: node.nodeName || NODE_TYPE_LABELS[node.type],
        nodeType: node.type,
        content: node.content,
      });
    }

    for (const mention of parseMentions(localText, allNodes)) {
      const edge = edges.find((candidate) => candidate.to === id && candidate.from === mention.nodeId);
      byKey.set(edge?.id ?? `mention-${mention.nodeId}`, {
        edgeId: edge?.id,
        nodeId: mention.nodeId,
        nodeName: mention.nodeName,
        nodeType: mention.nodeType as NodeType,
        content: mention.content,
      });
    }

    return Array.from(byKey.values());
  }, [allNodes, edges, id, localText]);

  // Sync text to store (real-time)
  const syncToStore = useCallback(
    (val: string) => {
      if (tab === "positive") {
        updateNode(id, { prompt: val });
        setXyNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, prompt: val } } : n,
          ),
        );
      } else if (tab === "negative") {
        updateSettings({ negativePrompt: val });
        updateNode(id, { content: val });
        setXyNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, content: val } } : n,
          ),
        );
      } else {
        updateSettings({ qualityPrompt: val });
      }
    },
    [id, tab, updateNode, setXyNodes, updateSettings],
  );

  const removeReference = useCallback(
    (ref: { nodeId: string; nodeName: string; edgeId?: string }) => {
      if (ref.edgeId) {
        useGraphStore.getState().removeEdge(ref.edgeId);
        setXyEdges((eds) => eds.filter((edge) => edge.id !== ref.edgeId));
      } else {
        const matchingEdges = useGraphStore.getState().edges.filter((edge) => edge.to === id && edge.from === ref.nodeId);
        for (const edge of matchingEdges) useGraphStore.getState().removeEdge(edge.id);
        setXyEdges((eds) => eds.filter((edge) => !(edge.target === id && edge.source === ref.nodeId)));
      }

      const nextText = stripReferenceMention(localText, ref.nodeName);
      setLocalText(nextText);
      syncToStore(nextText);
    },
    [id, localText, setXyEdges, syncToStore],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const selection = readTextareaSelection(e.target, val.length);
      setLocalText(val);
      syncToStore(val);
      restoreTextareaSelection(textareaRef.current, selection.start);

      const pos = selection.start;
      const textBefore = val.slice(0, pos);
      const atMatch = textBefore.match(/@([^\s@]*)$/);
      if (atMatch && mentionableNodes.length > 0) {
        setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
        setMentionMenuPosition(getCaretMenuPosition(e.target));
      } else {
        setAtQuery(null);
        setMentionMenuPosition(null);
      }
    },
    [mentionableNodes, syncToStore],
  );

  const insertMention = useCallback(
    (refName: string) => {
      const currentText = textareaRef.current?.value ?? localText;
      const selection = readTextareaSelection(textareaRef.current, currentText.length);
      const { nextText: newVal, cursor } = insertMentionAtSelection(currentText, refName, selection, atQuery);
      const mentionedNode = mentionableNodes.find((n) => n.nodeName === refName);
      if (mentionedNode) {
        const existingEdges = useGraphStore.getState().edges;
        const alreadyConnected = existingEdges.some((edge) => edge.from === mentionedNode.nodeId && edge.to === id);
        if (!alreadyConnected) {
          const edge: CanvasEdge = {
            id: uuid(),
            from: mentionedNode.nodeId,
            to: id,
            fromPort: "default",
            toPort: "default",
            inputType: "default",
          };
          useGraphStore.getState().addEdge(edge);
          setXyEdges((eds) => [...eds, {
            id: edge.id,
            source: edge.from,
            target: edge.to,
            sourceHandle: edge.fromPort,
            targetHandle: edge.toPort,
            type: "canvas",
            data: { inputType: edge.inputType },
          }]);
        }
      }
      setLocalText(newVal);
      syncToStore(newVal);
      setAtQuery(null);
      setMentionMenuPosition(null);
      restoreTextareaSelection(textareaRef.current, cursor);
    },
    [atQuery, id, localText, mentionableNodes, setXyEdges, syncToStore],
  );

  // ── Preset logic ──
  const presets = usePresetStore((s) => s.presets);
  const addPreset = usePresetStore((s) => s.addPreset);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const [presetOpen, setPresetOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const applyPreset = useCallback(
    (preset: { positivePrompt: string; negativePrompt: string; qualityPrompt: string }) => {
      if (preset.positivePrompt) {
        updateNode(id, { prompt: preset.positivePrompt });
        setXyNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, prompt: preset.positivePrompt } } : n,
          ),
        );
      }
      if (preset.negativePrompt) {
        updateSettings({ negativePrompt: preset.negativePrompt });
        updateNode(id, { content: preset.negativePrompt });
        setXyNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, content: preset.negativePrompt } } : n,
          ),
        );
      }
      if (preset.qualityPrompt) {
        updateSettings({ qualityPrompt: preset.qualityPrompt });
      }
      // Refresh local text for current tab
      if (tab === "positive" && preset.positivePrompt) setLocalText(preset.positivePrompt);
      else if (tab === "negative" && preset.negativePrompt) setLocalText(preset.negativePrompt);
      else if (tab === "quality" && preset.qualityPrompt) setLocalText(preset.qualityPrompt);
      setPresetOpen(false);
    },
    [id, tab, updateNode, setXyNodes, updateSettings],
  );

  const saveCurrentAsPreset = useCallback(() => {
    if (!newPresetName.trim()) return;
    addPreset({
      name: newPresetName.trim(),
      positivePrompt: prompt,
      negativePrompt: settings.negativePrompt ?? "",
      qualityPrompt: settings.qualityPrompt ?? "",
    });
    setNewPresetName("");
    setSaveDialogOpen(false);
  }, [newPresetName, addPreset, prompt, settings.negativePrompt, settings.qualityPrompt]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [localText]);

  const charCount = localText.length;

  const inputStyle = {
    background: isDark ? "#27272a" : "#f4f4f5",
    borderColor: isDark ? "#3f3f46" : "#d4d4d8",
    color: isDark ? "#e4e4e7" : "#18181b",
  };

  const placeholderMap: Record<PromptTab, string> = {
    positive: "输入提示词，描述你想要的画面... @引用节点",
    negative: "输入不想要的元素，如：模糊、低质量...",
    quality: "输入质量增强词，如：4K, masterpiece, best quality...",
  };

  return (
    <BaseNode id={id} type="text-node" selected={selected}>
      {/* Tab bar + Preset button */}
      <div className="flex items-center gap-1 mb-1.5">
        {(Object.keys(TAB_META) as PromptTab[]).map((t) => {
          const meta = TAB_META[t];
          const isActive = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="text-[11px] px-2 py-0.5 rounded"
              style={{
                background: isActive ? meta.activeColor : "transparent",
                color: isActive ? "#fff" : (isDark ? "#a1a1aa" : "#71717a"),
              }}
            >
              {meta.label}
            </button>
          );
        })}
        {/* Preset button */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => { setPresetOpen(!presetOpen); setSaveDialogOpen(false); }}
            className="text-[10px] px-1.5 py-0.5 rounded border nodrag"
            style={{
              borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              color: isDark ? "#a1a1aa" : "#71717a",
              background: isDark ? "#27272a" : "#f4f4f5",
            }}
          >
            预设 ▾
          </button>
          {presetOpen && (
            <div
              className="absolute right-0 z-50 rounded-lg border shadow-lg overflow-hidden nodrag"
              style={{
                top: "100%",
                minWidth: 180,
                background: isDark ? "#27272a" : "#ffffff",
                borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              }}
            >
              {/* Save new preset */}
              {saveDialogOpen ? (
                <div className="p-2 flex gap-1">
                  <input
                    autoFocus
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="预设名称"
                    className="flex-1 text-[10px] px-1.5 py-0.5 rounded border outline-none"
                    style={inputStyle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCurrentAsPreset();
                      if (e.key === "Escape") setSaveDialogOpen(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={saveCurrentAsPreset}
                    className="text-[10px] px-2 py-0.5 rounded text-white"
                    style={{ background: "#3b82f6" }}
                  >
                    保存
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full text-[10px] px-2 py-1.5 text-left"
                  style={{ color: isDark ? "#a1a1aa" : "#71717a" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isDark ? "#3f3f46" : "#f4f4f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={() => setSaveDialogOpen(true)}
                >
                  + 保存当前为预设
                </button>
              )}
              {/* Preset list */}
              {presets.length > 0 && (
                <div className="border-t" style={{ borderColor: isDark ? "#3f3f46" : "#d4d4d8" }}>
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-2 py-1 group"
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = isDark ? "#3f3f46" : "#f4f4f5";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <button
                        type="button"
                        className="text-[10px] text-left flex-1 truncate"
                        style={{ color: isDark ? "#e4e4e7" : "#18181b" }}
                        onClick={() => applyPreset(p)}
                        title={`${p.name}\n正向: ${p.positivePrompt || "(空)"}\n负面: ${p.negativePrompt || "(空)"}\n质量: ${p.qualityPrompt || "(空)"}`}
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        className="text-[9px] opacity-0 group-hover:opacity-100 ml-1 px-1"
                        style={{ color: "#ef4444" }}
                        onClick={() => deletePreset(p.id)}
                        title="删除预设"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {presets.length === 0 && !saveDialogOpen && (
                <div className="text-[9px] px-2 py-1.5" style={{ color: isDark ? "#52525b" : "#a1a1aa" }}>
                  暂无预设
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Textarea with @mention */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={handleChange}
          placeholder={placeholderMap[tab]}
          className="w-full text-xs rounded border outline-none resize-none p-2 overflow-hidden"
          style={{ minHeight: 60, ...inputStyle }}
          onKeyDown={(e) => {
            if (atQuery && filteredMentions.length > 0 && e.key === "Enter") {
              e.preventDefault();
              const first = filteredMentions[0];
              insertMention(first.nodeName);
            }
            if (atQuery && e.key === "Escape") {
              setAtQuery(null);
              setMentionMenuPosition(null);
            }
          }}
        />
        {atQuery && filteredMentions.length > 0 && (
          <div
            className="nodrag rounded-lg border shadow-lg overflow-hidden"
            style={{
              ...caretMenuStyle(mentionMenuPosition, {
                background: isDark ? "#27272a" : "#ffffff",
                borderColor: isDark ? "#3f3f46" : "#d4d4d8",
              }),
            }}
          >
            {filteredMentions.map((node) => {
              return (
                <button
                  key={node.nodeId}
                  type="button"
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-left nodrag"
                  style={{ color: isDark ? "#e4e4e7" : "#18181b" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isDark ? "#3f3f46" : "#f4f4f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={() => insertMention(node.nodeName)}
                >
                  {(node.nodeType === "input-image" || node.nodeType === "gen-image") && node.content && (
                    <img src={node.content} alt="" className="w-4 h-4 rounded object-cover" />
                  )}
                  {node.nodeType === "video-input" && (
                    <span className="text-[10px]" style={{ color: "#f97316" }}>▶</span>
                  )}
                  {node.nodeType === "audio-input" && (
                    <span className="text-[10px]" style={{ color: "#22c55e" }}>♪</span>
                  )}
                  <span className="text-[10px]" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                    @{node.nodeName}
                  </span>
                  <span className="text-[9px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
                    {NODE_TYPE_LABELS[node.nodeType as NodeType]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {referenceChips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {referenceChips.map((ref) => (
            <button
              key={ref.edgeId ?? ref.nodeId}
              type="button"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border nodrag"
              onClick={() => removeReference(ref)}
              title={`删除引用 ${ref.nodeName}`}
              style={{
                borderColor: isDark ? "#3f3f46" : "#d4d4d8",
                background: isDark ? "#18181b" : "#f4f4f5",
                color: isDark ? "#e4e4e7" : "#18181b",
              }}
            >
              {(ref.nodeType === "input-image" || ref.nodeType === "gen-image") && ref.content && (
                <img src={ref.content} alt="" className="w-3.5 h-3.5 rounded object-cover" />
              )}
              {(ref.nodeType === "video-input" || ref.nodeType === "gen-video") && (
                <span className="text-[9px]" style={{ color: "#f97316" }}>VID</span>
              )}
              {(ref.nodeType === "audio-input" || ref.nodeType === "gen-music") && (
                <span className="text-[9px]" style={{ color: "#22c55e" }}>AUD</span>
              )}
              <span className="text-[9px]" style={{ color: isDark ? "#a78bfa" : "#7c3aed" }}>
                @{ref.nodeName}
              </span>
              <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
                X
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Footer: char count + hint */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px]" style={{ color: isDark ? "#71717a" : "#a1a1aa" }}>
          字数: {charCount}
        </span>
        <span className="text-[9px]" style={{ color: isDark ? "#52525b" : "#d4d4d8" }}>
          输入 @引用节点
        </span>
      </div>
    </BaseNode>
  );
});
