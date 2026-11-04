import { ConvexError, v } from "convex/values";
import { normalizeUsername, USERNAME_HELP } from "../lib/auth-fields";
import { getCurrentUser, oldFinanceStates } from "./accountData";
import { internalQuery, mutation, query } from "./_generated/server";

export const currentUser = query({ args: {}, handler: getCurrentUser });

export const authMethods = query({
  args: {},
  handler: () => ({
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    emailDelivery: Boolean(process.env.AUTH_EMAIL_API_KEY || (process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM)),
  }),
});

export const claimUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new ConvexError("Entre para escolher seu nome de usuário.");
    const username = normalizeUsername(args.username);
    if (!username) throw new ConvexError(USERNAME_HELP);
    if (user.username === username) return;
    if (user.username) throw new ConvexError("Esta conta já tem um nome de usuário.");
    const existing = await ctx.db.query("users")
      .withIndex("by_username", q => q.eq("username", username)).unique();
    if (existing) throw new ConvexError("Esse nome de usuário já está em uso. Escolha outro.");

    // Select the most recently saved snapshot once, without copying or merging
    // independent histories from old sessions. New accounts use the stable ID.
    const canonical = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", user._id)).unique();
    const previous = canonical ?? (await oldFinanceStates(ctx, user._id))
      .sort((a, b) => b.updatedAt - a.updatedAt || b._creationTime - a._creationTime)[0];
    await ctx.db.patch(user._id, { username, financeSubject: previous?.userSubject ?? user._id });
  },
});

// Only the credential provider can resolve a username to its password account.
export const passwordAccountForUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db.query("users")
      .withIndex("by_username", q => q.eq("username", username)).unique();
    if (!user) return null;
    const account = await ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", q => q.eq("userId", user._id).eq("provider", "password"))
      .filter(q => q.eq(q.field("emailVerified"), q.field("providerAccountId"))).first();
    return account ? { userId: user._id, email: account.providerAccountId } : null;
  },
});
