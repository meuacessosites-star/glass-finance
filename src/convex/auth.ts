import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizeEmail, normalizeUsername } from "../lib/auth-fields";
import { internal } from "./_generated/api";
import { createEmailOtp, emailOtp } from "./auth/emailOtp";

const standardPasswordProvider = Password({
  // Email possession is verified before a password account can be used.
  verify: createEmailOtp("email-verification"),
  reset: createEmailOtp("password-reset"),
  profile(params) {
    const email = normalizeEmail(params.email);
    // The provider also uses the original email to address and verify each OTP.
    if (!email || params.email !== email) throw new ConvexError("Informe um e-mail válido em letras minúsculas.");
    return { email };
  },
  validatePasswordRequirements(password) {
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      throw new ConvexError("A senha deve ter entre 8 e 128 caracteres.");
    }
  },
});

// No new password identity may impersonate an existing verified Google identity.
// Linking requires a signed-in Google session and the existing password.
const basePasswordOptions = (standardPasswordProvider as unknown as {
  options: { authorize: typeof standardPasswordProvider.authorize }
}).options;
const passwordProvider = {
  ...standardPasswordProvider,
  options: {
    ...basePasswordOptions,
    async authorize(params: Parameters<typeof basePasswordOptions.authorize>[0],
      ctx: Parameters<typeof basePasswordOptions.authorize>[1]) {
      if (params.flow === "signUp") {
        // Reject duplicate usernames before creating a pending email account
        // or sending the verification code. Rechecked atomically on claim.
        if (params.username !== undefined) {
          const username = normalizeUsername(params.username);
          if (!username) throw new ConvexError("Nome de usuário inválido. Use de 3 a 24 letras, números ou _.");
          const taken = await ctx.runQuery(internal.users.usernameTakenForSignup, { username });
          if (taken) throw new ConvexError("Esse nome de usuário já está cadastrado. Escolha outro para continuar.");
        }
        const email = normalizeEmail(params.email);
        if (!email) throw new ConvexError("Informe um e-mail válido.");
        const existing = await ctx.runQuery(internal.users.verifiedGoogleAccountForEmail, { email });
        if (existing) throw new ConvexError(
          "Este e-mail já possui login Google. Entre com Google e adicione sua senha em Perfis → Senha da conta.",
        );
      }
      return basePasswordOptions.authorize(params, ctx);
    },
  },
};

const invalidLogin = "E-mail, nome de usuário ou senha incorretos.";
const usernamePassword = ConvexCredentials({
  id: "username",
  async authorize(params, ctx) {
    const username = normalizeUsername(params.username);
    if (!username || typeof params.password !== "string" || !params.password || params.password.length > 128) {
      throw new ConvexError(invalidLogin);
    }
    const match = await ctx.runQuery(internal.users.passwordAccountForUsername, { username });
    if (!match) throw new ConvexError(invalidLogin);
    try {
      const { account, user } = await retrieveAccount(ctx, {
        provider: "password", account: { id: match.email, secret: params.password },
      });
      if (user._id !== match.userId) throw new Error();
      return { userId: user._id };
    } catch {
      throw new ConvexError(invalidLogin);
    }
  },
});

const google = Google({
  // A Google identity may join a password account only if the provider
  // verifies ownership of the email (e.g. Gmail or Workspace). Do not
  // auto-link unverified third-party mailbox addresses.
  allowDangerousEmailAccountLinking: false,
  profile(profile) {
    const email = normalizeEmail(profile.email);
    if (!email || profile.email_verified !== true) throw new Error("O Google não confirmou este e-mail.");
    // Google is authoritative for Gmail and Workspace. Other Google accounts
    // can sign in by sub, but must not auto-link to a mailbox they used to own.
    const authoritative = email.endsWith("@gmail.com") || Boolean(profile.hd);
    return { id: profile.sub, email, emailVerified: authoritative, name: profile.name, image: profile.picture };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [google, passwordProvider, usernamePassword, emailOtp],
});
