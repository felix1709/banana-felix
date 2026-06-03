export interface SavedImageBytes {
  bytes: Uint8Array;
  ext: string;
}

function getExtFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "png";
}

function safeBaseName(name: string): string {
  const cleaned = name
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  return cleaned || "image";
}

export async function readImageSourceBytes(imageUrl: string): Promise<SavedImageBytes> {
  if (imageUrl.startsWith("data:")) {
    const commaIdx = imageUrl.indexOf(",");
    const meta = imageUrl.slice(0, commaIdx);
    const base64 = imageUrl.slice(commaIdx + 1);
    const mimeMatch = meta.match(/data:(image\/[\w+.-]+)/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const ext = getExtFromMime(mime);
    const raw = atob(base64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return { bytes: buf, ext };
  }

  const isTauriApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  let httpFetch: typeof globalThis.fetch;
  if (isTauriApp) {
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      httpFetch = tauriFetch as typeof globalThis.fetch;
    } catch {
      httpFetch = globalThis.fetch;
    }
  } else {
    httpFetch = globalThis.fetch;
  }

  const response = await httpFetch(imageUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const blob = await response.blob();
  const ext = getExtFromMime(blob.type || "image/png");
  const arrayBuf = await blob.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuf), ext };
}

export async function saveImageSourceToLocal(imageUrl: string, baseName: string): Promise<boolean> {
  const { bytes, ext } = await readImageSourceBytes(imageUrl);
  const fileName = `${safeBaseName(baseName)}.${ext}`;
  const isTauriApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  if (isTauriApp) {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const filePath = await save({
        defaultPath: fileName,
        filters: [{ name: "Images", extensions: [ext] }],
      });
      if (!filePath) return false;
      await writeFile(filePath, bytes);
      return true;
    } catch (err) {
      if (err instanceof Error && err.message?.toLowerCase().includes("cancel")) {
        return false;
      }
    }
  }

  const blob = new Blob([bytes], { type: `image/${ext === "jpg" ? "jpeg" : ext}` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}
