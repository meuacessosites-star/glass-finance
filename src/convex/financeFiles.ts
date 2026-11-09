import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const MAX_FILE_BYTES = 8_000_000;

async function owner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Autenticação necessária para acessar anexos");
  return identity.subject;
}

/** Short-lived, authenticated upload URL. The file is not linked until register() completes. */
export const createUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await owner(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const register = mutation({
  args: {
    storageId: v.id("_storage"),
    profileId: v.string(),
    fileName: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, { storageId, profileId, fileName, contentType }) => {
    const userSubject = await owner(ctx);
    if (!profileId || profileId.length > 150 ||
        !fileName || fileName.length > 255 || contentType.length > 150)
      throw new Error("Metadados inválidos do anexo");
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata || metadata.size > MAX_FILE_BYTES)
      throw new Error("Arquivo ausente ou acima do limite permitido");
    const existing = await ctx.db.query("financeFiles")
      .withIndex("by_storage_id", q => q.eq("storageId", storageId)).unique();
    if (existing) throw new Error("Este arquivo já foi registrado");
    await ctx.db.insert("financeFiles", {
      userSubject, profileId, storageId, fileName,
      contentType, byteSize: metadata.size, createdAt: Date.now(),
    });
    return { storageId };
  },
});

/** The URL is only returned to the authenticated owner of the registered file. */
export const getDownloadUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userSubject = await owner(ctx);
    const file = await ctx.db.query("financeFiles")
      .withIndex("by_storage_id", q => q.eq("storageId", storageId)).unique();
    if (!file || file.userSubject !== userSubject) return null;
    return ctx.storage.getUrl(storageId);
  },
});

export const getMetadata = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userSubject = await owner(ctx);
    const file = await ctx.db.query("financeFiles")
      .withIndex("by_storage_id", q => q.eq("storageId", storageId)).unique();
    if (!file || file.userSubject !== userSubject) return null;
    return { name: file.fileName, size: file.byteSize, contentType: file.contentType };
  },
});

// Files are intentionally NOT deleted when a transaction is changed or removed.
// This makes undo and backup recovery possible; cleanup must first prove no
// references remain in transactions, loans, backups, or old snapshots.
