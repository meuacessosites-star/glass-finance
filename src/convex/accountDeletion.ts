import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Authenticated, atomic, self-service account deletion.
 * No email, user ID, or account identifier is accepted from the client.
 * Remove ALL historical subjects for this user, not only the selected history.
 * If Convex cannot complete the mutation, it rolls back without partial deletion.
 */
export const deleteMyAccount = mutation({
  args: { confirmation: v.literal("EXCLUIR") },
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId || !(await ctx.db.get(userId))) throw new Error("Entre na conta para excluir seu cadastro.");

    const accountId = String(userId);
    const prefix = `${accountId}|`;
    const mapping = await ctx.db.query("financeOwners")
      .withIndex("by_user_id", q => q.eq("userId", userId)).unique();
    const subjects = new Set<string>([`account:${accountId}`]);
    if (mapping) subjects.add(mapping.storageSubject);
    const identity = await ctx.auth.getUserIdentity();
    if (identity?.subject) subjects.add(identity.subject);

    // Include historical subjects from each account's older sessions.
    const legacy = await ctx.db.query("financeStates")
      .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff")).collect();
    const normalized = await ctx.db.query("financeV2States")
      .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\uffff")).collect();
    for (const doc of [...legacy, ...normalized]) subjects.add(doc.userSubject);

    const oldChunks = await ctx.db.query("financeStateChunks")
      .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    const oldTransactions = await ctx.db.query("financeTransactions")
      .withIndex("by_owner", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    const oldFiles = await ctx.db.query("financeFiles")
      .withIndex("by_owner_profile", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    const oldContacts = await ctx.db.query("people")
      .withIndex("by_user_subject", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    const oldPushDevices = await ctx.db.query("pushDevices")
      .withIndex("by_user", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    const oldSchedules = await ctx.db.query("pushSchedules")
      .withIndex("by_user_profile", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    const oldMigrations = await ctx.db.query("financeMigrationProgress")
      .withIndex("by_owner_profile", q => q.gte("userSubject", prefix).lt("userSubject", prefix + "\\uffff")).collect();
    for (const row of [
      ...oldChunks, ...oldTransactions, ...oldFiles, ...oldContacts,
      ...oldPushDevices, ...oldSchedules, ...oldMigrations,
    ]) subjects.add(row.userSubject);

    // A single mutation keeps account deletion all-or-nothing.
    for (const userSubject of subjects) {
      const states = await ctx.db.query("financeStates")
        .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).collect();
      for (const row of states) await ctx.db.delete(row._id);
      const chunks = await ctx.db.query("financeStateChunks")
        .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).collect();
      for (const row of chunks) await ctx.db.delete(row._id);
      const v2States = await ctx.db.query("financeV2States")
        .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).collect();
      for (const row of v2States) await ctx.db.delete(row._id);
      const transactions = await ctx.db.query("financeTransactions")
        .withIndex("by_owner", q => q.eq("userSubject", userSubject)).collect();
      for (const row of transactions) await ctx.db.delete(row._id);
      const migrations = await ctx.db.query("financeMigrationProgress")
        .withIndex("by_owner_profile", q => q.eq("userSubject", userSubject)).collect();
      for (const row of migrations) await ctx.db.delete(row._id);
      const files = await ctx.db.query("financeFiles")
        .withIndex("by_owner_profile", q => q.eq("userSubject", userSubject)).collect();
      for (const row of files) {
        await ctx.storage.delete(row.storageId);
        await ctx.db.delete(row._id);
      }
      const contacts = await ctx.db.query("people")
        .withIndex("by_user_subject", q => q.eq("userSubject", userSubject)).collect();
      for (const row of contacts) await ctx.db.delete(row._id);
      const devices = await ctx.db.query("pushDevices")
        .withIndex("by_user", q => q.eq("userSubject", userSubject)).collect();
      for (const row of devices) await ctx.db.delete(row._id);
      const schedules = await ctx.db.query("pushSchedules")
        .withIndex("by_user_profile", q => q.eq("userSubject", userSubject)).collect();
      for (const row of schedules) await ctx.db.delete(row._id);
    }

    const activeAppDevices = await ctx.db.query("accountDevices")
      .withIndex("by_user_last_seen", q => q.eq("userId", userId)).collect();
    for (const row of activeAppDevices) await ctx.db.delete(row._id);
    if (mapping) await ctx.db.delete(mapping._id);

    // Remove OAuth/password credentials and sessions, not just the user profile.
    const authAccounts = await ctx.db.query("authAccounts")
      .withIndex("userIdAndProvider", q => q.eq("userId", userId)).collect();
    const codes = await ctx.db.query("authVerificationCodes").collect();
    const accountIds = new Set(authAccounts.map(row => String(row._id)));
    for (const code of codes) {
      if (accountIds.has(String(code.accountId))) await ctx.db.delete(code._id);
    }
    for (const account of authAccounts) await ctx.db.delete(account._id);

    const sessions = await ctx.db.query("authSessions")
      .withIndex("userId", q => q.eq("userId", userId)).collect();
    for (const session of sessions) {
      const tokens = await ctx.db.query("authRefreshTokens")
        .withIndex("sessionId", q => q.eq("sessionId", session._id)).collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    await ctx.db.delete(userId);
    return { deleted: true };
  },
});
