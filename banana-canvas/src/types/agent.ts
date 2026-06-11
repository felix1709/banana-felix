import type { NodeType } from "./node";

// Agent 状态枚举
export type AgentStatus = "idle" | "thinking" | "generating" | "deploying";

// Skill 交互阶段
export type SkillPhase = "idle" | "collecting" | "choosing" | "deploying";

// 输出模式
export type OutputMode = "full-board" | "per-shot" | "hybrid";

// 对话消息
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  skillCall?: SkillCallResult;
  deployPreview?: DeployPreview;
}

// Skill 定义
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  outputFormat: string;
  sourcePath?: string;
}

// Skill 调用结果
export interface SkillCallResult {
  skillId: string;
  success: boolean;
  data: unknown;
  rawText: string;
}

// 节点部署预览
export interface DeployPreview {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  confirmed: boolean;
}

export interface PreviewNode {
  id: string;
  type: NodeType;
  nodeName: string;
  prompt: string;
  content: string;
  settings: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface PreviewEdge {
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
}

// 分镜 Skill 输出格式 (storyboard-builder)
export interface StoryboardOutput {
  title: string;
  genre: string;
  aspect_ratio: string;
  total_duration_s: number;
  full_prompt?: string;
  style: {
    art_style: string;
    color_palette: string;
    lighting: string;
  };
  scene_style?: {
    atmosphere: string;
    character_appearance: string;
    color_tone: string;
    lighting: string;
    texture: string;
  };
  shots: StoryboardShot[];
}

export interface StoryboardShot {
  cut: number;
  time_range: string;
  subject: string;
  action: string;
  performance?: string;
  emotion?: string;
  emotion_performance?: string;
  description: string;
  camera: string;
  dialogue?: string;
  ref_images?: string[];
}

// 提示词优化 Skill 输出格式
export interface PromptOptimizeOutput {
  original: string;
  optimized: string;
  improvements: string[];
}

// 快捷选项
export interface QuickOption {
  hint: string;
  options: string[];
}

// 会话索引条目（轻量，存储在索引key中）
export interface SessionIndexEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// 完整会话数据（per-session key 存储）
export interface AgentSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  selectedModel: string;
  createdAt: number;
  updatedAt: number;
}
