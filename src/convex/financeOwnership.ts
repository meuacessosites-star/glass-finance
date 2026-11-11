import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";

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
  if (!mapping) throw new Error("Sincronização da conta ainda não foi inicializada");
  return mapping.storageSubject;
}

/**
 * Run once after signing in, BEFORE reading or saving finance state.
 * Reuse the previous session's storage as-is when exactly one source exists.
 * If several independent sources exist, stop without merging or losing them.
 */
export const ensureMine = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Entre na sua conta para sincronizar os dados");
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId))
      .unique();
    if (mapping) return { ready: true as const };

    const prefix = `${userId}|`;
    const existingSubjects = new Set<string>();
    // Indexed prefix scans find older sessions without reading other users'
    // financial payloads or revealing them to the browser.
    const legacyStates = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff"))
      .collect();
    for (const state of legacyStates) existingSubjects.add(state.userSubject);
    const normalizedStates = await ctx.db.query("financeV2States")
      .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff"))
      .collect();
    for (const state of normalizedStates) existingSubjects.add(state.userSubject);

    // Existing records may have been created under a non-session identifier
    // by an earlier release. Treat the authenticated identity as a candidate.
    const identity = await ctx.auth.getUserIdentity();
    if (identity && !identity.subject.startsWith(prefix)) {
      const [legacy, normalized] = await Promise.all([
        ctx.db.query("financeStates").withIndex("by_user_subject", q => q.eq("userSubject", identity.subject)).unique(),
        ctx.db.query("financeV2States").withIndex("by_user_subject", q => q.eq("userSubject", identity.subject)).unique(),
      ]);
      if (legacy || normalized) existingSubjects.add(identity.subject);
    }

    if (existingSubjects.size > 1) {
      throw new Error("Esta conta possui históricos salvos em sessões diferentes. Nenhum registro foi alterado. Faça backup de cada dispositivo antes de unificar os dados.");
    }
    const storageSubject = existingSubjects.values().next().value ?? `account:${userId}`;
    await ctx.db.insert("financeOwners", {
      userId,
      storageSubject,
      createdAt: Date.now(),
    });
    return { ready: true as const };
  },
});
