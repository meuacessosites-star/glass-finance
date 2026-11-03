import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Resolve the authenticated partition key and rejects unverified Firebase email tokens. */
export async function getAuthenticatedUserSubject(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Autenticação necessária para acessar os dados da conta");
  }
  if (
    identity.issuer.startsWith("https://securetoken.google.com/") &&
    identity.emailVerified !== true
  ) {
    throw new Error("Confirme seu e-mail antes de acessar os dados financeiros");
  }
  return identity.subject;
}
