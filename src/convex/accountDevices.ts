import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// A browser installation (including a PWA) has one locally persisted ID.
// This measures activity in Glass Finance, NOT devices signed into Google.
const ACTIVE_FOR_MS = 5 * 60 * 1000;
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const heartbeat = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Entre na conta para registrar este acesso.");
    if (!DEVICE_ID_PATTERN.test(deviceId)) throw new Error("Identificador do acesso inválido.");

    const now = Date.now();
    const current = await ctx.db.query("accountDevices")
      .withIndex("by_user_device", q => q.eq("userId", userId).eq("deviceId", deviceId))
      .unique();
    if (current) {
      if (now - current.lastSeenAt >= 30_000) await ctx.db.patch(current._id, { lastSeenAt: now });
    } else {
      await ctx.db.insert("accountDevices", {
        userId, deviceId, firstSeenAt: now, lastSeenAt: now,
      });
    }
    // Keep bounded account-level presence history, not an indefinite device log.
    const stale = await ctx.db.query("accountDevices")
      .withIndex("by_user_last_seen", q => q.eq("userId", userId).lt("lastSeenAt", now - 30 * 24 * 60 * 60 * 1000))
      .take(8);
    for (const row of stale) await ctx.db.delete(row._id);
    return { ok: true };
  },
});

export const summary = query({
  // Changing this value refreshes a count even when no write occurs.
  args: { refreshTick: v.number() },
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const now = Date.now();
    const active = await ctx.db.query("accountDevices")
      .withIndex("by_user_last_seen", q => q.eq("userId", userId).gte("lastSeenAt", now - ACTIVE_FOR_MS))
      .collect();
    return { activeDevices: active.length, observedWithinMinutes: 5 };
  },
});
