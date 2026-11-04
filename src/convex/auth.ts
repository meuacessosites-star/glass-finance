import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizeEmail, normalizeUsername } from "../lib/auth-fields";
import { internal } from "./_generated/api";
import { createEmailOtp, emailOtp } from "./auth/emailOtp";

const passwordProvider = Password({
  verify: createEmailOtp("password-email-verification"),
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
      if (user._id !== match.userId || account.emailVerified !== match.email) throw new Error();
      return { userId: user._id };
    } catch {
      throw new ConvexError(invalidLogin);
    }
  },
});

const google = Google({
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
