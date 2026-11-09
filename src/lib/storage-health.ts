/**
 * Estimativa LOCAL: bytes de um snapshot da UI, nunca a quota faturada no Convex.
 * Não persiste, transmite ou imprime nenhum conteúdo financeiro.
 */
export const LEGACY_SNAPSHOT_LIMIT_BYTES = 12_000_000;

type AttachmentCarrier = { attachments?: string[] };
type ProfileForEstimate = {
  avatar?: { image?: string | null };
  data: {
    transactions?: AttachmentCarrier[];
    loanReceivables?: AttachmentCarrier[];
    categories?: Array<{ image?: string }>;
  };
};

export function estimateStorageHealth(profiles: ProfileForEstimate[]) {
  const totalJsonBytes = new TextEncoder().encode(JSON.stringify({ profiles })).byteLength;
  let transactionCount = 0;
  let attachmentCount = 0;
  let inlineAttachmentBytes = 0;
  for (const profile of profiles) {
    transactionCount += profile.data.transactions?.length ?? 0;
    for (const item of [...(profile.data.transactions ?? []), ...(profile.data.loanReceivables ?? [])]) {
      for (const attachment of item.attachments ?? []) {
        attachmentCount++;
        if (attachment.startsWith("data:")) {
          inlineAttachmentBytes += new TextEncoder().encode(attachment).byteLength;
        }
      }
    }
    if (profile.avatar?.image?.startsWith("data:")) {
      inlineAttachmentBytes += new TextEncoder().encode(profile.avatar.image).byteLength;
    }
    for (const category of profile.data.categories ?? []) {
      if (category.image?.startsWith("data:")) {
        inlineAttachmentBytes += new TextEncoder().encode(category.image).byteLength;
      }
    }
  }
  const usageFraction = totalJsonBytes / LEGACY_SNAPSHOT_LIMIT_BYTES;
  return {
    totalJsonBytes,
    transactionCount,
    attachmentCount,
    inlineAttachmentBytes,
    usagePercent: Math.min(100, Math.round(usageFraction * 100)),
    level: usageFraction >= 0.85 ? "critical" as const : usageFraction >= 0.6 ? "warning" as const : "normal" as const,
  };
}

export function formatStorageBytes(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(2)} MB`
    : `${Math.round(bytes / 1_000)} KB`;
}
