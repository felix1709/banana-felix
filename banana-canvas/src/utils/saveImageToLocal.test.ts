import { saveImageSourceToLocal } from "./saveImageToLocal.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let pickerSuggestedName = "";
let writtenBlobSize = 0;
let closeCalled = false;
const appended: unknown[] = [];

const testGlobal = globalThis as unknown as { window: unknown; document: unknown };
testGlobal.window = {
  showSaveFilePicker: async (options: { suggestedName?: string }) => {
    pickerSuggestedName = options.suggestedName || "";
    return {
      name: pickerSuggestedName,
      async createWritable() {
        return {
          async write(blob: Blob) {
            writtenBlobSize = blob.size;
          },
          async close() {
            closeCalled = true;
          },
        };
      },
    };
  },
};
testGlobal.document = {
  createElement(tagName: string) {
    throw new Error(`browser download fallback should not be used: ${tagName}`);
  },
  body: {
    appendChild<T extends Node>(node: T): T {
      appended.push(node);
      return node;
    },
    removeChild<T extends Node>(node: T): T {
      assert(appended.includes(node), "save fallback removes the appended link");
      return node;
    },
  } as HTMLBodyElement,
};

const saved = await saveImageSourceToLocal(
  "data:image/png;base64,aGVsbG8=",
  "demo/panorama:scene",
);

assert(saved?.saved === true, "reports that the image was saved");
assert(saved.fileName === "demo_panorama_scene.png", "returns the exact saved file name");
assert(saved.locationLabel === "demo_panorama_scene.png", "reports the user-selected file name");
assert(saved.mode === "picker", "uses a save-location picker instead of browser download");
assert(pickerSuggestedName === "demo_panorama_scene.png", "suggests the sanitized file name in the save dialog");
assert(writtenBlobSize === 5, "writes the original image bytes to the selected file");
assert(closeCalled, "closes the selected file after writing");
