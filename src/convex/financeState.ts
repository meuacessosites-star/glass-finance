import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { accountPeople, oldFinanceStates, requireAccount } from "./accountData";

// Chunk each string well below Convex's per-document size limit while permitting
// compressed receipt images and the rest of the account's JSON state.
const CHUNK_CHARACTERS = 150_000;
const MAX_PAYLOAD_BYTES = 12_000_000;

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAccount(ctx);
    const userSubject = user.financeSubject ?? user._id;
    const state = await ctx.db
      .query("financeStates")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .unique();
    if (!state) return null;

    const chunks = await ctx.db
      .query("financeStateChunks")
      .withIndex("by_user_subject_revision", (q) => q.eq("userSubject", userSubject).eq("revision", state.revision))
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
    const user = await requireAccount(ctx);
    const userSubject = user.financeSubject ?? user._id;
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
          .withIndex("by_user_subject_revision", (q) => q.eq("userSubject", userSubject).eq("revision", currentRevision))
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
    const user = await requireAccount(ctx);
    const canonical = await ctx.db
      .query("financeStates")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", user._id))
      .unique();
    const states = await oldFinanceStates(ctx, user._id);
    if (canonical) states.push(canonical);
    // Keep only a revision-only tombstone (NO personal financial content).
    // Other online devices receive it through the live query. Stale devices
    // cannot recreate deleted data with an earlier expectedRevision.
    const revision = Math.max(0, ...states.map((state) => state.revision)) + 1;
    for (const state of states) {
      const chunks = await ctx.db.query("financeStateChunks")
        .withIndex("by_user_subject", q => q.eq("userSubject", state.userSubject)).collect();
      for (const chunk of chunks) await ctx.db.delete(chunk._id as Id<"financeStateChunks">);
      if (state.userSubject !== user._id) await ctx.db.delete(state._id as Id<"financeStates">);
    }
    if (canonical) {
      await ctx.db.patch(canonical._id as Id<"financeStates">, {
        revision, updatedAt: Date.now(), chunkCount: 0,
      });
    } else {
      await ctx.db.insert("financeStates", {
        userSubject: user._id, revision, updatedAt: Date.now(), chunkCount: 0,
      });
    }
    if (user.financeSubject !== user._id) {
      await ctx.db.patch(user._id, { financeSubject: user._id });
    }
    const people = await accountPeople(ctx, user._id);
    for (const person of people) await ctx.db.delete(person._id as Id<"people">);
    return { deleted: true, revision };
  },
});
