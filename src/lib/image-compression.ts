/**
 * Compress new user-uploaded images before they enter the finance snapshot.
 * Documents prioritize legibility; icons keep transparency when supported.
 * Never modifies already saved attachments.
 */
export type ImageUse = "document" | "icon" | "avatar";
export interface ImageCompressionOptions {
  maxDimension?: number;
  quality?: number;
  targetBytes?: number;
  use?: ImageUse;
}
const MAX_SOURCE_IMAGE_BYTES = 25_000_000;
const MAX_SOURCE_PIXELS = 36_000_000;

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("image-read-failed"));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("image-read-failed"));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image-decode-failed"));
    image.src = src;
  });
}

/** Data URLs are base64: compare the actual compressed bytes, not characters. */
export function imageDataUrlBytes(src: string): number {
  const comma = src.indexOf(",");
  if (comma < 0) return Infinity;
  const body = src.slice(comma + 1);
  return Math.floor(body.length * 3 / 4) - (body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0);
}

export async function compressUploadImage(file: File, options: ImageCompressionOptions = {}): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("invalid-image-type");
  if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("image-too-large");
  const use = options.use ?? "document";
  const maxDimension = options.maxDimension ?? (use === "document" ? 1400 : use === "avatar" ? 512 : 640);
  const targetBytes = options.targetBytes ?? (use === "document" ? 450_000 : use === "avatar" ? 75_000 : 120_000);
  const startQuality = options.quality ?? (use === "document" ? 0.86 : 0.83);
  const image = await decodeImage(await readImage(file));
  if (!image.width || !image.height || image.width * image.height > MAX_SOURCE_PIXELS)
    throw new Error("image-resolution-too-large");
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (use === "document" || use === "avatar") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // WebP keeps the transparent backgrounds of icons. If unsupported,
  // use PNG for icons and JPEG for photographs/documents.
  const transparent = use === "icon";
  const preferredType = transparent ? "image/webp" : "image/jpeg";
  const first = canvas.toDataURL(preferredType, startQuality);
  const encodedType = transparent && !first.startsWith("data:image/webp")
    ? "image/png" : preferredType;
  if (encodedType === "image/png") return first;
  if (imageDataUrlBytes(first) <= targetBytes) return first;
  // Moderate reductions avoid rendering receipts illegible.
  let best = first;
  for (const q of [0.79, 0.73]) {
    if (q >= startQuality) continue;
    const candidate = canvas.toDataURL(encodedType, q);
    if (imageDataUrlBytes(candidate) < imageDataUrlBytes(best)) best = candidate;
    if (imageDataUrlBytes(best) <= targetBytes) break;
  }
  return best;
}
