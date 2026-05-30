import { buildVideoOutputNodeAndEdge } from "./videoOutputNode.js";
import type { CanvasNode } from "../../../types/node.js";
import type { VideoInputSettings } from "../../../types/settings.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const sourceNode: CanvasNode = {
  id: "gen-video-1",
  type: "gen-video",
  x: 100,
  y: 200,
  width: 320,
  height: 320,
  content: "",
  prompt: "生成一段视频",
  settings: {},
  nodeName: "森林奔跑视频",
};

const { node, edge } = buildVideoOutputNodeAndEdge({ sourceNode, existingOutputCount: 1 });
const settings = node.settings as VideoInputSettings;

assert(node.type === "video-input", "creates a video input output node");
assert(node.content === "", "starts with empty content while generating");
assert(settings.fileName === "生成中...", "marks placeholder as generating");
assert(node.nodeName === "森林奔跑视频 结果2", "names output node from source node");
assert(node.x > sourceNode.x + sourceNode.width, "places output node to the right");
assert(edge.from === sourceNode.id, "connects from the generator node");
assert(edge.to === node.id, "connects to the new video input node");
assert(edge.toPort === "default", "targets the default input handle");
