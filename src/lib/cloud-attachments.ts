import type { ConvexReactClient } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";

const PREFIX = "glass-file:";
export function cloudFileStorageId(src: string): Id<"_storage"> | null {
  const match = /^glass-file:([a-zA-Z0-9_-]+):(image|file)$/.exec(src);
  return match ? match[1] as Id<"_storage"> : null;
}
export function isAttachmentImage(src: string) {
  return src.startsWith("data:image/") || /^glass-file:[a-zA-Z0-9_-]+:image$/.test(src);
}
export function isCloudAttachment(src: string) {
  return cloudFileStorageId(src) !== null;
}
function fromDataUrl(src: string): Blob {
  const comma = src.indexOf(",");
  if (comma < 0 || !src.startsWith("data:") || !src.slice(0, comma).includes(";base64")) {
    throw new Error("O formato do anexo não pode ser enviado");
  }
  const binary = atob(src.slice(comma + 1));
  const parts: Uint8Array[] = [];
  for (let start = 0; start < binary.length; start += 32_768) {
    const part = new Uint8Array(Math.min(32_768, binary.length - start));
    for (let i = 0; i < part.length; i++) part[i] = binary.charCodeAt(start + i);
    parts.push(part);
  }
  const contentType = src.slice(5, src.indexOf(";")) || "application/octet-stream";
  return new Blob(parts, { type: contentType });
}
export async function uploadAttachmentToCloud(
  client: ConvexReactClient, src: string, profileId: string, name: string, image: boolean,
): Promise<string> {
  if (isCloudAttachment(src)) return src;
  const blob = fromDataUrl(src);
  if (blob.size > 8_000_000) throw new Error("O anexo excede o limite de 8 MB");
  const url = await client.mutation(api.financeFiles.createUploadUrl, {});
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!response.ok) throw new Error("Não foi possível enviar o anexo para a nuvem");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("storageId" in result) ||
      typeof result.storageId !== "string") throw new Error("Resposta inválida do armazenamento");
  const storageId = result.storageId as Id<"_storage">;
  await client.mutation(api.financeFiles.register, {
    storageId, profileId, fileName: name, contentType: blob.type || "application/octet-stream",
  });
  return `${PREFIX}${storageId}:${image ? "image" : "file"}`;
}
export async function cloudAttachmentUrl(client: ConvexReactClient, src: string) {
  const storageId = cloudFileStorageId(src);
  if (!storageId) return src;
  const url = await client.query(api.financeFiles.getDownloadUrl, { storageId });
  if (!url) throw new Error("Este anexo não foi encontrado ou não pertence à sua conta");
  return url;
}
