import type { ImgHTMLAttributes } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cloudFileStorageId } from "@/lib/cloud-attachments";

/** Authenticated image rendering, compatible with old embedded data URLs. */
export function CloudAttachmentImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const storageId = cloudFileStorageId(src ?? "");
  const remoteUrl = useQuery(
    api.financeFiles.getDownloadUrl,
    storageId ? { storageId } : "skip",
  );
  // An unavailable remote file is shown as unavailable rather than silently lost.
  return <img src={storageId ? (remoteUrl ?? undefined) : src} alt={alt ?? "Anexo"} {...props} />;
}
