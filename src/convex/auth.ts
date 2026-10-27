// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { createEmailOtp, emailOtp } from "./auth/emailOtp";

const passwordProvider = Password({
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
