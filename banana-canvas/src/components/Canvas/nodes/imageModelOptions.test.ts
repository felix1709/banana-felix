import { getImageModelOptions } from "./imageModelOptions.js";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const options = getImageModelOptions();
const ids = options.map((option) => option.id);

assert(ids.length === 3, "image model selector exposes exactly three models");
assert(ids[0] === "gemini-3-pro-image-preview", "keeps Gemini 3 Pro first");
assert(ids[1] === "gemini-3.1-flash-image-preview", "keeps Gemini 3.1 Flash second");
assert(ids[2] === "gpt-image-2", "keeps GPT Image 2 third");
