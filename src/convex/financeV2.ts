import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const MAX_METADATA_BYTES = 9_000_000;
const MAX_CHANGE_BATCH_BYTES = 1_500_000;
const ownerProfileKey = (owner: string, profileId: string) => JSON.stringify([owner, profileId]);
const ownerTransactionKey = (owner: string, profileId: string, txId: string) => JSON.stringify([owner, profileId, txId]);

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Faça login para acessar os dados financeiros");
  return identity.subject;
}
function monetaryCents(amount: number) {
  const result = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(result) ||
      Math.abs(result - amount * 100) > 0.000001)
    throw new Error("Valor monetário inválido");
  return result;
}
function validateMetadata(raw: string) {
  if (new TextEncoder().encode(raw).byteLength > MAX_METADATA_BYTES)
    throw new Error("Metadados grandes demais. Remova arquivos embutidos antes da migração.");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || !("profiles" in data) ||
      !Array.isArray(data.profiles) || data.profiles.length < 1)
    throw new Error("O estado financeiro não contém perfis válidos");
  const ids = new Set<string>();
  for (const p of data.profiles) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" ||
        !p.id || ids.has(p.id) || !p.data ||
        !Array.isArray(p.data.transactions) || p.data.transactions.length !== 0)
      throw new Error("Os metadados não podem conter histórico ou perfis duplicados");
    ids.add(p.id);
  }
  return ids;
}

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userSubject = await owner(ctx);
    const state = await ctx.db.query("financeV2States")
      .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).unique();
    if (!state) return null;
    return {
      revision: Number(state.revision),
      metadataPayload: String(state.metadataPayload),
      updatedAt: Number(state.updatedAt),
      legacyRevision: Number(state.legacyRevision),
    };
  },
});

export const listProfilePage = query({
  args: { profileId: v.string(), cursor: v.optional(v.string()) },
  handler: async (ctx, { profileId, cursor }) => {
    const userSubject = await owner(ctx);
    const rows = await ctx.db.query("financeTransactions")
      .withIndex("by_owner_profile", q => q.eq("ownerProfileKey", ownerProfileKey(userSubject, profileId)))
      .paginate({ cursor: cursor ?? null, numItems: 10 });
    return {
      page: rows.page.map(item => item.payload),
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    };
  },
});

const operation = v.object({
  type: v.union(v.literal("upsert"), v.literal("delete")),
  profileId: v.string(),
  transactionId: v.string(),
  payload: v.optional(v.any()),
});

/** New storage writes just changed transactions plus small metadata. Atomic per batch. */
export const saveMine = mutation({
  args: {
    expectedRevision: v.number(),
    metadataPayload: v.string(),
    operations: v.array(operation),
  },
  handler: async (ctx, { expectedRevision, metadataPayload, operations }) => {
    const userSubject = await owner(ctx);
    const state = await ctx.db.query("financeV2States")
      .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).unique();
    if (!state) throw new Error("Histórico individual ainda não foi ativado");
    const current = Number(state.revision);
    if (current !== expectedRevision)
      return { ok: false as const, revision: current };
    if (operations.length > 30 ||
        new TextEncoder().encode(JSON.stringify(operations)).byteLength > MAX_CHANGE_BATCH_BYTES)
      throw new Error("Lote muito grande para salvar com segurança");
    const activeProfiles = validateMetadata(metadataPayload);
    const seen = new Set<string>();
    for (const op of operations) {
      const key = ownerTransactionKey(userSubject, op.profileId, op.transactionId);
      if (!op.profileId || !op.transactionId || seen.has(key))
        throw new Error("Identificador de transação duplicado ou inválido");
      seen.add(key);
      const existing = await ctx.db.query("financeTransactions")
        .withIndex("by_owner_profile_transaction", q => q.eq("ownerTransactionKey", key)).unique();
      if (op.type === "delete") {
        if (existing) await ctx.db.delete(existing._id as Id<"financeTransactions">);
        continue;
      }
      if (!activeProfiles.has(op.profileId) || !op.payload ||
          typeof op.payload !== "object" || Array.isArray(op.payload))
        throw new Error("Registro ou perfil inválido");
      const row = op.payload as { id?: unknown; amount?: unknown; date?: unknown };
      if (row.id !== op.transactionId || typeof row.amount !== "number" ||
          typeof row.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.date))
        throw new Error("Identificação, valor ou data inválida");
      const amountCents = monetaryCents(row.amount);
      const fields = {
        userSubject,
        profileId: op.profileId,
        transactionId: op.transactionId,
        ownerProfileKey: ownerProfileKey(userSubject, op.profileId),
        ownerTransactionKey: key,
        payload: op.payload,
        amountCents,
        dateKey: row.date,
        sourceRevision: current + 1,
        updatedAt: Date.now(),
      };
      if (existing) await ctx.db.patch(existing._id as Id<"financeTransactions">, fields);
      else await ctx.db.insert("financeTransactions", fields);
    }
    const revision = current + 1;
    const updatedAt = Date.now();
    await ctx.db.patch(state._id as Id<"financeV2States">, { revision, updatedAt, metadataPayload });
    return { ok: true as const, revision, updatedAt };
  },
});

/** Switch is forbidden unless every legacy profile has been verified at this exact revision. */
export const activateFromLegacy = mutation({
  args: { sourceRevision: v.number() },
  handler: async (ctx, { sourceRevision }) => {
    const userSubject = await owner(ctx);
    const already = await ctx.db.query("financeV2States")
      .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).unique();
    if (already) throw new Error("O histórico individual já está ativo");
    const state = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).unique();
    if (!state || state.revision !== sourceRevision)
      throw new Error("A origem mudou. Verifique a migração novamente");
    const chunks = await ctx.db.query("financeStateChunks")
      .withIndex("by_user_subject_revision", q => q.eq("userSubject", userSubject))
      .filter(q => q.eq(q.field("revision"), sourceRevision)).collect();
    if (chunks.length !== state.chunkCount)
      throw new Error("Snapshot legado incompleto");
    const legacy: unknown = JSON.parse(
      chunks.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex))
        .map(c => String(c.payload)).join(""),
    );
    if (!legacy || typeof legacy !== "object" ||
        !("profiles" in legacy) || !Array.isArray(legacy.profiles) ||
        legacy.profiles.length < 1) throw new Error("Snapshot legado inválido");
    for (const profile of legacy.profiles) {
      if (!profile || typeof profile.id !== "string" ||
          !profile.data || !Array.isArray(profile.data.transactions))
        throw new Error("Perfil de origem inválido");
      const progress = await ctx.db.query("financeMigrationProgress")
        .withIndex("by_owner_profile", q => q.eq("userSubject", userSubject))
        .filter(q => q.eq(q.field("profileId"), profile.id)).unique();
      if (!progress || progress.status !== "verified" ||
          progress.sourceRevision !== sourceRevision ||
          progress.expectedCount !== profile.data.transactions.length)
        throw new Error(`O perfil ${profile.name ?? profile.id} ainda não passou na conferência`);
    }
    const original = legacy as { profiles: Array<{ data: { transactions: unknown[] } }> };
    const metadata = { ...original, profiles: original.profiles.map(p => ({
      ...p, data: {
        ...p.data,
        transactions: [],
        transactionOrder: p.data.transactions.map((row: unknown) =>
          typeof row === "object" && row !== null && "id" in row ? String(row.id) : "",
        ),
      },
    })) };
    const metadataPayload = JSON.stringify(metadata);
    validateMetadata(metadataPayload);
    const updatedAt = Date.now();
    await ctx.db.insert("financeV2States", {
      userSubject, revision: 1, metadataPayload, legacyRevision: sourceRevision, updatedAt,
    });
    return { activated: true, revision: 1 };
  },
});
