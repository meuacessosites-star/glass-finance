import type { Id } from "./_generated/dataModel";

/**
 * Link only files that have already been registered to the current account.
 * Never trust a client-provided storage id without checking its owner.
 * Runs in the same Convex mutation as a successful financial write.
 */
export async function linkReferencedFiles(
  ctx: {
    db: {
      query: (table: "financeFiles") => any;
      patch: (id: Id<"financeFiles">, patch: { linked: boolean }) => Promise<unknown>;
    };
  },
  userSubject: string,
  value: unknown,
  profileId?: string,
): Promise<void> {
  const candidates = new Set<string>();
  const visit = (item: unknown, depth: number) => {
    if (depth > 40) throw new Error("Estrutura de anexos muito profunda");
    if (typeof item === "string") {
      const match = /^glass-file:([^:]+):(image|file|gzip)$/.exec(item);
      if (match) candidates.add(match[1]);
    } else if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
    } else if (item && typeof item === "object") {
      for (const child of Object.values(item)) visit(child, depth + 1);
    }
  };
  visit(value, 0);
  if (candidates.size > 200) throw new Error("Excesso de referências de arquivos em uma operação");
  for (const key of candidates) {
    // Indexed record ownership also prevents a user from borrowing another
    // account's file by guessing its storage identifier.
    const record = await ctx.db.query("financeFiles")
      .withIndex("by_storage_id", (q: any) => q.eq("storageId", key))
      .unique();
    if (!record || record.userSubject !== userSubject ||
        (profileId && record.profileId !== profileId)) {
      throw new Error("Anexo não encontrado ou não autorizado para esta conta");
    }
    if (!record.linked) {
      await ctx.db.patch(record._id as Id<"financeFiles">, { linked: true });
    }
  }
}
