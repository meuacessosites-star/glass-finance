import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAccount } from "./accountData";

const BATCH_SIZE = 12;
const MAX_ROW_BYTES = 720_000;
type SourceTransaction = { id: string; date: string; amount: number; [key: string]: unknown };
type SourceProfile = { id: string; data?: { transactions?: SourceTransaction[] } };
type SourceSnapshot = { profiles?: SourceProfile[] };

function cents(amount: number): number {
  if (!Number.isFinite(amount)) throw new ConvexError("Valor de transação inválido.");
  const result = Math.round(amount * 100);
  if (!Number.isSafeInteger(result)) throw new ConvexError("Valor monetário fora do limite de precisão.");
  return result;
}

async function sourceFor(ctx: MutationCtx, subject: string) {
  const state = await ctx.db.query("financeStates")
    .withIndex("by_user_subject", q => q.eq("userSubject", subject)).unique();
  if (!state || state.chunkCount === 0) return null;
  const chunks = await ctx.db.query("financeStateChunks")
    .withIndex("by_user_subject_revision", q => q.eq("userSubject", subject).eq("revision", state.revision)).collect();
  if (chunks.length !== state.chunkCount)
    throw new ConvexError("Dados originais incompletos. Migração interrompida.");
  const payload = chunks.sort((a,b) => a.chunkIndex - b.chunkIndex).map(c => c.payload).join("");
  let parsed: SourceSnapshot;
  try { parsed = JSON.parse(payload) as SourceSnapshot; }
  catch { throw new ConvexError("Dados originais inválidos."); }
  if (!Array.isArray(parsed.profiles)) throw new ConvexError("Perfis originais inválidos.");
  return { revision: state.revision, profiles: parsed.profiles };
}

// Safe, resumable, read-only-to-the-old-database copy.
export const prepareNext = mutation({
  args: { profileId: v.string(), expectedRevision: v.number() },
  handler: async (ctx, { profileId, expectedRevision }) => {
    const user = await requireAccount(ctx);
    const source = await sourceFor(ctx, user.financeSubject ?? user._id);
    if (!source || source.revision !== expectedRevision)
      throw new ConvexError("O histórico mudou. Recarregue antes de continuar a migração.");
    const profile = source.profiles.find(item => item.id === profileId);
    if (!profile) throw new ConvexError("Perfil não encontrado.");
    const transactions = profile.data?.transactions ?? [];
    if (!Array.isArray(transactions)) throw new ConvexError("Transações originais inválidas.");
    const ids = new Set<string>();
    let originalTotalCents = 0;
    for (const t of transactions) {
      if (!t || typeof t.id !== "string" || !t.id || ids.has(t.id) ||
          typeof t.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.date))
        throw new ConvexError("Existe uma transação duplicada ou inválida.");
      ids.add(t.id);
      originalTotalCents += cents(t.amount);
      if (!Number.isSafeInteger(originalTotalCents)) throw new ConvexError("Total excede a precisão em centavos.");
    }

    const checkpoint = await ctx.db.query("transactionMigrationStates")
      .withIndex("by_user_profile", q => q.eq("userId", user._id).eq("profileId", profileId)).unique();
    if (checkpoint?.completed && checkpoint.sourceRevision === source.revision)
      return { completed: true, migrated: checkpoint.offset, total: checkpoint.total, revision: source.revision };
    // A newer revision always starts a new *version* of copied rows.
    let offset = checkpoint?.sourceRevision === source.revision ? checkpoint.offset : 0;
    let migratedCents = checkpoint?.sourceRevision === source.revision ? checkpoint.migratedCents : 0;
    const end = Math.min(offset + BATCH_SIZE, transactions.length);
    for (const tx of transactions.slice(offset, end)) {
      const payload = JSON.stringify(tx);
      if (new TextEncoder().encode(payload).byteLength > MAX_ROW_BYTES)
        throw new ConvexError("Existe um anexo antigo muito grande. A cópia parou sem alterar a transação.");
      const saved = await ctx.db.query("transactionEntries")
        .withIndex("by_user_profile_revision_id", q =>
          q.eq("userId", user._id).eq("profileId", profileId)
            .eq("sourceRevision", source.revision).eq("externalId", tx.id)).unique();
      const amountCents = cents(tx.amount);
      if (saved) {
        if (saved.payload !== payload || saved.amountCents !== amountCents)
          throw new ConvexError("Cópia incompatível com a transação original.");
      } else {
        await ctx.db.insert("transactionEntries", {
          userId: user._id, profileId, externalId: tx.id,
          sourceRevision: source.revision, date: tx.date, amountCents, payload,
        });
      }
      migratedCents += amountCents;
    }
    offset = end;
    const completed = offset === transactions.length;
    if (completed && (offset !== ids.size || migratedCents !== originalTotalCents))
      throw new ConvexError("Os valores não conferem. O original foi preservado.");
    const changes = {
      userId: user._id, profileId, sourceRevision: source.revision,
      offset, total: transactions.length, totalCents: originalTotalCents,
      migratedCents, completed, updatedAt: Date.now(),
    };
    if (checkpoint) await ctx.db.patch(checkpoint._id, changes);
    else await ctx.db.insert("transactionMigrationStates", changes);
    return { completed, migrated: offset, total: transactions.length, revision: source.revision };
  },
});

export const sourceInfo = query({
  args: {},
  handler: async ctx => {
    const user = await requireAccount(ctx);
    const state = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", user.financeSubject ?? user._id)).unique();
    return { revision: state?.revision ?? 0, hasSnapshot: Boolean(state?.chunkCount) };
  },
});

export const statusMine = query({
  args: {},
  handler: async ctx => {
    const user = await requireAccount(ctx);
    const states = await ctx.db.query("transactionMigrationStates")
      .withIndex("by_user", q => q.eq("userId", user._id)).collect();
    const current = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", user.financeSubject ?? user._id)).unique();
    return states.map(state => ({
      profileId: state.profileId, sourceRevision: state.sourceRevision,
      currentRevision: current?.revision ?? 0,
      migrated: state.offset, total: state.total,
      completed: state.completed && state.sourceRevision === current?.revision
        && state.totalCents === state.migratedCents,
    }));
  },
});

export const listPrepared = query({
  args: { profileId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { profileId, paginationOpts }) => {
    const user = await requireAccount(ctx);
    const checkpoint = await ctx.db.query("transactionMigrationStates")
      .withIndex("by_user_profile", q => q.eq("userId", user._id).eq("profileId", profileId)).unique();
    const state = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", user.financeSubject ?? user._id)).unique();
    if (!checkpoint?.completed || !state || checkpoint.sourceRevision !== state.revision
        || checkpoint.migratedCents !== checkpoint.totalCents)
      throw new ConvexError("A cópia não está validada para a revisão atual.");
    const page = await ctx.db.query("transactionEntries")
      .withIndex("by_user_profile_revision_date", q =>
        q.eq("userId", user._id).eq("profileId", profileId).eq("sourceRevision", checkpoint.sourceRevision))
      .order("desc").paginate({ ...paginationOpts, maximumRowsRead: 100 });
    return {
      ...page,
      page: page.page.map(row => ({
        id: row.externalId, date: row.date, amountCents: row.amountCents,
        transaction: JSON.parse(row.payload) as SourceTransaction,
      })),
    };
  },
});
