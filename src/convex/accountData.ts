import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";

export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || identity.issuer !== process.env.CONVEX_SITE_URL) return null;
  const id = await getAuthUserId(ctx);
  if (!id) return null;
  const user = await ctx.db.get("users", id);
  return user?.email && !user.isAnonymous ? user : null;
}

export async function requireAccount(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user?.username) throw new ConvexError("Entre e conclua o cadastro para continuar.");
  return user;
}

// Legacy records used Convex Auth's "<userId>|<sessionId>" subject.
// "}" immediately follows "|" in the index order, bounding exactly that prefix.
export function legacySubjectBounds(userId: string) {
  return { start: userId + "|", end: userId + "}" };
}

export function ownsSubject(userId: string, subject: string) {
  return subject === userId || subject.startsWith(userId + "|");
}

export async function accountPeople(ctx: QueryCtx, userId: string) {
  const { start, end } = legacySubjectBounds(userId);
  const [current, legacy] = await Promise.all([
    ctx.db.query("people").withIndex("by_user_subject", q => q.eq("userSubject", userId)).collect(),
    ctx.db.query("people").withIndex("by_user_subject", q => q.gte("userSubject", start).lt("userSubject", end)).collect(),
  ]);
  return [...current, ...legacy].sort((a, b) => b._creationTime - a._creationTime);
}

export async function oldFinanceStates(ctx: QueryCtx, userId: string) {
  const { start, end } = legacySubjectBounds(userId);
  return ctx.db.query("financeStates")
    .withIndex("by_user_subject", q => q.gte("userSubject", start).lt("userSubject", end))
    .collect();
}
