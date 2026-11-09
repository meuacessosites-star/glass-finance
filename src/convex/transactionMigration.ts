import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Preparação isolada: nenhuma função abaixo modifica os snapshots legados.
// A revisão é conferida em cada lote para não copiar uma versão obsoleta.
async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Autenticação necessária");
  return identity.subject;
}
const item = v.object({
  id: v.string(),
  amount: v.number(),
  date: v.string(),
  payload: v.any(),
});
function cents(amount: number) {
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100)) ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)
    throw new Error("Valor monetário inválido ou com fração de centavo");
  return Math.round(amount * 100);
}
export const copyBatch = mutation({
  args: { profileId: v.string(), sourceRevision: v.number(), items: v.array(item) },
  handler: async (ctx, args) => {
    const userSubject = await owner(ctx);
    if (!args.profileId || !Number.isSafeInteger(args.sourceRevision) ||
        args.sourceRevision < 1 || args.items.length > 50)
      throw new Error("Lote de migração inválido");
    const state = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).unique();
    if (!state || state.revision !== args.sourceRevision)
      throw new Error("Snapshot mudou. Reinicie a conferência antes de copiar.");
    const ids = new Set<string>();
    let copied = 0;
    for (const transaction of args.items) {
      if (!transaction.id || ids.has(transaction.id) ||
          typeof transaction.payload !== "object" || transaction.payload === null ||
          transaction.payload.id !== transaction.id ||
          transaction.payload.amount !== transaction.amount ||
          transaction.payload.date !== transaction.date ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(transaction.date))
        throw new Error("Transação inválida ou duplicada no lote");
      ids.add(transaction.id);
      const amountCents = cents(transaction.amount);
      const existing = await ctx.db.query("financeTransactions")
        .withIndex("by_owner_profile_transaction", q =>
          q.eq("userSubject", userSubject).eq("profileId", args.profileId).eq("transactionId", transaction.id))
        .unique();
      if (existing) {
        if (existing.sourceRevision === args.sourceRevision &&
            JSON.stringify(existing.payload) === JSON.stringify(transaction.payload)) continue;
        throw new Error("Conflito de migração: registro existente diferente. Nenhum dado será substituído.");
      }
      await ctx.db.insert("financeTransactions", {
        userSubject, profileId: args.profileId, transactionId: transaction.id,
        payload: transaction.payload, amountCents, dateKey: transaction.date,
        sourceRevision: args.sourceRevision, updatedAt: Date.now(),
      });
      copied++;
    }
    return { copied, alreadyPresent: args.items.length - copied, revision: args.sourceRevision };
  },
});
export const listPage = query({
  args: { profileId: v.string(), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { profileId, cursor, limit }) => {
    const userSubject = await owner(ctx);
    const numItems = Math.min(100, Math.max(1, Math.floor(limit ?? 50)));
    return ctx.db.query("financeTransactions")
      .withIndex("by_owner_profile_date", q => q.eq("userSubject", userSubject).eq("profileId", profileId))
      .order("desc").paginate({ cursor: cursor ?? null, numItems });
  },
});
