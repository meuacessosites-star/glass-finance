import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  // Compatibilidade temporária com a assinatura gerada pelo Convex no deploy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx: any) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/**
 * Updates the signed-in account's public display username.
 * Never changes auth providers, emails, passwords, or financial profiles.
 */
export const updateUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Entre na conta para alterar o nome de usuário.");
    const clean = username.trim().replace(/\\s+/g, " ");
    if (clean.length < 3 || clean.length > 32)
      throw new Error("O nome de usuário deve ter entre 3 e 32 caracteres.");
    const normalized = clean.toLocaleLowerCase("pt-BR");
    const used = await ctx.db.query("users")
      .withIndex("by_username_normalized", q => q.eq("usernameNormalized", normalized)).first();
    if (used && used._id !== userId)
      throw new Error("Este nome de usuário já está em uso. Escolha outro.");
    await ctx.db.patch(userId, { username: clean, usernameNormalized: normalized });
    return { username: clean };
  },
});
