import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

async function getUserSubject(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Autenticação necessária para acessar pessoas");
  }
  return identity.subject;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userSubject = await getUserSubject(ctx);
    return await ctx.db
      .query("people")
      .withIndex("by_user_subject", (q) => q.eq("userSubject", userSubject))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    avatarType: v.optional(
      v.union(v.literal("letters"), v.literal("emoji"), v.literal("foto")),
    ),
    avatarValue: v.optional(v.string()),
    avatarColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Informe o nome da pessoa");
    }

    const userSubject = await getUserSubject(ctx);
    const phone = args.phone?.replace(/\D/g, "") || undefined;

    return await ctx.db.insert("people", {
      userSubject,
      name,
      phone,
      avatarType: args.avatarType,
      avatarValue: args.avatarValue,
      avatarColor: args.avatarColor,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("people"),
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userSubject = await getUserSubject(ctx);
    const person = await ctx.db.get(args.id);
    if (!person || person.userSubject !== userSubject) {
      throw new Error("Pessoa não encontrada");
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error("Informe o nome da pessoa");
    }

    await ctx.db.patch(args.id, {
      name,
      phone: args.phone?.replace(/\D/g, "") || undefined,
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("people"),
  },
  handler: async (ctx, args) => {
    const userSubject = await getUserSubject(ctx);
    const person = await ctx.db.get(args.id);
    if (!person || person.userSubject !== userSubject) {
      throw new Error("Pessoa não encontrada");
    }

    await ctx.db.delete(args.id);
  },
});
