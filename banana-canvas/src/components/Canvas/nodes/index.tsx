import { InputImageNode } from "./InputImageNode";
import { TextNode } from "./TextNode";
import { GenImageNode } from "./GenImageNode";
import { GenVideoNode } from "./GenVideoNode";
import { PreviewNode } from "./PreviewNode";
import { LocalSaveNode } from "./LocalSaveNode";
import { VideoInputNode } from "./VideoInputNode";
import { AudioInputNode } from "./AudioInputNode";
import { VideoAnalyzeNode } from "./VideoAnalyzeNode";
import { ImageCompareNode } from "./ImageCompareNode";
import { GlobalPerspectiveNode } from "./GlobalPerspectiveNode";
import { CameraMovementNode } from "./CameraMovementNode";
import { ProfessionalCameraNode } from "./ProfessionalCameraNode";
import { MotionControlNode } from "./MotionControlNode";
import { CanvasNodeComponent } from "./CanvasNodeComponent";
import { DoodleCanvasNode } from "./DoodleCanvasNode";
import { GenMusicNode } from "./GenMusicNode";
import { CustomAgentNode } from "./CustomAgentNode";
import { InpaintCropNode } from "./InpaintCropNode";
import { InpaintStitchNode } from "./InpaintStitchNode";
import { JimengSuperResolutionNode } from "./JimengSuperResolutionNode";
import { TopazUpscaleNode } from "./TopazUpscaleNode";
import { ExtractCharactersScenesNode } from "./ExtractCharactersScenesNode";
import { CharacterDescriptionNode } from "./CharacterDescriptionNode";
import { SceneDescriptionNode } from "./SceneDescriptionNode";
import { CreateCharacterNode } from "./CreateCharacterNode";
import { CreateSceneNode } from "./CreateSceneNode";
import { GenerateCharacterVideoNode } from "./GenerateCharacterVideoNode";
import { GenerateSceneVideoNode } from "./GenerateSceneVideoNode";
import { GenerateCharacterImageNode } from "./GenerateCharacterImageNode";
import { GenerateSceneImageNode } from "./GenerateSceneImageNode";

export const nodeTypes = {
  "input-image": InputImageNode,
  "text-node": TextNode,
  "gen-image": GenImageNode,
  "gen-video": GenVideoNode,
  preview: PreviewNode,
  "local-save": LocalSaveNode,
  "video-input": VideoInputNode,
  "audio-input": AudioInputNode,
  "video-analyze": VideoAnalyzeNode,
  "image-compare": ImageCompareNode,
  "global-perspective": GlobalPerspectiveNode,
  "camera-movement": CameraMovementNode,
  "professional-camera": ProfessionalCameraNode,
  "motion-control": MotionControlNode,
  "canvas-node": CanvasNodeComponent,
  "doodle-canvas": DoodleCanvasNode,
  "gen-music": GenMusicNode,
  "custom-agent": CustomAgentNode,
  "inpaint-crop": InpaintCropNode,
  "inpaint-stitch": InpaintStitchNode,
  "jimeng-super-resolution": JimengSuperResolutionNode,
  "topaz-upscale": TopazUpscaleNode,
  "extract-characters-scenes": ExtractCharactersScenesNode,
  "character-description": CharacterDescriptionNode,
  "scene-description": SceneDescriptionNode,
  "create-character": CreateCharacterNode,
  "create-scene": CreateSceneNode,
  "generate-character-video": GenerateCharacterVideoNode,
  "generate-scene-video": GenerateSceneVideoNode,
  "generate-character-image": GenerateCharacterImageNode,
  "generate-scene-image": GenerateSceneImageNode,
} as const;
