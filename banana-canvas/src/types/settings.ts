export interface InputImageSettings {
  source: "upload" | "url";
  imageUrl: string;
  fileName: string;
  materialOrder: number;
}

export interface TextNodeSettings {
  negativePrompt: string;
  qualityPrompt: string;
}

export interface GenImageSettings {
  model: string;
  ratio: string;
  resolution: string;
  batchCount: number;
  quality?: "low" | "medium" | "high";
  style?: "natural" | "vivid";
  outputFormat?: "PNG" | "JPEG" | "WEBP";
  moderation?: "auto" | "low";
  compactImageWidget: boolean;
  isCollapsed: boolean;
  refAnnotations: Record<string, string>;
  localPrompt: string;
  isAutoPrompt: boolean;
}

export interface GenVideoSettings {
  model: string;
  duration: number;
  fps: number;
  resolution: string;
  seed: number;
  negativePrompt: string;
  ratio: string;
  generateAudio: boolean;
  smartDuration: boolean;
  referenceMode: "multimodal" | "first_last_frame" | "first_frame" | "last_frame";
  startFrameRef: string;
  endFrameRef: string;
}

export interface PreviewSettings {
  autoPlay: boolean;
  zoom: number;
}

export interface LocalSaveSettings {
  format: "png" | "jpg" | "webp" | "mp4" | "webm";
  quality: number;
  directory: string;
  fileName: string;
}

export interface VideoInputSettings {
  source: "upload" | "url";
  videoUrl: string;
  fileName: string;
  materialOrder: number;
}

export interface AudioInputSettings {
  source: "upload" | "url";
  audioUrl: string;
  fileName: string;
  materialOrder: number;
}

export interface VideoAnalyzeSettings {
  model: string;
  analysisType: "scene" | "shot" | "motion" | "custom";
  customPrompt: string;
}

export interface ImageCompareSettings {
  mode: "side" | "slider";
  label: string;
}

// ── 镜头运动组 ──

export interface GlobalPerspectiveSettings {
  angle: number;
  elevation: number;
  distance: number;
  fov: number;
}

export interface CameraMovementSettings {
  movementType: "pan" | "tilt" | "zoom" | "dolly" | "crane" | "tracking";
  speed: number;
  direction: string;
  intensity: number;
}

export interface ProfessionalCameraSettings {
  lensType: "wide" | "normal" | "telephoto" | "macro" | "fisheye";
  aperture: string;
  shutterSpeed: string;
  iso: number;
  whiteBalance: string;
}

export interface MotionControlSettings {
  referenceMode: "video" | "skeleton" | "trajectory";
  strength: number;
  smoothness: number;
  frameRange: string;
}

// ── 工具辅助组 ──

export interface StoryboardSettings {
  columns: number;
  shotCount: number;
  aspectRatio: string;
}

export interface StoryboardChartSettings {
  timelineScale: number;
  showLabels: boolean;
  groupBy: "scene" | "shot" | "time";
}

export interface TableEditorSettings {
  rows: number;
  columns: number;
  headers: string;
}

import type { DoodleStroke } from "./node";

export interface CanvasStroke {
  stroke: DoodleStroke;
  canvasWidth: number;
  canvasHeight: number;
}

export type RefCategory = "角色" | "场景" | "道具" | "特效";

export interface RefBinding {
  nodeId: string;
  type: RefCategory;
  color: string;
}

export interface CanvasNodeSettings {
  brushSize: number;
  brushColor: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  backgroundFit: "contain" | "cover" | "stretch";
  strokes: CanvasStroke[];
  tool: "brush" | "eraser";
  canvasPrompt: string;
  model: string;
  ratio: string;
  refBindings: RefBinding[];
  selectedRefId: string;
}

export interface DoodleCanvasSettings {
  brushSize: number;
  brushColor: string;
  opacity: number;
}

export interface GenMusicSettings {
  model: string;
  duration: number;
  tempo: number;
  style: string;
  prompt: string;
}

export interface CustomAgentSettings {
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

// ── 图片处理组 ──

export interface InpaintCropSettings {
  mode: "crop" | "inpaint";
  model: string;
  gridSize: 2 | 3 | 4 | 5;
  maskDataUrl: string;
  inpaintPrompt: string;
}

export interface InpaintStitchSettings {
  blendMode: "normal" | "multiply" | "screen" | "overlay";
  featherRadius: number;
  prompt: string;
}

export interface JimengSuperResolutionSettings {
  scale: 2 | 3 | 4;
  model: string;
  prompt: string;
}

export interface TopazUpscaleSettings {
  scale: 2 | 3 | 4;
  model: string;
  denoise: number;
  sharpen: number;
}

// ── 影视创作组 ──

export interface ExtractCharactersScenesSettings {
  model: string;
  extractMode: "characters" | "scenes" | "both";
  confidence: number;
}

export interface CharacterDescriptionSettings {
  model: string;
  detailLevel: "brief" | "detailed" | "comprehensive";
  aspects: string;
}

export interface SceneDescriptionSettings {
  model: string;
  detailLevel: "brief" | "detailed" | "comprehensive";
  aspects: string;
}

export interface CreateCharacterSettings {
  name: string;
  appearance: string;
  personality: string;
  referenceImage: string;
}

export interface CreateSceneSettings {
  name: string;
  environment: string;
  lighting: string;
  atmosphere: string;
  timeOfDay: string;
}

export interface GenerateCharacterVideoSettings {
  model: string;
  duration: number;
  resolution: string;
  motion: string;
  negativePrompt: string;
}

export interface GenerateSceneVideoSettings {
  model: string;
  duration: number;
  resolution: string;
  cameraMotion: string;
  negativePrompt: string;
}

export interface GenerateCharacterImageSettings {
  model: string;
  ratio: string;
  resolution: string;
  style: string;
  negativePrompt: string;
}

export interface GenerateSceneImageSettings {
  model: string;
  ratio: string;
  resolution: string;
  style: string;
  negativePrompt: string;
}

export type AnyNodeSettings =
  | InputImageSettings
  | TextNodeSettings
  | GenImageSettings
  | GenVideoSettings
  | PreviewSettings
  | LocalSaveSettings
  | VideoInputSettings
  | AudioInputSettings
  | VideoAnalyzeSettings
  | ImageCompareSettings
  | GlobalPerspectiveSettings
  | CameraMovementSettings
  | ProfessionalCameraSettings
  | MotionControlSettings
  | StoryboardSettings
  | StoryboardChartSettings
  | TableEditorSettings
  | CanvasNodeSettings
  | DoodleCanvasSettings
  | GenMusicSettings
  | CustomAgentSettings
  | InpaintCropSettings
  | InpaintStitchSettings
  | JimengSuperResolutionSettings
  | TopazUpscaleSettings
  | ExtractCharactersScenesSettings
  | CharacterDescriptionSettings
  | SceneDescriptionSettings
  | CreateCharacterSettings
  | CreateSceneSettings
  | GenerateCharacterVideoSettings
  | GenerateSceneVideoSettings
  | GenerateCharacterImageSettings
  | GenerateSceneImageSettings
  | Record<string, unknown>;
