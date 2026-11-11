import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * This check is used only when submitting the "Create account" form.
 * It returns a boolean, never a user record or credentials. A final check
 * after an unsuccessful signup handles concurrent signup attempts.
 */
export const emailAlreadyRegistered = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || normalized.length > 254 || !normalized.includes("@")) return false;
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .first();
    return existing !== null;
  },
});

/** Public availability check only for new accounts. Profile edits are checked
 * again inside the authenticated mutation. */
export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const name = username.trim().replace(/\s+/g, " ");
    if (name.length < 3 || name.length > 32) return false;
    const normalized = name.toLocaleLowerCase("pt-BR");
    const found = await ctx.db.query("users")
      .withIndex("by_username_normalized", q => q.eq("usernameNormalized", normalized))
      .first();
    return !found;
  },
});
