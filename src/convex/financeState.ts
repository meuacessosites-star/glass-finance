import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// Chunk each string well below Convex's per-document size limit while permitting
// compressed receipt images and the rest of the account's JSON state.
const CHUNK_CHARACTERS = 150_000;
const MAX_PAYLOAD_BYTES = 12_000_000;

async function getUserSubject(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Autenticação necessária para acessar os dados financeiros");
  return identity.subject;
}

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userSubject = await getUserSubject(ctx);
    const state = await ctx.db
      .query("financeStates")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .unique();
    if (!state) return null;

    const chunks = await ctx.db
      .query("financeStateChunks")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .filter((q) => q.eq(q.field("revision"), state.revision))
      .collect();
    if (chunks.length !== state.chunkCount) {
      throw new Error("Os dados financeiros estão incompletos no banco; nenhum dado local será usado para substituí-los.");
    }
    const payload = chunks
      .sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex))
      .map((chunk) => String(chunk.payload))
      .join("");
    return { revision: state.revision, updatedAt: state.updatedAt, payload };
  },
});

export const saveMine = mutation({
  args: {
    payload: v.string(),
    expectedRevision: v.number(),
  },
  handler: async (ctx, { payload, expectedRevision }) => {
    const userSubject = await getUserSubject(ctx);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error("Revisão inválida");
    }
    if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
      throw new Error("Os dados excedem o limite de 12 MB para um snapshot. Exporte um backup antes de remover ou reduzir anexos.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new Error("O estado financeiro enviado não é um JSON válido");
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { profiles?: unknown }).profiles)) {
      throw new Error("O estado financeiro enviado não tem o formato esperado");
    }

    const existing = await ctx.db
      .query("financeStates")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .unique();
    const currentRevision = existing?.revision ?? 0;
    if (expectedRevision !== currentRevision) {
      return { ok: false as const, conflict: true as const, revision: currentRevision };
    }

    const revision = currentRevision + 1;
    const updatedAt = Date.now();
    const chunks = Array.from(
      { length: Math.ceil(payload.length / CHUNK_CHARACTERS) },
      (_, chunkIndex) => payload.slice(chunkIndex * CHUNK_CHARACTERS, (chunkIndex + 1) * CHUNK_CHARACTERS),
    );

    // All database writes in a Convex mutation are atomic: a reader sees either
    // the old complete revision or the new complete revision, never a partial one.
    const oldChunks = existing
      ? await ctx.db
          .query("financeStateChunks")
          .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
          .filter((q) => q.eq(q.field("revision"), currentRevision))
          .collect()
      : [];
    for (const oldChunk of oldChunks) {
      await ctx.db.delete(oldChunk._id as Id<"financeStateChunks">);
    }
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      await ctx.db.insert("financeStateChunks", {
        userSubject,
        revision,
        chunkIndex,
        payload: chunks[chunkIndex],
      });
    }
    if (existing) {
      await ctx.db.patch(existing._id as Id<"financeStates">, {
        chunkCount: chunks.length,
        revision,
        updatedAt,
      });
    } else {
      await ctx.db.insert("financeStates", {
        userSubject,
        chunkCount: chunks.length,
        revision,
        updatedAt,
      });
    }
    return { ok: true as const, conflict: false as const, revision, updatedAt };
  },
});

export const deleteMine = mutation({
  args: {},
  handler: async (ctx) => {
    const userSubject = await getUserSubject(ctx);
    const state = await ctx.db
      .query("financeStates")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .unique();
    if (state) await ctx.db.delete(state._id as Id<"financeStates">);

    const chunks = await ctx.db
      .query("financeStateChunks")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .collect();
    for (const chunk of chunks) await ctx.db.delete(chunk._id as Id<"financeStateChunks">);

    const people = await ctx.db
      .query("people")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .collect();
    for (const person of people) await ctx.db.delete(person._id as Id<"people">);
    return { deleted: true };
  },
});
