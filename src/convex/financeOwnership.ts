import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
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
async function oldSources(ctx: MutationCtx, userId: string) {
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
