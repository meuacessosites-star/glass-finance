import { imageToDataUrl } from "./receipt-scan";

const GZIP_DATA_URL_PREFIX = "data:application/x-granascan-gzip;";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function metadataFromCompressedUrl(src: string, key: string): string | null {
  const header = src.split(",", 1)[0];
  const match = header.match(new RegExp(`;${key}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Compresses a newly selected attachment while keeping the persisted value
 * self-contained. Images use the existing high-quality JPEG pipeline. Other
 * files use gzip only when the browser supports it and the result is smaller;
 * otherwise the original data URL is kept for lossless compatibility.
 */
export async function compressAttachmentFile(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    return imageToDataUrl(file, 1200, 0.84);
  }

  const raw = await fileToDataUrl(file);
  if (typeof CompressionStream === "undefined" || file.size < 16_384) {
    return raw;
  }

  try {
    const source = await file.arrayBuffer();
    const compressed = await new Response(
      new Blob([source]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();

    // Avoid adding metadata/base64 overhead when compression would not help.
    if (compressed.byteLength >= Math.floor(file.size * 0.92)) {
      return raw;
    }

    const metadata = `mime=${encodeURIComponent(
      file.type || "application/octet-stream",
    )};name=${encodeURIComponent(file.name)};base64,`;
    return `${GZIP_DATA_URL_PREFIX}${metadata}${bytesToBase64(
      new Uint8Array(compressed),
    )}`;
  } catch {
    return raw;
  }
}

export function isCompressedAttachment(src: string): boolean {
  return src.startsWith(GZIP_DATA_URL_PREFIX);
}

/** Opens a browser download, transparently decompressing gzip attachments. */
export async function downloadAttachment(
  src: string,
  fallbackName: string,
): Promise<void> {
  let url = src;
  let revoke = false;
  let filename = fallbackName;

  if (isCompressedAttachment(src)) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("decompression-unsupported");
    }
    const body = src.slice(src.indexOf(",") + 1);
    const compressed = base64ToBytes(body);
    const decompressed = await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).blob();
    const mime =
      metadataFromCompressedUrl(src, "mime") || "application/octet-stream";
    url = URL.createObjectURL(new Blob([decompressed], { type: mime }));
    revoke = true;
    filename = metadataFromCompressedUrl(src, "name") || fallbackName;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  if (revoke) URL.revokeObjectURL(url);
}
