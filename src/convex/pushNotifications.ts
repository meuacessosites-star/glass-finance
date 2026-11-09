import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function subject(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("É necessário entrar na conta");
  return identity.subject;
}

const scheduleItem = v.object({
  key: v.string(),
  date: v.string(),
  kind: v.union(v.literal("invoice"), v.literal("transaction"), v.literal("loan"), v.literal("review")),
});
const timeZones = new Set([
  "America/Recife", "America/Sao_Paulo", "America/Fortaleza", "America/Manaus",
  "America/Belem", "America/Bahia", "America/Cuiaba", "America/Campo_Grande",
  "America/Rio_Branco", "America/Porto_Velho", "America/Noronha",
  "UTC", "Europe/Lisbon", "America/New_York", "America/Los_Angeles",
]);

export const getPublicKey = query({
  args: {},
  handler: async (ctx) => {
    await subject(ctx);
    // Public VAPID key is intentionally safe to share with the browser.
    return process.env.PUSH_VAPID_PUBLIC_KEY || null;
  },
});

export const registerDevice = mutation({
  args: {
    profileId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const userSubject = await subject(ctx);
    if (!args.profileId || args.profileId.length > 128 ||
        args.endpoint.length > 2048 || !/^https:\/\//.test(args.endpoint) ||
        args.p256dh.length > 120 || args.auth.length > 60 ||
        !timeZones.has(args.timeZone))
      throw new Error("Inscrição de notificações inválida");
    // Defend against malicious endpoints before storing them. The sender
    // repeats a stricter host validation before each external HTTP request.
    const url = new URL(args.endpoint);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        !(host === "fcm.googleapis.com" ||
          host === "updates.push.services.mozilla.com" ||
          host === "web.push.apple.com" ||
          host.endsWith(".push.apple.com") ||
          host.endsWith(".push.services.mozilla.com")))
      throw new Error("Provedor push desconhecido");
    if (!/^[A-Za-z0-9_-]+$/.test(args.p256dh) || !/^[A-Za-z0-9_-]+$/.test(args.auth))
      throw new Error("Chaves de notificação inválidas");
    const existing = await ctx.db.query("pushDevices")
      .withIndex("by_endpoint", q => q.eq("endpoint", args.endpoint)).unique();
    const record = {
      userSubject, profileId: args.profileId,
      endpoint: args.endpoint, p256dh: args.p256dh, auth: args.auth,
      timeZone: args.timeZone, enabled: true, updatedAt: Date.now(),
    };
    if (existing) {
      // An endpoint must never be taken over by another logged-in account.
      if (existing.userSubject !== userSubject)
        throw new Error("Dispositivo associado a outra conta. Remova a inscrição anterior neste navegador.");
      await ctx.db.patch(existing._id as Id<"pushDevices">, {
        ...record,
      });
    } else {
      await ctx.db.insert("pushDevices", { ...record, createdAt: Date.now() });
    }
    return { registered: true };
  },
});

export const removeDevice = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const userSubject = await subject(ctx);
    const existing = await ctx.db.query("pushDevices")
      .withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).unique();
    if (existing && existing.userSubject === userSubject)
      await ctx.db.delete(existing._id as Id<"pushDevices">);
    return { removed: true };
  },
});

/** Only dates and generic categories, no balances, merchant names, or amounts. */
export const syncSchedule = mutation({
  args: { profileId: v.string(), items: v.array(scheduleItem) },
  handler: async (ctx, { profileId, items }) => {
    const userSubject = await subject(ctx);
    if (!profileId || profileId.length > 128 || items.length > 300)
      throw new Error("Calendário de lembretes inválido");
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.key || item.key.length > 160 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || seen.has(item.key))
        throw new Error("Lembrete duplicado ou inválido");
      seen.add(item.key);
    }
    const existing = await ctx.db.query("pushSchedules")
      .withIndex("by_user_profile", q => q.eq("userSubject", userSubject))
      .filter(q => q.eq(q.field("profileId"), profileId)).unique();
    const fields = { userSubject, profileId, items, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id as Id<"pushSchedules">, fields);
    else await ctx.db.insert("pushSchedules", fields);
    return { count: items.length };
  },
});

export const pageDevices = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    return ctx.db.query("pushDevices").paginate({
      cursor: cursor ?? null, numItems: 50,
    });
  },
});

function localParts(timeZone: string, now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Atomic day reservation prevents parallel hourly invocations duplicating a push. */
export const reserveDailyPush = internalMutation({
  args: { deviceId: v.id("pushDevices") },
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db.get(deviceId) as unknown as {
      _id: Id<"pushDevices">; enabled: boolean; userSubject: string;
      profileId: string; endpoint: string; p256dh: string; auth: string;
      timeZone: string; lastSentDay?: string;
    } | null;
    if (!device || !device.enabled) return null;
    const local = localParts(device.timeZone, Date.now());
    if (local.hour !== 9 || device.lastSentDay === local.date) return null;
    const rawSchedule = await ctx.db.query("pushSchedules")
      .withIndex("by_user_profile", q => q.eq("userSubject", device.userSubject))
      .filter(q => q.eq(q.field("profileId"), device.profileId)).unique();
    const schedule = rawSchedule as unknown as {
      updatedAt: number;
      items: Array<{key: string; date: string; kind: "invoice" | "loan" | "transaction" | "review"}>;
    } | null;
    if (!schedule || Date.now() - schedule.updatedAt > 120 * 86400000) return null;
    const dayNumber = Date.parse(local.date + "T12:00:00Z");
    const due = schedule.items.filter(item => {
      const distance = Math.round((Date.parse(item.date + "T12:00:00Z") - dayNumber) / 86400000);
      return item.kind === "review"
        ? distance >= -7 && distance <= 0
        : distance >= -7 && distance <= 1;
    });
    if (due.length === 0) return null;
    await ctx.db.patch(device._id as Id<"pushDevices">, { lastSentDay: local.date });
    return {
      endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth,
      count: due.length,
    };
  },
});

export const deleteExpiredDevice = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const device = await ctx.db.query("pushDevices")
      .withIndex("by_endpoint", q => q.eq("endpoint", endpoint)).unique();
    if (device) await ctx.db.delete(device._id as Id<"pushDevices">);
  },
});
