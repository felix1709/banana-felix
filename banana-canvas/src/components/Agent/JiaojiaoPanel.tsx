import { memo, useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useGraphStore } from "../../stores/graphStore";
import { useReactFlow } from "@xyflow/react";
import { sendChatMessage, streamChatMessage, buildCanvasContext, type ChatMessageParam } from "../../services/chatService";
import { getJiaojiaoSystemPrompt, isStoryboardIntent, shouldUseStoryboardSkill, parseStoryboardFromText, executePromptOptimize, parsePromptOptimizeOutput, parseOptionsFromText, splitTransitionShots, isPromptOptimizeIntent, extractPromptOptimizeText, JIAOJIAO_HOME_OPTIONS, isPromptLibraryIntent, isLineArtStoryboardIntent, isEmotionDirectorRequired, type JiaojiaoSkillId, type SplitShot } from "../../services/skillRegistry";
import { ChatBubble } from "./ChatBubble";
import { QuickReplyOptions } from "./QuickReplyOptions";
import { StoryboardModeSelector } from "./StoryboardModeSelector";
import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { shouldShowInlineOptions } from "./quickReplyOptionsUtils";
import { v4 as uuid } from "uuid";
import { toXyNode, toXyEdge } from "../../utils/nodeConvert";
import { appendUniqueXyEdge } from "../../utils/edgeDedup";
import type { CanvasNode, CanvasEdge } from "../../types/node";
import { NODE_DEFAULT_SIZES, getDefaultSettings } from "../../types/node";
import type { DeployPreview, OutputMode, StoryboardOutput } from "../../types/agent";
import { getMentionableNodes } from "../../hooks/useMentionParser";
import {
  buildReferencedImageParts,
  buildReferencedImagePromptContext,
  selectImageRecognitionModel,
  type ReferencedImagePart,
} from "./agentImageMentions";
import { parseImageNodeSpecsForAgentCommand, type AgentImageNodeSpec } from "./agentNodeCommands";
import { caretMenuStyle, getCaretMenuPosition, type CaretMenuPosition } from "../../utils/caretMenuPosition";
import { CaretMenuPortal } from "../Canvas/nodes/CaretMenuPortal";

export const JiaojiaoPanel = memo(function JiaojiaoPanel() {
  const panelOpen = useAgentStore((s) => s.panelOpen);
  const messages = useAgentStore((s) => s.messages);
  const status = useAgentStore((s) => s.status);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const skillPhase = useAgentStore((s) => s.skillPhase);
  const storyboardData = useAgentStore((s) => s.storyboardData);
  const streamingText = useAgentStore((s) => s.streamingText);
  const panelScrollTop = useAgentStore((s) => s.panelScrollTop);

  const addMessage = useAgentStore((s) => s.addMessage);
  const setStatus = useAgentStore((s) => s.setStatus);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const closePanel = useAgentStore((s) => s.closePanel);
  const setPanelScrollTop = useAgentStore((s) => s.setPanelScrollTop);
  const setSkillPhase = useAgentStore((s) => s.setSkillPhase);
  const setStoryboardData = useAgentStore((s) => s.setStoryboardData);
  const resetSkill = useAgentStore((s) => s.resetSkill);
  const setStreamingText = useAgentStore((s) => s.setStreamingText);
  const commitStreamingText = useAgentStore((s) => s.commitStreamingText);
  const createNewSession = useAgentStore((s) => s.createNewSession);

  const remoteModels = useWorkspaceStore((s) => s.remoteModels);
  const allNodes = useGraphStore((s) => s.nodes);
  const { setNodes, setEdges } = useReactFlow();

  const [input, setInput] = useState("");
  const [atQuery, setAtQuery] = useState<{ index: number; text: string } | null>(null);
  const [mentionMenuPosition, setMentionMenuPosition] = useState<CaretMenuPosition | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSkillId, setActiveSkillId] = useState<JiaojiaoSkillId | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);

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
  const imageMentionOptions = useMemo(
    () => getMentionableNodes(allNodes, "__jiaojiao__").filter((node) =>
      (node.nodeType === "input-image" || node.nodeType === "gen-image") &&
      typeof node.content === "string" &&
      (node.content.startsWith("data:image") || node.content.startsWith("http")),
    ),
    [allNodes],
  );
  const filteredImageMentions = useMemo(() => {
    if (!atQuery) return [];
    const q = atQuery.text.toLowerCase();
    return imageMentionOptions.filter((node) => node.nodeName.toLowerCase().includes(q));
  }, [atQuery, imageMentionOptions]);

  // Restore the last reading position when the panel reopens.
  useEffect(() => {
    if (!panelOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(panelScrollTop, maxTop);
      shouldStickToBottomRef.current = maxTop - el.scrollTop < 48;
    });
  }, [panelOpen, panelScrollTop]);

  // Follow new replies only when the user is already near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !shouldStickToBottomRef.current) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setPanelScrollTop(el.scrollTop);
    });
  }, [messages.length, streamingText, setPanelScrollTop]);

  // Keep the reply box ready when the panel opens.
  useEffect(() => {
    if (panelOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [panelOpen]);

  // Build messages for LLM — strip [OPTIONS] from history so LLM doesn't repeat them
  const buildLLMMessages = useCallback((storyboardActive = isStoryboardActive, requestedSkillId = activeSkillId): ChatMessageParam[] => {
    const systemPrompt = `${getJiaojiaoSystemPrompt(storyboardActive, requestedSkillId)}

参考图交互规则：当你需要参考图时，优先引导用户在对话框输入 @ 来引用画布上的图片。收到 @ 图片引用后，先分析图片主体、风格、色彩、构图和可用于分镜的信息，再给出下一步建议。`;
    const result: ChatMessageParam[] = [{ role: "system", content: systemPrompt }];

    const ctx = buildCanvasContext();
    result[0].content += `\n\n当前画布上下文：\n${ctx}`;

    for (const msg of messages.slice(-20)) {
      if (msg.role === "user" || msg.role === "assistant") {
        const { cleanText } = parseOptionsFromText(msg.content);
        result.push({ role: msg.role, content: cleanText || msg.content });
      }
    }
    return result;
  }, [messages, isStoryboardActive, activeSkillId]);

  // ── Core send logic (shared by input + quick reply) ──
  const recognizeReferencedImages = useCallback(async (
    referencedImages: ReferencedImagePart[],
    storyboardActive: boolean,
  ): Promise<string> => {
    if (referencedImages.length === 0) return "";
    const recognitionModel = selectImageRecognitionModel(currentModel, remoteModels);
    if (!recognitionModel) return "";

    const imageNames = referencedImages.map((image) => `@${image.nodeName}`).join("、");
    try {
      return await sendChatMessage({
        model: recognitionModel,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `请识别这些画布参考图：${imageNames}。请用中文简洁总结每张图的主体、角色/场景、构图、色彩、光影、风格，以及可用于${storyboardActive ? "分镜创作" : "后续创作"}的信息。`,
            },
            ...referencedImages.map((image) => ({
              type: "image_url" as const,
              image_url: { url: image.imageUrl },
            })),
          ],
        }],
        temperature: 0.2,
        maxTokens: 1200,
      });
    } catch {
      return "";
    }
  }, [currentModel, remoteModels]);

  const buildUserMessageContent = useCallback((text: string, referencedImages: ReferencedImagePart[], imageAnalysis = ""): string => {
    if (referencedImages.length === 0) return text;
    return `${text}\n\n${buildReferencedImagePromptContext(referencedImages, {
      storyboardActive: activeSkillId === "line-art-storyboard" || isStoryboardActive || shouldUseStoryboardSkill(skillPhase, text),
      imageAnalysis,
    })}`;
  }, [activeSkillId, isStoryboardActive, skillPhase]);

  const sendText = useCallback(async (text: string) => {
    if (!text || status === "thinking" || status === "generating") return;
    shouldStickToBottomRef.current = true;

    const requestedSkillId: JiaojiaoSkillId | null = isPromptLibraryIntent(text)
      ? "prompt-library"
      : isLineArtStoryboardIntent(text)
        ? "line-art-storyboard"
        : isEmotionDirectorRequired(text)
          ? "emotion-director"
          : activeSkillId;

    if (requestedSkillId !== activeSkillId) {
      setActiveSkillId(requestedSkillId);
    }

    if (!requestedSkillId && isPromptOptimizeIntent(text)) {
      const promptText = extractPromptOptimizeText(text);
      addMessage({ role: "user", content: text });
      setInput("");

      if (!promptText) {
        addMessage({
          role: "assistant",
          content: "\u8bf7\u628a\u8981\u4f18\u5316\u7684\u63d0\u793a\u8bcd\u76f4\u63a5\u53d1\u7ed9\u6211\uff0c\u6211\u4f1a\u57fa\u4e8e\u5f53\u524d\u6587\u672c\u8fdb\u884c\u89e3\u6790\u548c\u6539\u5199\u3002\n\n[OPTIONS]\n- \u7c98\u8d34\u63d0\u793a\u8bcd\n- \u53d6\u6d88\n- \u270f\ufe0f \u81ea\u5b9a\u4e49\n[/OPTIONS]",
        });
        setStatus("idle");
        return;
      }

      setStatus("generating");
      try {
        const result = await executePromptOptimize({ userRequirement: promptText, model: currentModel });
        if (result.success) {
          const promptResult = parsePromptOptimizeOutput(result.data);
          if (promptResult) {
            addMessage({
              role: "assistant",
              content: `提示词优化完成。\n\n## 最终提示词\n${promptResult.optimized}\n\n需要我把本次整理好的提示词，自动拆分并部署对应画布节点吗？\n\n[OPTIONS]\n- 确认部署\n- 不用，手动处理\n- 继续调整\n- ✏️ 自定义\n[/OPTIONS]`,
              skillCall: result,
            });
          } else {
            addMessage({ role: "assistant", content: "\u63d0\u793a\u8bcd\u4f18\u5316\u5931\u8d25\uff1a\u8fd4\u56de\u5185\u5bb9\u683c\u5f0f\u5f02\u5e38" });
          }
        } else {
          addMessage({ role: "assistant", content: `\u63d0\u793a\u8bcd\u4f18\u5316\u5931\u8d25\uff1a${result.rawText}` });
        }
      } catch (err) {
        addMessage({ role: "assistant", content: `\u6267\u884c\u51fa\u9519\uff1a${err instanceof Error ? err.message : String(err)}` });
      } finally {
        setStatus("idle");
      }
      return;
    }

    const deployConversation = messages
      .slice(-12)
      .map((msg) => parseOptionsFromText(msg.content).cleanText || msg.content)
      .join("\n");
    const requestedDeploySpecs = parseImageNodeSpecsForAgentCommand(text, `${deployConversation}\n${text}`);
    if (requestedDeploySpecs.length > 0) {
      addMessage({ role: "user", content: text });
      setInput("");
      const deploy = buildDeployFromImageNodeSpecs(requestedDeploySpecs);
      deployToCanvas(deploy);
      addMessage({
        role: "assistant",
        content: `已完成部署：只使用清洗后的有效提示词，创建 ${requestedDeploySpecs.length} 组画布节点。`,
      });
      setStatus("idle");
      return;
    }

    const referencedImages = buildReferencedImageParts(text, useGraphStore.getState().nodes);
    const storyboardActiveForRequest = requestedSkillId === "line-art-storyboard" || shouldUseStoryboardSkill(skillPhase, text);

    // Auto-detect storyboard intent
    if (skillPhase === "idle" && storyboardActiveForRequest) {
      setSkillPhase("collecting");
    }

    addMessage({ role: "user", content: text });
    setInput("");
    setStatus("thinking");
    addMessage({ role: "assistant", content: "" });

    try {
      const imageAnalysis = await recognizeReferencedImages(referencedImages, storyboardActiveForRequest);
      const llmMessages = buildLLMMessages(storyboardActiveForRequest, requestedSkillId);
      llmMessages.push({ role: "user", content: buildUserMessageContent(text, referencedImages, imageAnalysis) });

      await streamChatMessage({
        model: currentModel,
        messages: llmMessages,
        onChunk: (full) => {
          setStreamingText(full);
        },
        onDone: (fullText) => {
          commitStreamingText();

          // Detect storyboard complete marker
          if (skillPhase === "collecting" || skillPhase === "choosing" || isStoryboardIntent(text)) {
            const storyboard = parseStoryboardFromText(fullText);
            if (storyboard) {
              // Apply shot splitting — always convert to SplitShot[]
              const splitShots = splitTransitionShots(storyboard.shots);
              const { cleanText: visibleStoryboardText } = parseOptionsFromText(fullText);
              const splitStoryboard: StoryboardOutput & { shots: SplitShot[] } = {
                ...storyboard,
                full_prompt: visibleStoryboardText.trim().length > 80 ? visibleStoryboardText.trim() : storyboard.full_prompt,
                shots: splitShots,
              };
              setStoryboardData(splitStoryboard);
              setSkillPhase("choosing");
            }
          }

          const recentConversation = messages
            .slice(-12)
            .map((msg) => parseOptionsFromText(msg.content).cleanText || msg.content)
            .join("\n");
          const imageNodeSpecs = parseImageNodeSpecsForAgentCommand(text, `${recentConversation}\n${text}\n${fullText}`);
          if (imageNodeSpecs.length > 0) {
            const deploy = buildDeployFromImageNodeSpecs(imageNodeSpecs);
            deployToCanvas(deploy);
            addMessage({
              role: "assistant",
              content: `已按清洗后的有效提示词部署 ${imageNodeSpecs.length} 组画布节点：${imageNodeSpecs.map((spec) => spec.nodeName).join("、")}。`,
            });
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
  }, [activeSkillId, status, currentModel, skillPhase, messages, addMessage, setStatus, buildLLMMessages, buildUserMessageContent, recognizeReferencedImages, setStreamingText, commitStreamingText, setSkillPhase, setStoryboardData]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (text) sendText(text);
  }, [input, sendText]);

  // Quick reply click handler
  const handleQuickReply = useCallback((opt: string) => {
    sendText(opt);
  }, [sendText]);

  const handleInputChange = useCallback((value: string, cursorIndex: number | null) => {
    setInput(value);
    const pos = cursorIndex ?? value.length;
    const textBefore = value.slice(0, pos);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch && imageMentionOptions.length > 0) {
      setAtQuery({ index: pos - atMatch[0].length, text: atMatch[1].toLowerCase() });
      if (inputRef.current) setMentionMenuPosition(getCaretMenuPosition(inputRef.current));
    } else {
      setAtQuery(null);
      setMentionMenuPosition(null);
    }
  }, [imageMentionOptions.length]);

  const insertImageMention = useCallback((nodeName: string) => {
    if (!atQuery || !inputRef.current) return;
    const current = input;
    const before = current.slice(0, atQuery.index);
    const after = current.slice(atQuery.index + 1 + atQuery.text.length);
    const next = `${before}@${nodeName} ${after}`;
    setInput(next);
    setAtQuery(null);
    setMentionMenuPosition(null);
    setTimeout(() => {
      const pos = before.length + nodeName.length + 2;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }, [atQuery, input]);

  // Custom option handler — keep the existing reply box and focus it.
  const handleCustomInput = useCallback(() => {
    if (status === "thinking" || status === "generating") return;
    inputRef.current?.focus();
  }, [status]);

  const handleConversationScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setPanelScrollTop(el.scrollTop);
    shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, [setPanelScrollTop]);

  const handleClosePanel = useCallback(() => {
    const el = scrollRef.current;
    if (el) setPanelScrollTop(el.scrollTop);
    closePanel();
  }, [closePanel, setPanelScrollTop]);

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
      setEdges((eds) => appendUniqueXyEdge(eds, toXyEdge(edge)));
    }
  }, [setNodes, setEdges]);

  const buildDeployFromImageNodeSpecs = useCallback((specs: AgentImageNodeSpec[]): DeployPreview => {
    const { nodes: existingNodes } = useGraphStore.getState();
    const previewNodes: DeployPreview["nodes"] = [];
    const previewEdges: DeployPreview["edges"] = [];
    const genDims = NODE_DEFAULT_SIZES["gen-image"] ?? { w: 320, h: 320 };
    const textDims = NODE_DEFAULT_SIZES["text-node"] ?? { w: 220, h: 120 };
    const rowH = Math.max(genDims.h, textDims.h) + 30;

    let startX = 100;
    let startY = 100;
    if (existingNodes.length > 0) {
      const maxRight = Math.max(...existingNodes.map((n) => n.x + (n.width || 260)));
      startX = maxRight + 60;
      startY = existingNodes[0]?.y ?? 100;
    }

    specs.forEach((spec, index) => {
      const textId = `preview-prompt-text-${index}`;
      const genId = `preview-prompt-gen-${index}`;
      const rowY = startY + index * rowH;

      previewNodes.push({
        id: textId,
        type: "text-node",
        nodeName: spec.nodeName,
        prompt: spec.prompt,
        content: spec.prompt,
        settings: { ...getDefaultSettings("text-node") } as Record<string, unknown>,
        position: { x: startX, y: rowY },
      });
      previewNodes.push({
        id: genId,
        type: "gen-image",
        nodeName: `${spec.nodeName} 生成`,
        prompt: spec.prompt,
        content: "",
        settings: {
          ...getDefaultSettings("gen-image"),
          model: "gpt-image-2",
          localPrompt: spec.prompt,
          isAutoPrompt: false,
        } as Record<string, unknown>,
        position: { x: startX + textDims.w + 30, y: rowY },
      });
      previewEdges.push({ from: textId, to: genId, fromPort: "default", toPort: "default" });
    });

    return { nodes: previewNodes, edges: previewEdges, confirmed: false };
  }, []);

  // ── Build deploy from storyboard with output mode ──
  // shots are already SplitShot[] from onDone — do NOT re-split
  const buildDeployFromStoryboard = useCallback((storyboard: StoryboardOutput & { shots: SplitShot[] }, mode: OutputMode): DeployPreview => {
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

    // Use already-split shots directly — no re-splitting
    const shots = storyboard.shots;

    if (mode === "full-board" || mode === "hybrid") {
      const fullPrompt = buildFullStoryboardPrompt(storyboard, shots);
      const emotionPrompt = buildStoryboardEmotionText(shots);
      const textId = "preview-text-full";
      const emotionId = "preview-emotion-full";
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
        id: emotionId,
        type: "text-node",
        nodeName: `${storyboard.title} 情绪表演`,
        prompt: emotionPrompt,
        content: emotionPrompt,
        settings: { ...getDefaultSettings("text-node") } as Record<string, unknown>,
        position: { x: startX + textDims.w + 30, y: startY },
      });
      previewNodes.push({
        id: genId,
        type: "gen-image",
        nodeName: `${storyboard.title} 生成`,
        prompt: fullPrompt,
        content: "",
        settings: { ...getDefaultSettings("gen-image"), model: currentModel } as Record<string, unknown>,
        position: { x: startX + textDims.w * 2 + 60, y: startY },
      });
      previewEdges.push({ from: textId, to: genId, fromPort: "default", toPort: "default" });
      previewEdges.push({ from: emotionId, to: genId, fromPort: "default", toPort: "default" });
    }

    if (mode === "per-shot" || mode === "hybrid") {
      const perShotStartY = mode === "hybrid" ? startY + rowH : startY;
      // Per-shot mode: each SplitShot gets its own text-node + gen-image pair
      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        const textId = `preview-text-${i}`;
        const genId = `preview-gen-${i}`;
        const rowY = perShotStartY + i * rowH;

        const shotPrompt = buildShotPrompt(storyboard, shot);
        const textContent = buildTextNodeContent(shot, shotPrompt);
        const emotionText = buildShotEmotionText(shot);
        const label = shot.segmentLabel || `镜头${shot.cut}`;
        const nodeName = `${label}（${shot.time_range}）`;
        const emotionId = `preview-emotion-${i}`;

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
          id: emotionId,
          type: "text-node",
          nodeName: `${label} 情绪表演`,
          prompt: emotionText,
          content: emotionText,
          settings: { ...getDefaultSettings("text-node") } as Record<string, unknown>,
          position: { x: startX + textDims.w + 30, y: rowY },
        });
        previewNodes.push({
          id: genId,
          type: "gen-image",
          nodeName: `${label} 生成`,
          prompt: shotPrompt,
          content: "",
          settings: { ...getDefaultSettings("gen-image"), model: currentModel } as Record<string, unknown>,
          position: { x: startX + textDims.w * 2 + 60, y: rowY },
        });
        previewEdges.push({ from: textId, to: genId, fromPort: "default", toPort: "default" });
        previewEdges.push({ from: emotionId, to: genId, fromPort: "default", toPort: "default" });
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
    const deploy = buildDeployFromStoryboard(storyboardData as StoryboardOutput & { shots: SplitShot[] }, mode);
    deployToCanvas(deploy);

    const modeLabel = mode === "full-board" ? "整版" : mode === "per-shot" ? "分镜头" : "混合";
    const shotCount = storyboardData.shots.length;
    addMessage({ role: "assistant", content: `已部署 ${deploy.nodes.length} 个节点到画布（${modeLabel}模式）！\n包含 ${shotCount} 个镜头单元。你可以自由编辑它们。` });
    setStoryboardData(null);
    setSkillPhase("idle");
    setStatus("idle");
  }, [storyboardData, addMessage, setSkillPhase, setStoryboardData, setStatus, buildDeployFromStoryboard, deployToCanvas]);

  const handleRestart = useCallback(() => {
    resetSkill();
    setActiveSkillId(null);
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
        left: 36, top: 36, bottom: 0, width: "clamp(380px, 34vw, 720px)",
        minWidth: 380,
        maxWidth: "calc(100vw - 72px)",
        resize: "horizontal",
        overflow: "hidden",
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
      {/* Header: single compact row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderBottom: "1px solid #27272a", background: "#18181b" }}>
        <span style={{ fontSize: 15 }}>🍌</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#facc15", whiteSpace: "nowrap" }}>蕉蕉</span>
        <button type="button" onClick={() => { createNewSession(); setActiveSkillId(null); setShowHistory(false); }}
          title="新建对话"
          style={{
            width: 22, height: 22, borderRadius: 5,
            background: "#16a34a", border: "none", color: "#ffffff",
            cursor: "pointer", fontSize: 14, fontWeight: 700, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginLeft: 6, transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >+</button>
        <button type="button" onClick={() => setShowHistory(!showHistory)}
          title="历史记录"
          style={{
            width: 22, height: 22, borderRadius: 5,
            background: showHistory ? "#1d4ed8" : "#2563eb", border: "none", color: "#ffffff",
            cursor: "pointer", fontSize: 12, lineHeight: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >&#128339;</button>
        <div style={{ flex: 1 }} />
        <select
          value={currentModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          title="选择模型"
          aria-label="选择模型"
          style={{ fontSize: 10, padding: "2px 4px", borderRadius: 4, border: "1px solid #3f3f46", background: "#0f0f0f", color: "#a1a1aa", maxWidth: 130 }}
        >
          {chatModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <div style={{ width: 1, height: 10, background: "#27272a", margin: "0 3px" }} />
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: status === "idle" ? "#22c55e" : "#f97316", boxShadow: status !== "idle" ? "0 0 5px #f97316" : "none" }} />
        <span style={{ fontSize: 9, color: "#71717a", whiteSpace: "nowrap" }}>{statusLabel[status] ?? "空闲"}</span>
        {phaseLabel[skillPhase] && (
          <span style={{ fontSize: 9, color: "#f97316", whiteSpace: "nowrap" }}>{phaseLabel[skillPhase]}</span>
        )}
        <button type="button" onClick={handleClosePanel} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 14, lineHeight: 1, marginLeft: 2 }} title="收起">✕</button>
      </div>

      {/* Messages area (relative for SessionHistoryPanel overlay) */}
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <SessionHistoryPanel open={showHistory} onClose={() => setShowHistory(false)} />
        <div
          ref={scrollRef}
          className="custom-scrollbar"
          onScroll={handleConversationScroll}
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 12px", background: "#09090b" }}
        >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#3f3f46", fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🍌</div>
            <div>你好！我是蕉蕉～</div>
            <div style={{ marginTop: 4 }}>想创作什么类型的作品？</div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <QuickReplyOptions
                options={JIAOJIAO_HOME_OPTIONS}
                hint="点击选择"
                onSelect={handleQuickReply}
                onCustom={handleCustomInput}
              />
            </div>
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
              {msgOption && !isLastAssistant && shouldShowInlineOptions(skillPhase, Boolean(storyboardData)) && (
                <QuickReplyOptions
                  options={msgOption.options}
                  hint={msgOption.hint}
                  onSelect={handleQuickReply}
                  onCustom={handleCustomInput}
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
          <StoryboardModeSelector storyboard={storyboardData} onModeSelect={handleModeSelect} onCustom={handleCustomInput} />
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
            <button type="button" onClick={handleCustomInput} style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: "1px dashed #f97316", background: "rgba(249,115,22,0.08)", color: "#f97316", fontSize: 11, cursor: "pointer" }}>
              ✏️ 自定义
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Input */}
      <div style={{ position: "relative", display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid #27272a", background: "#18181b" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (atQuery && filteredImageMentions.length > 0 && e.key === "Enter") {
              e.preventDefault();
              insertImageMention(filteredImageMentions[0].nodeName);
              return;
            }
            if (atQuery && e.key === "Escape") {
              setAtQuery(null);
              setMentionMenuPosition(null);
              return;
            }
            handleKeyDown(e);
          }}
          placeholder={skillPhase === "choosing" ? "可补充自定义输出要求..." : "和蕉蕉聊聊创作想法..."}
          disabled={status === "thinking" || status === "generating"}
          rows={1}
          style={{
            flex: 1, fontSize: 12, minHeight: 32, maxHeight: 120, padding: "6px 10px",
            borderRadius: 6, border: "1px solid #3f3f46", background: "#0f0f0f", color: "#e4e4e7",
            outline: "none", resize: "none", overflowY: "auto", lineHeight: 1.45,
          }}
        />
        {atQuery && filteredImageMentions.length > 0 && (
          <CaretMenuPortal>
          <div
            style={{
              ...caretMenuStyle(mentionMenuPosition, {
                background: "#18181b",
                borderColor: "#3f3f46",
              }),
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              padding: 4,
              boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
            }}
          >
            {filteredImageMentions.map((node) => (
              <button
                key={node.nodeId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertImageMention(node.nodeName)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  border: "none",
                  borderRadius: 6,
                  background: "transparent",
                  color: "#e4e4e7",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#27272a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <img src={node.content} alt="" style={{ width: 28, height: 28, borderRadius: 5, objectFit: "cover" }} />
                <span style={{ color: "#f97316" }}>@{node.nodeName}</span>
                <span style={{ color: "#71717a", fontSize: 10 }}>画布图片</span>
              </button>
            ))}
          </div>
          </CaretMenuPortal>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={status === "thinking" || status === "generating" || !input.trim()}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none", fontWeight: 600, fontSize: 12,
            background: (status === "thinking" || status === "generating" || !input.trim()) ? "#27272a" : "#f97316",
            color: (status === "thinking" || status === "generating" || !input.trim()) ? "#52525b" : "#ffffff",
            cursor: (status === "thinking" || status === "generating" || !input.trim()) ? "not-allowed" : "pointer",
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
  if (sb.full_prompt?.trim()) {
    return sb.full_prompt.trim();
  }

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

function buildTextNodeContent(shot: SplitShot, _prompt: string): string {
  return `主体：${shot.subject}
动作：${shot.action}
描述：${shot.description}
镜头：${shot.camera}`;
}

function buildShotEmotionText(shot: SplitShot): string {
  const raw =
    shot.performance ||
    shot.emotion_performance ||
    shot.emotion ||
    shot.action ||
    "眼神聚焦，动作克制";
  return limitChineseText(raw, 20);
}

function buildStoryboardEmotionText(shots: SplitShot[]): string {
  return shots
    .map((shot) => `${shot.segmentLabel || `镜头${shot.cut}`}：${buildShotEmotionText(shot)}`)
    .join("\n");
}

function limitChineseText(text: string, maxChars: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}
