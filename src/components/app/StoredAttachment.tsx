import type { ComponentProps } from "react";
import { useAttachmentSource, isImageAttachment } from "@/lib/cloud-attachments";
export function StoredAttachmentImage({ source, ...props }: { source: string } & Omit<ComponentProps<"img">, "src">) {
  const { src } = useAttachmentSource(source);
  return src ? <img {...props} src={src} /> :
    <span aria-label="Carregando imagem" className={props.className ?? ""} />;
}
export function StoredAttachmentTile({ source, index, onView, onDownload }: {
  source: string; index: number; onView: () => void; onDownload: (url: string) => void;
}) {
  const { src, fileName } = useAttachmentSource(source);
  if (!src) return <span className="flex aspect-square items-center justify-center rounded-xl bg-black/5 text-xs">Carregando…</span>;
  return isImageAttachment(source) ?
    <button type="button" aria-label={`Ver anexo ${index + 1}`} onClick={onView}
      className="group relative aspect-square overflow-hidden rounded-2xl transition-transform active:scale-95">
      <img src={src} alt={`Anexo ${index + 1}`} className="size-full object-cover"/>
    </button> :
    <button type="button" onClick={() => onDownload(src)}
      className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/40 px-2 text-center transition-transform active:scale-95">
      <span className="text-sm font-semibold text-[#2F6BFF]">PDF/Arquivo</span>
      <span className="truncate text-[10.5px] text-glass-sub">{fileName ?? "Arquivo"}</span>
    </button>;
}
