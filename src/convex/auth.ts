// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { createEmailOtp, emailOtp } from "./auth/emailOtp";

const passwordProvider = Password({
  profile(params) {
    const email = String(params.email ?? "").trim().toLowerCase();
    if (params.flow !== "signUp") return { email };
    const username = String(params.username ?? "").trim().replace(/\s+/g, " ");
    if (username.length < 3 || username.length > 32)
      throw new Error("O nome de usuário deve ter entre 3 e 32 caracteres.");
    return {
      email,
      username,
      usernameNormalized: username.toLocaleLowerCase("pt-BR"),
      name: username,
    };
  },
  verify: createEmailOtp("password-email-verification"),
  reset: createEmailOtp("password-reset"),
  validatePasswordRequirements(password) {
    if (password.length < 8 || password.length > 128) {
      throw new Error("A senha deve ter entre 8 e 128 caracteres");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, passwordProvider, emailOtp, Anonymous],
});
