import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { requireAccount } from "./accountData";

// Keep large files out of financial snapshots. A URL is only issued after
// authentication, registration and ownership checks. File URLs are bearer links.
const MAX_FILE_BYTES = 8_000_000;
const SAFE_MIME = /^(?:image\/(?:jpeg|png|webp|gif)|application\/pdf)$/;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAccount(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const registerUpload = mutation({
  args: { storageId: v.id("_storage"), fileName: v.string() },
  handler: async (ctx, { storageId, fileName }) => {
    const user = await requireAccount(ctx);
    const cleanName = fileName.trim().slice(0, 140);
    if (!cleanName) throw new ConvexError("Informe o nome do arquivo.");
    const existing = await ctx.db.query("fileAssets")
      .withIndex("by_storage_id", q => q.eq("storageId", storageId)).unique();
    if (existing) {
      if (existing.userId !== user._id) throw new ConvexError("Arquivo pertence a outra conta.");
      return existing._id;
    }
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) throw new ConvexError("Arquivo não encontrado.");
    if (metadata.size <= 0 || metadata.size > MAX_FILE_BYTES)
      throw new ConvexError("O arquivo deve ter até 8 MB após a compactação.");
    const mimeType = metadata.contentType ?? "";
    if (!SAFE_MIME.test(mimeType))
      throw new ConvexError("Formato de arquivo não permitido.");
    return ctx.db.insert("fileAssets", {
      userId: user._id, storageId, fileName: cleanName,
      mimeType, byteLength: metadata.size, createdAt: Date.now(),
    });
  },
});

/** Paginated metadata prevents loading an entire user's file list at once. */
export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await requireAccount(ctx);
    return ctx.db.query("fileAssets")
      .withIndex("by_user_created", q => q.eq("userId", user._id))
      .order("desc")
      .paginate({ ...paginationOpts, maximumRowsRead: 100 });
  },
});

export const getMine = query({
  args: { assetId: v.id("fileAssets") },
  handler: async (ctx, { assetId }) => {
    const user = await requireAccount(ctx);
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id)
      throw new ConvexError("Arquivo não pertence a esta conta.");
    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) throw new ConvexError("Arquivo não encontrado no armazenamento.");
    return { url, fileName: asset.fileName, mimeType: asset.mimeType, byteLength: asset.byteLength };
  },
});

export const removeMine = mutation({
  args: { assetId: v.id("fileAssets") },
  handler: async (ctx, { assetId }) => {
    const user = await requireAccount(ctx);
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.userId !== user._id)
      throw new ConvexError("Arquivo não pertence a esta conta.");
    await ctx.storage.delete(asset.storageId);
    await ctx.db.delete(assetId);
    return { deleted: true };
  },
});
