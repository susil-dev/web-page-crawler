import { getImage, hasImage, putImage, type ImageRecord } from "./db";
import type { ImageInfo } from "./extract";

/** Download an image file. Throws if it isn't an image or is larger than maxBytes. */
export async function fetchImage(src: string, maxBytes: number): Promise<ImageRecord> {
  const res = await fetch(src, { credentials: "include", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length"));
  if (declared > maxBytes) throw new Error("too large");
  const blob = await res.blob();
  const type = blob.type || res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`not an image (${type || "unknown type"})`);
  if (blob.size > maxBytes) throw new Error("too large");
  return { url: src, type, size: blob.size, blob, fetchedAt: new Date().toISOString() };
}

/** Store the files for a page's images in the DB (skipping ones already stored). Returns how many failed. */
export async function storeImages(images: ImageInfo[], maxBytes: number): Promise<number> {
  let failed = 0;
  for (const img of images) {
    if (await hasImage(img.src)) continue;
    try {
      await putImage(await fetchImage(img.src, maxBytes));
    } catch {
      failed++;
    }
  }
  return failed;
}

/** The stored file, or a fresh download when it isn't stored. Undefined if neither works. */
export async function imageBlob(src: string, maxBytes: number): Promise<ImageRecord | undefined> {
  return (await getImage(src)) ?? fetchImage(src, maxBytes).catch(() => undefined);
}

/** Serialize an image file as a data: URL (base64), e.g. for JSON export. */
export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/bmp": "bmp",
};

export function extensionFor(type: string, src: string): string {
  return EXT[type.split(";")[0]] ?? new URL(src).pathname.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase() ?? "img";
}

/** Largest linked file (PDF, Office, ZIP…) stored with a saved page. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Download any linked file with this browser's cookies. Throws if it fails or is too large. */
export async function fetchFile(url: string, maxBytes = MAX_FILE_BYTES): Promise<ImageRecord> {
  const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get("content-length")) > maxBytes) throw new Error("too large");
  const blob = await res.blob();
  if (blob.size > maxBytes) throw new Error("too large");
  return { url, type: blob.type || res.headers.get("content-type") || "application/octet-stream", size: blob.size, blob, fetchedAt: new Date().toISOString() };
}

/** Store linked files in the DB (skipping ones already stored). Returns how many failed. */
export async function storeFiles(urls: string[]): Promise<number> {
  let failed = 0;
  for (const url of urls) {
    if (await hasImage(url)) continue;
    try {
      await putImage(await fetchFile(url));
    } catch {
      failed++;
    }
  }
  return failed;
}

/** The stored file, or a fresh download. Undefined if neither works. */
export async function fileBlob(url: string): Promise<ImageRecord | undefined> {
  return (await getImage(url)) ?? fetchFile(url).catch(() => undefined);
}
