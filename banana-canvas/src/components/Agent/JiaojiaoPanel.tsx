import { memo, useCallback, useRef, useEffect, useState } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useGraphStore } from "../../stores/graphStore";
import { useReactFlow } from "@xyflow/react";
import { streamChatMessage, buildCanvasContext, type ChatMessageParam } from "../../services/chatService";
import { getJiaojiaoSystemPrompt, isStoryboardIntent, parseStoryboardFromText, executePromptOptimize, parsePromptOptimizeOutput, parseOptionsFromText, splitTransitionShots, type SplitShot } from "../../services/skillRegistry";
import { ChatBubble } from "./ChatBubble";
import { QuickReplyOptions } from "./QuickReplyOptions";
import { StoryboardModeSelector } from "./StoryboardModeSelector";
import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { v4 as uuid } from "uuid";
import { toXyNode, toXyEdge } from "../../utils/nodeConvert";
import type { CanvasNode, CanvasEdge } from "../../types/node";
import { NODE_DEFAULT_SIZES, getDefaultSettings } from "../../types/node";
import type { DeployPreview, OutputMode, StoryboardOutput } from "../../types/agent";

export const JiaojiaoPanel = memo(function JiaojiaoPanel() {
  const panelOpen = useAgentStore((s) => s.panelOpen);
  const messages = useAgentStore((s) => s.messages);
  const status = useAgentStore((s) => s.status);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const skillPhase = useAgentStore((s) => s.skillPhase);
  const storyboardData = useAgentStore((s) => s.storyboardData);
  const streamingText = useAgentStore((s) => s.streamingText);

  const addMessage = useAgentStore((s) => s.addMessage);
  const setStatus = useAgentStore((s) => s.setStatus);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const closePanel = useAgentStore((s) => s.closePanel);
  const setSkillPhase = useAgentStore((s) => s.setSkillPhase);
  const setStoryboardData = useAgentStore((s) => s.setStoryboardData);
  const resetSkill = useAgentStore((s) => s.resetSkill);
  const setStreamingText = useAgentStore((s) => s.setStreamingText);
  const commitStreamingText = useAgentStore((s) => s.commitStreamingText);
  const createNewSession = useAgentStore((s) => s.createNewSession);

  const remoteModels = useWorkspaceStore((s) => s.remoteModels);
  const { setNodes, setEdges } = useReactFlow();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatModels = (() => {
    const dynamic = remoteModels.filter((m) => m.type === "chat");
    if (dynamic.length > 0) return dynamic.map((m) => ({ id: m.id, label: m.name }));
    return [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet" },
    ];
  })();

  const currentModel = selectedModel || chatModels[0]?.id || "gpt-4o";
  const isStoryboardActive = skillPhase === "collecting" || skillPhase === "choosing";

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, streamingText]);

  // Focus input when panel opens
  useEffect(() => {
    if (panelOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [panelOpen]);

  // Build messages for LLM — strip [OPTIONS] from history so LLM doesn't repeat them
  const buildLLMMessages = useCallback((): ChatMessageParam[] => {
    const systemPrompt = getJiaojiaoSystemPrompt(isStoryboardActive);
    const result: ChatMessageParam[] = [{ role: "system", content: systemPrompt }];

    if (isStoryboardActive) {
      const ctx = buildCanvasContext();
      result[0].content += `\n\n当前画布上下文：\n${ctx}`;
    }

    for (const msg of messages.slice(-20)) {
      if (msg.role === "user" || msg.role === "assistant") {
        const { cleanText } = parseOptionsFromText(msg.content);
        result.push({ role: msg.role, content: cleanText || msg.content });
      }
    }
    return result;
  }, [messages, isStoryboardActive]);

  // ── Core send logic (shared by input + quick reply) ──
  const sendText = useCallback(async (text: string) => {
    if (!text || status === "thinking" || status === "generating" || skillPhase === "choosing") return;

    // Auto-detect storyboard intent
    if (skillPhase === "idle" && isStoryboardIntent(text)) {
      setSkillPhase("collecting");
    }

    addMessage({ role: "user", content: text });
    setInput("");
    setStatus("thinking");
    addMessage({ role: "assistant", content: "" });

    try {
      const llmMessages = buildLLMMessages();
      llmMessages.push({ role: "user", content: text });

      await streamChatMessage({
        model: currentModel,
        messages: llmMessages,
        onChunk: (full) => {
          setStreamingText(full);
        },
        onDone: (fullText) => {
          commitStreamingText();

          // Detect storyboard complete marker
          if (skillPhase === "collecting" || isStoryboardIntent(text)) {
            const storyboard = parseStoryboardFromText(fullText);
            if (storyboard) {
              // Apply shot splitting — always convert to SplitShot[]
              const splitShots = splitTransitionShots(storyboard.shots);
              const splitStoryboard: StoryboardOutput & { shots: SplitShot[] } = { ...storyboard, shots: splitShots };
              setStoryboardData(splitStoryboard);
              setSkillPhase("choosing");
            }
          }

          // Detect prompt optimize intent
          const lower = fullText.toLowerCase();
          if (lower.includes("优化提示词") || lower.includes("优化prompt")) {
            setStatus("generating");
            setTimeout(async () => {
              try {
                const result = await executePromptOptimize({ userRequirement: text, model: currentModel });
                if (result.success) {
                  const promptResult = parsePromptOptimizeOutput(result.data);
                  if (promptResult) {
                    const deploy: DeployPreview = {
                      nodes: [{
                        id: "preview-prompt-gen",
                        type: "gen-image",
                        nodeName: "优化提示词生成",
                        prompt: promptResult.optimized,
                        content: "",
                        settings: { ...getDefaultSettings("gen-image"), model: currentModel } as Record<string, unknown>,
                        position: { x: 100, y: 100 },
                      }],
                      edges: [],
                      confirmed: false,
                    };
                    addMessage({ role: "assistant", content: `提示词优化完成！\n原文：${promptResult.original}\n优化后：${promptResult.optimized}`, skillCall: result });
                    deployToCanvas(deploy);
                  }
                } else {
                  addMessage({ role: "assistant", content: `提示词优化失败：${result.rawText}` });
                }
              } catch (err) {
                addMessage({ role: "assistant", content: `执行出错：${err instanceof Error ? err.message : String(err)}` });
              }
              setStatus("idle");
            }, 0);
            return;
          }

          setStatus("idle");
        },
        onError: (err) => {
          commitStreamingText();
          addMessage({ role: "assistant", content: `出错了：${err.message}` });
          setStatus("idle");
        },
      });
    } catch (err) {
      addMessage({ role: "assistant", content: `请求失败：${err instanceof Error ? err.message : String(err)}` });
      setStatus("idle");
    }
  }, [status, currentModel, skillPhase, addMessage, setStatus, buildLLMMessages, setStreamingText, commitStreamingText, setSkillPhase, setStoryboardData]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text) sendText(text);
  }, [input, sendText]);

  // Quick reply click handler
  const handleQuickReply = useCallback((opt: string) => {
    sendText(opt);
  }, [sendText]);

  // ── Deploy nodes to canvas ──
  const deployToCanvas = useCallback((deploy: DeployPreview) => {
    const idMap = new Map<string, string>();

    for (const pnode of deploy.nodes) {
      const realId = uuid();
      idMap.set(pnode.id, realId);
      const dims = NODE_DEFAULT_SIZES[pnode.type] ?? { w: 260, h: 200 };

      const canvasNode: CanvasNode = {
        id: realId,
        type: pnode.type,
        x: pnode.position.x,
        y: pnode.position.y,
        width: dims.w,
        height: dims.h,
        content: pnode.content,
        prompt: pnode.prompt,
        settings: pnode.settings as CanvasNode["settings"],
        nodeName: pnode.nodeName,
      };

      useGraphStore.getState().addNode(canvasNode);
      setNodes((nds) => [...nds, toXyNode(canvasNode)]);
    }

    for (const pedge of deploy.edges) {
      const realFrom = idMap.get(pedge.from) || pedge.from;
      const realTo = idMap.get(pedge.to) || pedge.to;
      if (!realFrom || !realTo) continue;

      const edge: CanvasEdge = {
        id: uuid(),
        from: realFrom,
        to: realTo,
        fromPort: pedge.fromPort,
        toPort: pedge.toPort as CanvasEdge["toPort"],
        inputType: "default",
      };

      useGraphStore.getState().addEdge(edge);
      setEdges((eds) => [...eds, toXyEdge(edge)]);
    }
  }, [setNodes, setEdges]);

  // ── Build deploy from storyboard with output mode ──
  const buildDeployFromStoryboard = useCallback((storyboard: StoryboardOutput, mode: OutputMode): DeployPreview => {
    const { nodes: existingNodes } = useGraphStore.getState();
    const previewNodes: DeployPreview["nodes"] = [];
    const previewEdges: DeployPreview["edges"] = [];

    let startX = 100;
    let startY = 100;
    if (existingNodes.length > 0) {
      const maxRight = Math.max(...existingNodes.map((n) => n.x + (n.width || 260)));
      startX = maxRight + 60;
      startY = existingNodes[0]?.y ?? 100;
    }

    const genDims = NODE_DEFAULT_SIZES["gen-image"] ?? { w: 260, h: 260 };
    const textDims = NODE_DEFAULT_SIZES["text-node"] ?? { w: 220, h: 120 };
    const rowH = Math.max(genDims.h, textDims.h) + 30;

    // Always apply shot splitting for consistent handling
    const splitShots: SplitShot[] = splitTransitionShots(storyboard.shots);

    if (mode === "full-board") {
      const fullPrompt = buildFullStoryboardPrompt(storyboard, splitShots);
      const textId = "preview-text-full";
      const genId = "preview-gen-full";

      previewNodes.push({
        id: textId,
        type: "text-node",
        nodeName: `${storyboard.title} 整版提示词`,
        prompt: fullPrompt,
        content: fullPrompt,
        settings: { ...getDefaultSettings("text-node") } as Record<string, unknown>,
        position: { x: startX, y: startY },
      });
      previewNodes.push({
        id: genId,
        type: "gen-image",
        nodeName: `${storyboard.title} 生成`,
        prompt: fullPrompt,
        content: "",
        settings: { ...getDefaultSettings("gen-image"), model: currentModel } as Record<string, unknown>,
        position: { x: startX + textDims.w + 30, y: startY },
      });
      previewEdges.push({ from: textId, to: genId, fromPort: "output", toPort: "default" });
    } else {
      // Per-shot mode: each SplitShot gets its own text-node + gen-image pair
      for (let i = 0; i < splitShots.length; i++) {
        const shot = splitShots[i];
        const textId = `preview-text-${i}`;
        const genId = `preview-gen-${i}`;
        const rowY = startY + i * rowH;

        const shotPrompt = buildShotPrompt(storyboard, shot);
        const textContent = buildTextNodeContent(shot, shotPrompt);
        const nodeName = `${shot.segmentLabel}（${shot.time_range}）`;

        previewNodes.push({
          id: textId,
          type: "text-node",
          nodeName,
          prompt: shotPrompt,
          content: textContent,
          settings: { ...getDefaultSettings("text-node") } as Record<string, unknown>,
          position: { x: startX, y: rowY },
        });
        previewNodes.push({
          id: genId,
          type: "gen-image",
          nodeName: `${shot.segmentLabel} 生成`,
          prompt: shotPrompt,
          content: "",
          settings: { ...getDefaultSettings("gen-image"), model: currentModel } as Record<string, unknown>,
          position: { x: startX + textDims.w + 30, y: rowY },
        });
        previewEdges.push({ from: textId, to: genId, fromPort: "output", toPort: "default" });
      }
    }

    return { nodes: previewNodes, edges: previewEdges, confirmed: false };
  }, [currentModel]);

  // ── Handle output mode selection (GUARANTEED deploy) ──
  const handleModeSelect = useCallback((mode: OutputMode) => {
    if (!storyboardData) return;

    setSkillPhase("deploying");
    setStatus("deploying");

    // Always build and deploy — this is guaranteed execution
    const deploy = buildDeployFromStoryboard(storyboardData, mode);
    deployToCanvas(deploy);

    const modeLabel = mode === "full-board" ? "整版" : "分镜头";
    const shotCount = mode === "per-shot" ? splitTransitionShots(storyboardData.shots).length : storyboardData.shots.length;
    addMessage({ role: "assistant", content: `已部署 ${deploy.nodes.length} 个节点到画布（${modeLabel}模式）！\n包含 ${shotCount} 个镜头单元。你可以自由编辑它们。` });
    setStoryboardData(null);
    setSkillPhase("idle");
    setStatus("idle");
  }, [storyboardData, addMessage, setSkillPhase, setStoryboardData, setStatus, buildDeployFromStoryboard, deployToCanvas]);

  const handleRestart = useCallback(() => {
    resetSkill();
    addMessage({ role: "assistant", content: "已重置分镜创作流程，欢迎随时开始新的创作！想做什么类型的分镜？" });
  }, [resetSkill, addMessage]);

  const handleModify = useCallback(() => {
    setSkillPhase("collecting");
    addMessage({ role: "assistant", content: "好的，请告诉我你想修改哪些镜头或内容？" });
  }, [setSkillPhase, addMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!panelOpen) return null;

  const statusLabel: Record<string, string> = {
    idle: "空闲",
    thinking: "思考中...",
    generating: "创作中...",
    deploying: "部署中...",
  };

  const phaseLabel: Record<string, string> = {
    idle: "",
    collecting: "🎬 分镜创作中",
    choosing: "📋 请选择输出模式",
    deploying: "🚀 部署中",
  };

  // Options are rendered inline per message via parseOptionsFromText

  return (
    <div
      className="jiaojiao-panel"
      style={{
        position: "fixed",
        left: 36, top: 36, bottom: 0, width: 380,
        zIndex: 200,
        display: "flex", flexDirection: "column",
        background: "#09090b",
        borderRight: "1px solid #27272a",
        borderTop: "1px solid #27272a",
        boxShadow: "4px 0 16px rgba(0,0,0,0.4)",
        transform: panelOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.3s ease",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #27272a", background: "#18181b" }}>
        <span style={{ fontSize: 18 }}>🍌</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#facc15" }}>蕉蕉</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => { createNewSession(); setShowHistory(false); }}
          className="jiaojiao-header-btn jiaojiao-new-chat-btn"
          title="新建对话"
          style={{
            background: "#16a34a", border: "none", color: "#ffffff",
            cursor: "pointer", fontSize: 12, fontWeight: 700, lineHeight: 1,
            padding: "5px 12px", borderRadius: 6,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#15803d"; e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "scale(1)"; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
        >+ 新对话</button>
        <button type="button" onClick={() => setShowHistory(!showHistory)}
          className="jiaojiao-header-btn jiaojiao-history-btn"
          title="历史记录"
          style={{
            background: showHistory ? "#1d4ed8" : "#2563eb", border: "none", color: "#ffffff",
            cursor: "pointer", fontSize: 12, fontWeight: 700, lineHeight: 1,
            padding: "5px 12px", borderRadius: 6,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = showHistory ? "#1d4ed8" : "#2563eb"; e.currentTarget.style.transform = "scale(1)"; }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
        >&#128339; 历史</button>
        <select
          value={currentModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          title="选择模型"
          aria-label="选择模型"
          style={{ fontSize: 10, padding: "2px 4px", borderRadius: 4, border: "1px solid #3f3f46", background: "#0f0f0f", color: "#a1a1aa", maxWidth: 120 }}
        >
          {chatModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <button type="button" onClick={closePanel} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: 16, lineHeight: 1 }} title="收起">✕</button>
      </div>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "#0f0f0f" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: status === "idle" ? "#22c55e" : "#f97316", boxShadow: status !== "idle" ? "0 0 6px #f97316" : "none" }} />
        <span style={{ fontSize: 10, color: "#71717a" }}>{statusLabel[status] ?? "空闲"}</span>
        {phaseLabel[skillPhase] && (
          <span style={{ fontSize: 10, color: "#f97316", marginLeft: 4 }}>{phaseLabel[skillPhase]}</span>
        )}
      </div>

      {/* Messages area (relative for SessionHistoryPanel overlay) */}
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <SessionHistoryPanel open={showHistory} onClose={() => setShowHistory(false)} />
        <div
          ref={scrollRef}
          className="custom-scrollbar"
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 12px", background: "#09090b" }}
        >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#3f3f46", fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🍌</div>
            <div>你好！我是蕉蕉～</div>
            <div>想创作什么类型的作品？</div>
            <div style={{ marginTop: 8, color: "#52525b" }}>试试说「帮我画分镜」</div>
          </div>
        )}
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === "assistant" && i === messages.length - 1 && status === "thinking";
          const { cleanText, option: msgOption } = parseOptionsFromText(msg.content);
          return (
            <div key={msg.id}>
              <ChatBubble
                message={{ ...msg, content: cleanText || msg.content }}
                streaming={isLastAssistant}
                streamingText={isLastAssistant ? streamingText : undefined}
              />
              {/* Show quick options for this message (not streaming, not during mode selection) */}
              {msgOption && !isLastAssistant && skillPhase !== "choosing" && (
                <QuickReplyOptions
                  options={msgOption.options}
                  hint={msgOption.hint}
                  onSelect={handleQuickReply}
                />
              )}
            </div>
          );
        })}

        {/* Streaming options preview */}
        {status === "thinking" && streamingText && (() => {
          const { option: streamOption } = parseOptionsFromText(streamingText);
          if (streamOption) {
            return (
              <div style={{ opacity: 0.5, pointerEvents: "none" }}>
                <QuickReplyOptions options={streamOption.options} hint={streamOption.hint} onSelect={() => {}} />
              </div>
            );
          }
          return null;
        })()}

        {/* Output mode selector */}
        {skillPhase === "choosing" && storyboardData && (
          <StoryboardModeSelector storyboard={storyboardData} onModeSelect={handleModeSelect} />
        )}

        {/* Completion actions */}
        {skillPhase === "idle" && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" &&
          messages[messages.length - 1].content.includes("已部署") && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={handleRestart} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #3f3f46", background: "transparent", color: "#a1a1aa", fontSize: 11, cursor: "pointer" }}>
              重启新对话
            </button>
            <button type="button" onClick={handleModify} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #f97316", background: "rgba(249,115,22,0.1)", color: "#f97316", fontSize: 11, cursor: "pointer" }}>
              继续修改
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid #27272a", background: "#18181b" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={skillPhase === "choosing" ? "请先选择输出模式..." : "和蕉蕉聊聊创作想法..."}
          disabled={status === "thinking" || status === "generating" || skillPhase === "choosing"}
          style={{ flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid #3f3f46", background: "#0f0f0f", color: "#e4e4e7", outline: "none" }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={status === "thinking" || status === "generating" || !input.trim() || skillPhase === "choosing"}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none", fontWeight: 600, fontSize: 12,
            background: (status === "thinking" || status === "generating" || !input.trim() || skillPhase === "choosing") ? "#27272a" : "#f97316",
            color: (status === "thinking" || status === "generating" || !input.trim() || skillPhase === "choosing") ? "#52525b" : "#ffffff",
            cursor: (status === "thinking" || status === "generating" || !input.trim() || skillPhase === "choosing") ? "not-allowed" : "pointer",
          }}
        >
          发送
        </button>
      </div>
    </div>
  );
});

// ── Prompt builders ──

function buildFullStoryboardPrompt(sb: StoryboardOutput, splitShots: SplitShot[]): string {
  const shotsText = splitShots.map((s) =>
    `【${s.segmentLabel}】${s.time_range}\n景别：${s.camera}\n主体：${s.subject}\n动作：${s.action}\n描述：${s.description}`
  ).join("\n\n");

  const sceneStyle = sb.scene_style
    ? `\n场景风格：${sb.scene_style.atmosphere}，${sb.scene_style.character_appearance}，${sb.scene_style.color_tone}，${sb.scene_style.lighting}，${sb.scene_style.texture}`
    : "";

  return `你是国际一流的动画广告分镜师，现在参与${sb.genre}项目制作。
设计一组镜头，剧情描述：${sb.title}
要求：创建一个故事板，比例${sb.aspect_ratio}

风格：${sb.style.art_style}，色彩：${sb.style.color_palette}，光影：${sb.style.lighting}${sceneStyle}

${shotsText}

整洁的插图、流畅的阴影处理、柔和的照明效果、控制的细节处理、简约的纹理、高清晰度、精致的边缘、平滑的渐变过渡、无噪点、无颗粒感。文字必须清晰、准确、可读。`;
}

function buildShotPrompt(sb: StoryboardOutput, shot: SplitShot): string {
  const sceneStyle = sb.scene_style
    ? `场景风格：${sb.scene_style.atmosphere}，${sb.scene_style.character_appearance}，${sb.scene_style.lighting}，${sb.scene_style.texture}。`
    : "";

  return `${shot.description}, ${shot.camera}, ${sb.style.art_style}, ${sb.style.color_palette}, ${sb.style.lighting}, ${sceneStyle}cinematic, high quality. 整洁的插图、流畅的阴影处理、柔和的照明效果、高清晰度、文字必须清晰可读。`;
}

function buildTextNodeContent(shot: SplitShot, prompt: string): string {
  const refHint = shot.ref_images && shot.ref_images.length > 0
    ? shot.ref_images.map((_r, i) => `@图片${i + 1}`).join("、")
    : "（留空，可添加参考图）";

  return `【${shot.segmentLabel}】${shot.time_range}
━━━━━━━━━━
景别：${shot.camera}
主体：${refHint}
动作：${shot.action}
运镜：${shot.camera}
画面：${shot.description}

提示词：${prompt}`;
}
