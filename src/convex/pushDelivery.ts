"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { deliverWebPush, type VapidCredentials } from "./webPushCrypto";

/** Invoked by Convex cron, then paged via the scheduler.
 * No user financial amount, name, or transaction is sent over push.
 */
export const dispatchDue = internalAction({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const publicKey = process.env.PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.PUSH_VAPID_PRIVATE_KEY;
    const contact = process.env.PUSH_VAPID_CONTACT;
    if (!publicKey || !privateKey || !contact) {
      // Unconfigured deployments stay silent; this is not a mock delivery.
      return { configured: false, attempts: 0 };
    }
    const credentials: VapidCredentials = {
      publicKey, privateKey, contact,
    };
    const page = await ctx.runQuery(internal.pushNotifications.pageDevices, { cursor });
    let attempts = 0;
    for (const device of page.page) {
      const pending = await ctx.runMutation(internal.pushNotifications.reserveDailyPush, {
        deviceId: device._id,
      });
      if (!pending) continue;
      attempts++;
      const message = JSON.stringify({
        title: "Glass Finance",
        body: pending.count === 1
          ? "Você tem um lembrete financeiro para conferir."
          : "Você tem lembretes financeiros para conferir.",
        url: "/dashboard/notificacoes",
      });
      try {
        const code = await deliverWebPush(pending, credentials, message);
        if (code === 404 || code === 410) {
          await ctx.runMutation(internal.pushNotifications.deleteExpiredDevice, {
            endpoint: pending.endpoint,
          });
        }
        if (code < 200 || code >= 300) {
          // No sensitive subscription or transaction details in logs.
          console.warn("Push provider returned a non-success status", code);
        }
      } catch {
        console.warn("Web Push delivery failed for a device");
      }
    }
    if (!page.isDone && page.continueCursor) {
      await ctx.scheduler.runAfter(0, internal.pushDelivery.dispatchDue, {
        cursor: page.continueCursor,
      });
    }
    return { configured: true, attempts };
  },
});
