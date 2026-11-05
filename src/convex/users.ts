import { ConvexError, v } from "convex/values";
import { createAccount, getAuthUserId, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { normalizeUsername, suggestUsername, USERNAME_HELP } from "../lib/auth-fields";
import { getCurrentUser, oldFinanceStates } from "./accountData";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export const currentUser = query({ args: {}, handler: getCurrentUser });

export const authMethods = query({
  args: {},
  handler: () => ({
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    emailDelivery: Boolean(process.env.AUTH_EMAIL_API_KEY || (process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM)),
  }),
});

export const claimUsername = mutation({
  args: { username: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new ConvexError("Entre para escolher seu nome de usuário.");
    const requested = args.username?.trim() ?? "";
    if (user.username) {
      if (requested && normalizeUsername(requested) === user.username) return;
      throw new ConvexError("Esta conta já tem um nome de usuário. Altere-o na aba Conta.");
    }

    let username: string;
    if (requested) {
      const normal = normalizeUsername(requested);
      if (!normal) throw new ConvexError(USERNAME_HELP);
      const existing = await ctx.db.query("users")
        .withIndex("by_username", q => q.eq("username", normal)).unique();
      if (existing) throw new ConvexError("Esse nome de usuário já está em uso. Escolha outro.");
      username = normal;
    } else {
      // Choosing a username is optional after Google login. The username is
      // derived from the verified account profile, never from a client claim.
      const base = suggestUsername(user.name, user.email);
      let available: string | null = null;
      for (let n = 1; n <= 1000; n += 1) {
        const suffix = n === 1 ? "" : "_" + n;
        const candidate = base.slice(0, 24 - suffix.length).replace(/_+$/g, "") + suffix;
        const existing = await ctx.db.query("users")
          .withIndex("by_username", q => q.eq("username", candidate)).unique();
        if (!existing) { available = candidate; break; }
      }
      if (!available) throw new ConvexError("Não foi possível sugerir um nome disponível. Escolha um manualmente.");
      username = available;
    }

    // Select the most recently saved snapshot once, without copying or merging
    // independent histories from old sessions. New accounts use the stable ID.
    const canonical = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.eq("userSubject", user._id)).unique();
    const previous = canonical ?? (await oldFinanceStates(ctx, user._id))
      .sort((a, b) => b.updatedAt - a.updatedAt || b._creationTime - a._creationTime)[0];
    await ctx.db.patch(user._id, { username, financeSubject: previous?.userSubject ?? user._id });
  },
});

/** Changing a username never changes the authenticated user ID or their financial data. */
export const updateUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username: submitted }) => {
    const user = await getCurrentUser(ctx);
    if (!user?.username) throw new ConvexError("Entre e conclua seu cadastro para alterar o nome de usuário.");
    const username = normalizeUsername(submitted);
    if (!username) throw new ConvexError(USERNAME_HELP);
    if (user.username === username) return;
    const existing = await ctx.db.query("users")
      .withIndex("by_username", q => q.eq("username", username)).unique();
    if (existing) throw new ConvexError("Esse nome de usuário já está em uso. Escolha outro.");
    await ctx.db.patch(user._id, { username });
  },
});


/** The login password belongs to the authenticated account, not to its finance profiles. */
export const passwordStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const account = await ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", q => q.eq("userId", user._id).eq("provider", "password")).first();
    return { hasPassword: Boolean(account), canCreate: Boolean(user.emailVerificationTime) };
  },
});

export const passwordSettingsForActiveUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user?.email || !user.username) return null;
    const account = await ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", q => q.eq("userId", user._id).eq("provider", "password")).first();
    return { id: user._id, email: user.email, verified: Boolean(user.emailVerificationTime), hasPassword: Boolean(account) };
  },
});

/** Requires a live authenticated session; changing a password requires the old one. */
export const managePassword = action({
  args: { currentPassword: v.optional(v.string()), newPassword: v.string() },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Entre na conta antes de configurar sua senha.");
    if (newPassword.length < 8 || newPassword.length > 128)
      throw new ConvexError("A nova senha deve ter entre 8 e 128 caracteres.");
    const data = await ctx.runQuery(internal.users.passwordSettingsForActiveUser);
    if (!data || data.id !== userId) throw new ConvexError("Conta autenticada não encontrada.");

    if (data.hasPassword) {
      if (!currentPassword || currentPassword.length > 128)
        throw new ConvexError("Informe sua senha atual para substituí-la.");
      let existing;
      try {
        existing = await retrieveAccount(ctx, {
          provider: "password", account: { id: data.email, secret: currentPassword },
        });
      } catch {
        throw new ConvexError("A senha atual está incorreta.");
      }
      if (!existing || existing.user._id !== userId)
        throw new ConvexError("A senha atual está incorreta.");
      await modifyAccountCredentials(ctx, {
        provider: "password", account: { id: data.email, secret: newPassword },
      });
    } else {
      // A logged-in Google user can add a password to that same identity.
      // No unauthenticated email address is ever sufficient to link accounts.
      if (!data.verified)
        throw new ConvexError("Confirme seu e-mail pelo login Google antes de criar uma senha.");
      const created = await createAccount(ctx, {
        provider: "password", account: { id: data.email, secret: newPassword },
        profile: { email: data.email }, shouldLinkViaEmail: true,
      });
      if (created.user._id !== userId)
        throw new ConvexError("Não foi possível vincular a senha à conta conectada.");
    }
    return { ok: true };
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
      .first();
    return account ? { userId: user._id, email: account.providerAccountId } : null;
  },
});
