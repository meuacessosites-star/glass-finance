import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccount } from "./accountData";

// A small, intentionally limited preference namespace: interface choices
// only, never passwords, API credentials, financial data or raw form input.
const validKey = /^(?:account:theme|profile:[a-zA-Z0-9_-]{1,90}:(?:privacy:(?:all|home-summary|reserves-cards)|reserves:(?:filter|sort)|transactions:(?:scope|payment-status|summary-expanded|chart-expanded)))$/;
const validValue = /^(?:true|false|light|dark|all|yield|plain|recent|amount|name|month|pending|paid|unpaid|overdue|open|scheduled|cleared|both|income|expense)$/;
function validate(key: string, value?: string) {
  if (!validKey.test(key)) throw new ConvexError("Preferência de interface inválida.");
  if (value !== undefined && (value.length > 50 || !validValue.test(value)))
    throw new ConvexError("Valor da preferência inválido.");
}

export const getMine = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const user = await requireAccount(ctx);
    validate(key);
    const row = await ctx.db.query("userPreferences")
      .withIndex("by_user_key", q => q.eq("userId", user._id).eq("key", key)).unique();
    return row?.value ?? null;
  },
});

export const setMine = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const user = await requireAccount(ctx);
    validate(key, value);
    // A per-user/key indexed transaction guarantees no duplicate preference
    // rows on concurrent updates from multiple devices.
    const existing = await ctx.db.query("userPreferences")
      .withIndex("by_user_key", q => q.eq("userId", user._id).eq("key", key)).unique();
    if (existing) await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("userPreferences", { userId: user._id, key, value, updatedAt: Date.now() });
  },
});
