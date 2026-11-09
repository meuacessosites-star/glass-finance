import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Preparação isolada: nenhuma função abaixo modifica os snapshots legados.
// A revisão é conferida em cada lote para não copiar uma versão obsoleta.
async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Autenticação necessária");
  return identity.subject;
}
const ownerProfileKey = (userSubject: string, profileId: string) =>
  JSON.stringify([userSubject, profileId]);
const ownerTransactionKey = (userSubject: string, profileId: string, transactionId: string) =>
  JSON.stringify([userSubject, profileId, transactionId]);
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
    // Read the authoritative legacy revision in the same database transaction.
    // The browser may only request copies of records that actually exist.
    const sourceChunks = await ctx.db.query("financeStateChunks")
      .withIndex("by_user_subject_revision", q => q.eq("userSubject", userSubject))
      .filter(q => q.eq(q.field("revision"), args.sourceRevision)).collect();
    if (sourceChunks.length !== state.chunkCount)
      throw new Error("Snapshot original incompleto; migração interrompida");
    const original = JSON.parse(
      sourceChunks.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex))
        .map(c => String(c.payload)).join(""),
    ) as { profiles?: Array<{ id: string; data?: { transactions?: Array<{ id: string; amount: number; date: string }> } }> };
    const profile = original.profiles?.find(p => p.id === args.profileId);
    if (!profile || !Array.isArray(profile.data?.transactions))
      throw new Error("Perfil de origem não encontrado");
    const legacyRows = new Map(profile.data.transactions.map(t => [t.id, t]));

    const ids = new Set<string>();
    let copied = 0;
    for (const transaction of args.items) {
      if (!transaction.id || ids.has(transaction.id) ||
          typeof transaction.payload !== "object" || transaction.payload === null ||
          transaction.payload.id !== transaction.id ||
          transaction.payload.amount !== transaction.amount ||
          transaction.payload.date !== transaction.date ||
          !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date))
        throw new Error("Transação inválida ou duplicada no lote");
      const sourceRow = legacyRows.get(transaction.id);
      if (!sourceRow ||
          JSON.stringify(sourceRow) !== JSON.stringify(transaction.payload) ||
          sourceRow.amount !== transaction.amount || sourceRow.date !== transaction.date)
        throw new Error("O registro enviado não corresponde ao snapshot original");
      if (new TextEncoder().encode(JSON.stringify(transaction.payload)).byteLength > 900_000)
        throw new Error("Anexo antigo muito grande. Transfira-o para armazenamento de arquivos antes da migração");
      ids.add(transaction.id);
      const amountCents = cents(transaction.amount);
      const existing = await ctx.db.query("financeTransactions")
        .withIndex("by_owner_profile_transaction", q =>
          q.eq("ownerTransactionKey", ownerTransactionKey(userSubject, args.profileId, transaction.id)))
        .unique();
      if (existing) {
        if (existing.sourceRevision === args.sourceRevision &&
            JSON.stringify(existing.payload) === JSON.stringify(transaction.payload)) continue;
        throw new Error("Conflito de migração: registro existente diferente. Nenhum dado será substituído.");
      }
      await ctx.db.insert("financeTransactions", {
        userSubject, profileId: args.profileId, transactionId: transaction.id,
        ownerProfileKey: ownerProfileKey(userSubject, args.profileId),
        ownerTransactionKey: ownerTransactionKey(userSubject, args.profileId, transaction.id),
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
      .withIndex("by_owner_profile_date", q => q.eq("ownerProfileKey", ownerProfileKey(userSubject, profileId)))
      .order("desc").paginate({ cursor: cursor ?? null, numItems });
  },
});

/** Confere o snapshot legado contra os registros copiados, sem modificar dados. */
export const verifyProfile = query({
  args: { profileId: v.string(), sourceRevision: v.number() },
  handler: async (ctx, { profileId, sourceRevision }) => {
    const userSubject = await owner(ctx);
    const state = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).unique();
    if (!state || state.revision !== sourceRevision)
      return { verified: false, reason: "revision_changed" as const };
    const chunks = await ctx.db.query("financeStateChunks")
      .withIndex("by_user_subject_revision", q =>
        q.eq("userSubject", userSubject))
      .filter(q => q.eq(q.field("revision"), sourceRevision)).collect();
    if (chunks.length !== state.chunkCount)
      return { verified: false, reason: "incomplete_snapshot" as const };
    const raw = chunks.sort((a,b) => Number(a.chunkIndex)-Number(b.chunkIndex)).map(c=>String(c.payload)).join("");
    const snapshot = JSON.parse(raw) as { profiles?: Array<{ id: string; data?: { transactions?: Array<{ id:string; amount:number; date:string }> } }> };
    const profile = snapshot.profiles?.find(p => p.id === profileId);
    if (!profile?.data || !Array.isArray(profile.data.transactions))
      return { verified: false, reason: "missing_profile" as const };
    const expected = profile.data.transactions;
    const expectedIds = new Set<string>();
    const expectedById = new Map<string, { id: string; amount: number; date: string }>();
    let expectedCents = 0;
    for (const item of expected) {
      if (!item.id || expectedIds.has(item.id))
        return { verified: false, reason: "duplicate_legacy_id" as const };
      expectedIds.add(item.id);
      expectedById.set(item.id, item);
      expectedCents += cents(item.amount);
      if (!Number.isSafeInteger(expectedCents)) throw new Error("Soma excedeu a precisão segura");
    }
    const copied = await ctx.db.query("financeTransactions")
      .withIndex("by_owner_profile", q =>
        q.eq("ownerProfileKey", ownerProfileKey(userSubject, profileId))).collect();
    let copiedCents = 0;
    const copiedIds = new Set<string>();
    for (const item of copied) {
      const original = expectedById.get(String(item.transactionId));
      if (item.sourceRevision !== sourceRevision || !original ||
          copiedIds.has(String(item.transactionId)) ||
          JSON.stringify(original) !== JSON.stringify(item.payload) ||
          cents(original.amount) !== item.amountCents ||
          original.date !== item.dateKey)
        return { verified: false, reason: "unexpected_or_changed_record" as const };
      copiedIds.add(String(item.transactionId));
      copiedCents += Number(item.amountCents);
      if (!Number.isSafeInteger(copiedCents)) throw new Error("Soma excedeu a precisão segura");
    }
    return {
      verified: expected.length === copied.length && expectedCents === copiedCents,
      expectedCount: expected.length, copiedCount: copied.length,
      expectedAmountCents: expectedCents, copiedAmountCents: copiedCents,
      reason: expected.length === copied.length && expectedCents === copiedCents
        ? "matched" as const : "mismatch" as const,
    };
  },
});
