import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Convex Auth's identity.subject contains the session identifier. Its value
 * changes on another device, so it must not be the financial ownership key.
 * A persisted mapping lets existing data stay under its original subject,
 * without deleting, copying or merging transactions.
 */
export async function financeOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Entre na sua conta para acessar os dados financeiros");
  const mapping = await ctx.db.query("financeOwners")
    .withIndex("by_user_id", q => q.eq("userId", userId))
    .unique();
  if (!mapping) {
    // Older browser builds can still finish their existing session safely
    // while the new client initializes the account-level mapping.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Entre na sua conta para acessar os dados financeiros");
    return identity.subject;
  }
  return String(mapping.storageSubject);
}

type Source = { subject: string; updatedAt: number; version: "Histórico" | "Histórico individual" };
async function oldSources(ctx: MutationCtx | QueryCtx, userId: string) {
  const prefix = `${userId}|`;
  const sources = new Map<string, Source>();
  const legacy = await ctx.db.query("financeStates")
    .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff")).collect();
  const normalized = await ctx.db.query("financeV2States")
    .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff")).collect();
  for (const row of legacy) {
    const subject = String(row.userSubject);
    sources.set(subject, { subject, updatedAt: Number(row.updatedAt), version: "Histórico" });
  }
  for (const row of normalized) {
    const subject = String(row.userSubject);
    sources.set(subject, { subject, updatedAt: Number(row.updatedAt), version: "Histórico individual" });
  }
  // A former release may have written under the bare current identity.
  const identity = await ctx.auth.getUserIdentity();
  if (identity && !identity.subject.startsWith(prefix)) {
    const [old, current] = await Promise.all([
      ctx.db.query("financeStates").withIndex("by_user_subject", q => q.eq("userSubject", identity.subject)).unique(),
      ctx.db.query("financeV2States").withIndex("by_user_subject", q => q.eq("userSubject", identity.subject)).unique(),
    ]);
    if (old || current) {
      sources.set(identity.subject, {
        subject: identity.subject, updatedAt: Number(current?.updatedAt ?? old?.updatedAt ?? 0),
        version: current ? "Histórico individual" : "Histórico",
      });
    }
  }
  return [...sources.values()].sort((a,b) => b.updatedAt - a.updatedAt);
}

/**
 * When multiple old sessions contain data, do not silently choose one and
 * do not lock the account behind an opaque server error. Offer a safe choice.
 * The unselected data remains intact and can be restored separately.
 */
export const ensureMine = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Entre na sua conta para sincronizar os dados");
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    if (mapping) return { ready: true as const, sources: [] as Source[] };
    const sources = await oldSources(ctx, String(userId));
    if (sources.length > 1) return { ready: false as const, sources };
    await ctx.db.insert("financeOwners", {
      userId, storageSubject: sources[0]?.subject ?? `account:${userId}`, createdAt: Date.now(),
    });
    return { ready: true as const, sources: [] as Source[] };
  },
});

export const selectMine = mutation({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Entre na sua conta para recuperar os dados");
    const existing = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    if (existing) return { ready: true as const };
    const sources = await oldSources(ctx, String(userId));
    if (sources.length < 2 || !sources.some(s => s.subject === subject))
      throw new Error("O histórico selecionado não pertence a esta conta");
    // No merging or deletion. The user knowingly selects the first shared
    // history. Other histories remain stored for a later explicit recovery.
    await ctx.db.insert("financeOwners", {
      userId, storageSubject: subject, createdAt: Date.now(),
    });
    return { ready: true as const };
  },
});

/**
 * Live account-level binding status. Convex automatically pushes changes from
 * one device to all connected sessions of the same authenticated user.
 * Never sends a session subject or financial records to the browser.
 */
export const getMappingStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { mapped: false as const };
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    return { mapped: Boolean(mapping), epoch: mapping?.switchEpoch ?? 0 };
  },
});

/**
 * Read-only previews for all known histories of this account. No payload,
 * full storage subject, personal details or transaction values leave the DB.
 * Unreadable snapshots are explicitly marked instead of reported as empty.
 */
export const listHistoryPreviews = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Faça login para consultar seus históricos");
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    const sources = await oldSources(ctx, String(userId));
    const previews = await Promise.all(sources.map(async (source) => {
      const v2 = await ctx.db.query("financeV2States")
        .withIndex("by_user_subject", q => q.eq("userSubject", source.subject)).unique();
      const legacy = await ctx.db.query("financeStates")
        .withIndex("by_user_subject", q => q.eq("userSubject", source.subject)).unique();
      let profileCount: number | null = null;
      let transactionCount: number | null = null;
      let readable = false;
      if (v2) {
        try {
          const payload: unknown = JSON.parse(v2.metadataPayload);
          if (payload && typeof payload === "object" && "profiles" in payload &&
              Array.isArray(payload.profiles)) {
            profileCount = payload.profiles.length;
            const rows = await ctx.db.query("financeTransactions")
              .withIndex("by_owner", q => q.eq("userSubject", source.subject)).take(2001);
            transactionCount = rows.length <= 2000 ? rows.length : null;
            readable = true;
          }
        } catch { /* Never claim a corrupted history is empty */ }
      } else if (legacy && legacy.chunkCount <= 100) {
        const chunks = await ctx.db.query("financeStateChunks")
          .withIndex("by_user_subject_revision", q => q.eq("userSubject", source.subject))
          .filter(q => q.eq(q.field("revision"), legacy.revision)).collect();
        if (chunks.length === legacy.chunkCount) {
          try {
            const raw: unknown = JSON.parse(chunks.sort((a,b) => a.chunkIndex - b.chunkIndex)
              .map(c => c.payload).join(""));
            if (raw && typeof raw === "object" && "profiles" in raw && Array.isArray(raw.profiles)) {
              profileCount = raw.profiles.length;
              const values = raw.profiles as Array<{ data?: { transactions?: unknown[] } }>;
              transactionCount = values.every(p => Array.isArray(p.data?.transactions))
                ? values.reduce((sum,p) => sum + (p.data?.transactions?.length ?? 0), 0)
                : null;
              readable = true;
            }
          } catch { /* Show unknown rather than zero */ }
        }
      }
      return {
        subject: source.subject,
        selected: mapping?.storageSubject === source.subject,
        updatedAt: source.updatedAt,
        version: source.version,
        readable,
        profileCount,
        transactionCount,
      };
    }));
    return { epoch: mapping?.switchEpoch ?? 0, histories: previews };
  },
});

/** Explicitly switch which ORIGINAL history is visible, without merging or
 * deleting anything. The epoch invalidates writes issued by other devices
 * against a previously selected source.
 */
export const switchMine = mutation({
  args: { subject: v.string(), expectedEpoch: v.number() },
  handler: async (ctx, { subject, expectedEpoch }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Faça login para recuperar os dados");
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    if (!mapping) throw new Error("Sua conta ainda não possui um histórico principal");
    if ((mapping.switchEpoch ?? 0) !== expectedEpoch)
      throw new Error("Outro dispositivo já alterou o histórico. Atualize e confira novamente.");
    if (mapping.storageSubject === subject) return { changed: false, epoch: expectedEpoch };
    const valid = await oldSources(ctx, String(userId));
    if (!valid.some(source => source.subject === subject))
      throw new Error("Este histórico não pertence à sua conta");
    const epoch = expectedEpoch + 1;
    await ctx.db.patch(mapping._id, { storageSubject: subject, switchEpoch: epoch });
    return { changed: true, epoch };
  },
});

/**
 * Account-scoped read-only sync diagnostic. Never modifies or transfers
 * historical financial data between devices.
 */
export const diagnostics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const accountKey = String(userId);
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    const identity = await ctx.auth.getUserIdentity();
    const selectedSubject = mapping?.storageSubject ?? identity?.subject ?? "";
    const prefix = accountKey + "|";
    const [legacy, v2] = await Promise.all([
      ctx.db.query("financeStates").withIndex("by_user_subject",
        q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff")).collect(),
      ctx.db.query("financeV2States").withIndex("by_user_subject",
        q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff")).collect(),
    ]);
    const known = new Map<string, number>();
    for (const state of [...legacy, ...v2]) {
      const subject = String(state.userSubject);
      known.set(subject, Math.max(known.get(subject) ?? 0, Number(state.updatedAt)));
    }
    const [activeLegacy, activeV2] = selectedSubject
      ? await Promise.all([
          ctx.db.query("financeStates").withIndex("by_user_subject",
            q => q.eq("userSubject", selectedSubject)).unique(),
          ctx.db.query("financeV2States").withIndex("by_user_subject",
            q => q.eq("userSubject", selectedSubject)).unique(),
        ])
      : [null, null];
    const other = [...known.entries()].filter(([subject]) => subject !== selectedSubject);
    return {
      accountCode: accountKey.slice(-12),
      mapped: Boolean(mapping),
      version: activeV2 ? "v2" as const : activeLegacy ? "legacy" as const : "empty" as const,
      revision: Number(activeV2?.revision ?? activeLegacy?.revision ?? 0),
      updatedAt: Number(activeV2?.updatedAt ?? activeLegacy?.updatedAt ?? 0),
      otherHistoryCount: other.length,
      lastOtherHistoryUpdate: other.length ? Math.max(...other.map(([, timestamp]) => timestamp)) : 0,
    };
  },
});
