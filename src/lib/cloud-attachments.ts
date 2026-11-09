import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressAttachmentFile } from "@/lib/attachment-utils";

const IMAGE_PREFIX = "glass-image:";
const FILE_PREFIX = "glass-file:";
export function isStoredAttachment(value: string) {
  return value.startsWith(IMAGE_PREFIX) || value.startsWith(FILE_PREFIX);
}
export function isImageAttachment(value: string) {
  return value.startsWith("data:image/") || value.startsWith(IMAGE_PREFIX);
}
function assetId(value: string): Id<"fileAssets"> | null {
  if (!isStoredAttachment(value)) return null;
  const id = value.slice(value.indexOf(":") + 1);
  return /^[a-zA-Z0-9_-]{8,96}$/.test(id) ? id as Id<"fileAssets"> : null;
}
export function useAttachmentSource(value: string) {
  const id = assetId(value);
  const item = useQuery(api.fileAssets.getMine, id ? { assetId: id } : "skip");
  return {
    src: id ? (item?.url ?? null) : isStoredAttachment(value) ? null : value,
    fileName: item?.fileName ?? null,
  };
}
export function useUploadAttachment() {
  const generateUrl = useMutation(api.fileAssets.generateUploadUrl);
  const registerUpload = useMutation(api.fileAssets.registerUpload);
  return async (file: File): Promise<string> => {
    const image = file.type.startsWith("image/");
    // Legacy office and ZIP formats still use the compatible inline format.
    if (!image && file.type !== "application/pdf") return compressAttachmentFile(file);
    const blob = image
      ? await (await fetch(await compressAttachmentFile(file))).blob()
      : file;
    if (blob.size > 8_000_000) throw new Error("file-too-large");
    const uploadUrl = await generateUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": blob.type || file.type },
      body: blob,
    });
    if (!response.ok) throw new Error("upload-failed");
    const { storageId } = await response.json() as { storageId: Id<"_storage"> };
    const id = await registerUpload({ storageId, fileName: file.name });
    return `${image ? IMAGE_PREFIX : FILE_PREFIX}${id}`;
  };
}
