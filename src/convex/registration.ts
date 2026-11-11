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
