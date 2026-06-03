import type { AnyNodeSettings } from "./settings";

// 节点类型 ID 联合类型
export type NodeType =
  | "input-image"
  | "text-node"
  | "video-input"
  | "audio-input"
  | "video-analyze"
  | "canvas-node"
  | "doodle-canvas"
  | "gen-image"
  | "gen-video"
  | "panorama-scene"
  | "gen-music"
  | "motion-control"
  | "custom-agent"
  | "image-compare"
  | "preview"
  | "local-save"
  | "global-perspective"
  | "camera-movement"
  | "professional-camera"
  | "inpaint-crop"
  | "inpaint-stitch"
  | "jimeng-super-resolution"
  | "topaz-upscale"
  | "extract-characters-scenes"
  | "character-description"
  | "scene-description"
  | "create-character"
  | "create-scene"
  | "generate-character-video"
  | "generate-scene-video"
  | "generate-character-image"
  | "generate-scene-image";

// 连接 inputType 枚举
export type InputType =
  | "default"
  | "agent_meta_prompt"
  | "agent_user_input"
  | "agent_output"
  | "veo_start"
  | "veo_end"
  | "sref"
  | "oref";

// 节点默认尺寸
export interface NodeDimensions {
  w: number;
  h: number;
}

// 画布节点
export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  prompt: string;
  settings: AnyNodeSettings;
  nodeName: string;
}

// 画布连接
export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  fromPort: string;
  toPort: "input" | "default" | "veo_start" | "veo_end" | "sref" | "oref" | "right";
  inputType: InputType;
}

// 分组
export interface Group {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
  collapsed: boolean;
  collapsedX?: number;
  collapsedY?: number;
  createdAt: number;
  updatedAt: number;
}

// 涂鸦笔迹
export interface DoodleStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

// 文本批注
export interface TextBox {
  id: string;
  x: number;
  y: number;
  text: string;
}

// 视口状态
export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

// 节点类型中文名映射
export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  "input-image": "图片输入",
  "text-node": "文本节点",
  "video-input": "视频输入",
  "audio-input": "音频输入",
  "video-analyze": "视频分析",
  "canvas-node": "画板节点",
  "doodle-canvas": "涂鸦画板",
  "gen-image": "生成图片",
  "gen-video": "生成视频",
  "panorama-scene": "全景节点",
  "gen-music": "生成音乐",
  "motion-control": "动作迁移",
  "custom-agent": "自定义代理",
  "image-compare": "图片对比",
  preview: "预览节点",
  "local-save": "本地保存",
  "global-perspective": "全局视角",
  "camera-movement": "镜头运动",
  "professional-camera": "专业镜头",
  "inpaint-crop": "裁剪局部重绘",
  "inpaint-stitch": "无缝拼回",
  "jimeng-super-resolution": "智能超清",
  "topaz-upscale": "高清放大",
  "extract-characters-scenes": "提取角色场景",
  "character-description": "角色描述",
  "scene-description": "场景描述",
  "create-character": "创建角色",
  "create-scene": "创建场景",
  "generate-character-video": "生成角色视频",
  "generate-scene-video": "生成场景视频",
  "generate-character-image": "生成角色图片",
  "generate-scene-image": "生成场景图片",
};

// 节点默认尺寸映射
export const NODE_DEFAULT_SIZES: Record<NodeType, NodeDimensions> = {
  "input-image": { w: 260, h: 260 },
  "text-node": { w: 460, h: 280 },
  "video-input": { w: 360, h: 420 },
  "audio-input": { w: 320, h: 200 },
  "video-analyze": { w: 400, h: 500 },
  "canvas-node": { w: 600, h: 500 },
  "doodle-canvas": { w: 700, h: 300 },
  "gen-image": { w: 320, h: 320 },
  "gen-video": { w: 320, h: 320 },
  "panorama-scene": { w: 460, h: 420 },
  "gen-music": { w: 350, h: 700 },
  "motion-control": { w: 320, h: 580 },
  "custom-agent": { w: 620, h: 800 },
  "image-compare": { w: 400, h: 300 },
  preview: { w: 440, h: 310 },
  "local-save": { w: 320, h: 380 },
  "global-perspective": { w: 440, h: 400 },
  "camera-movement": { w: 340, h: 480 },
  "professional-camera": { w: 320, h: 420 },
  "inpaint-crop": { w: 360, h: 480 },
  "inpaint-stitch": { w: 340, h: 380 },
  "jimeng-super-resolution": { w: 320, h: 280 },
  "topaz-upscale": { w: 440, h: 460 },
  "extract-characters-scenes": { w: 400, h: 500 },
  "character-description": { w: 400, h: 400 },
  "scene-description": { w: 400, h: 400 },
  "create-character": { w: 350, h: 300 },
  "create-scene": { w: 350, h: 300 },
  "generate-character-video": { w: 400, h: 450 },
  "generate-scene-video": { w: 400, h: 450 },
  "generate-character-image": { w: 400, h: 450 },
  "generate-scene-image": { w: 400, h: 450 },
};

// 分组可选颜色
export const GROUP_COLORS = [
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
] as const;

// 节点默认设置
export function getDefaultSettings(type: NodeType): AnyNodeSettings {
  switch (type) {
    case "input-image":
      return { source: "upload", imageUrl: "", fileName: "", materialOrder: 0 };
    case "video-input":
      return { source: "upload", videoUrl: "", fileName: "", materialOrder: 0 };
    case "audio-input":
      return { source: "upload", audioUrl: "", fileName: "", materialOrder: 0 };
    case "video-analyze":
      return { model: "gpt-4o", analysisType: "scene", customPrompt: "" };
    case "image-compare":
      return { mode: "slider", label: "" };
    case "text-node":
      return { negativePrompt: "", qualityPrompt: "" };
    case "gen-image":
      return { model: "gpt-image-2", ratio: "16:9", resolution: "1K", batchCount: 1, compactImageWidget: true, isCollapsed: false, refAnnotations: {}, localPrompt: "", isAutoPrompt: true };
    case "gen-video":
      return { model: "seedance-2.0", duration: 5, fps: 24, resolution: "720p", seed: -1, negativePrompt: "", ratio: "16:9", generateAudio: true, smartDuration: false, referenceMode: "multimodal", startFrameRef: "", endFrameRef: "" };
    case "panorama-scene":
      return { model: "gpt-image-2", prompt: "", sourceImage: "", panoramaImage: "", format: "equirectangular", fov: 60, lens: "35mm" };
    case "preview":
      return { autoPlay: true, zoom: 1 };
    case "local-save":
      return { format: "png", quality: 90, directory: "", fileName: "" };
    // ── 镜头运动组 ──
    case "global-perspective":
      return { angle: 0, elevation: 0, distance: 5, fov: 50 };
    case "camera-movement":
      return { movementType: "pan", speed: 1, direction: "left", intensity: 0.5 };
    case "professional-camera":
      return { lensType: "normal", aperture: "f/2.8", shutterSpeed: "1/50", iso: 400, whiteBalance: "daylight" };
    case "motion-control":
      return { referenceMode: "video", strength: 0.8, smoothness: 0.5, frameRange: "" };
    // ── 工具辅助组 ──
    case "canvas-node":
      return { brushSize: 4, brushColor: "#ffffff", backgroundColor: "#000000", backgroundImageUrl: "", backgroundFit: "contain", strokes: [], tool: "brush", canvasPrompt: "", model: "gpt-image-2", ratio: "16:9", refBindings: [], selectedRefId: "" };
    case "doodle-canvas":
      return { brushSize: 3, brushColor: "#3b82f6", opacity: 1 };
    case "gen-music":
      return { model: "musicgen", duration: 10, tempo: 120, style: "cinematic", prompt: "" };
    case "custom-agent":
      return { model: "gpt-4o", systemPrompt: "", temperature: 0.7, maxTokens: 2048 };
    // ── 图片处理组 ──
    case "inpaint-crop":
      return { mode: "crop", model: "gpt-image-2", gridSize: 2, maskDataUrl: "", inpaintPrompt: "" };
    case "inpaint-stitch":
      return { blendMode: "normal", featherRadius: 10, prompt: "" };
    case "jimeng-super-resolution":
      return { scale: 2, model: "jimeng-sr", prompt: "" };
    case "topaz-upscale":
      return { scale: 2, model: "topaz-standard", denoise: 0.3, sharpen: 0.5 };
    // ── 影视创作组 ──
    case "extract-characters-scenes":
      return { model: "gpt-4o", extractMode: "both", confidence: 0.7 };
    case "character-description":
      return { model: "gpt-4o", detailLevel: "detailed", aspects: "外观,性格,服装" };
    case "scene-description":
      return { model: "gpt-4o", detailLevel: "detailed", aspects: "环境,光照,氛围" };
    case "create-character":
      return { name: "", appearance: "", personality: "", referenceImage: "" };
    case "create-scene":
      return { name: "", environment: "", lighting: "", atmosphere: "", timeOfDay: "白天" };
    case "generate-character-video":
      return { model: "veo-2", duration: 4, resolution: "1280x720", motion: "", negativePrompt: "" };
    case "generate-scene-video":
      return { model: "veo-2", duration: 4, resolution: "1280x720", cameraMotion: "", negativePrompt: "" };
    case "generate-character-image":
      return { model: "gpt-image-2", ratio: "1:1", resolution: "Auto", style: "", negativePrompt: "" };
    case "generate-scene-image":
      return { model: "gpt-image-2", ratio: "16:9", resolution: "Auto", style: "", negativePrompt: "" };
    default:
      return {};
  }
}
