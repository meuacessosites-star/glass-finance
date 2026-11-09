import type { AppProfile, ProfileData } from "./app-store";
import type { Transaction } from "./mock-data";
import { selectTransactionLedgers } from "./transaction-ledgers";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export type TrashedTransaction = {
  transaction: Transaction;
  deletedAt: number;
  originalOrder: string[];
};
export function sanitizeTransactionTrash(value: unknown, now = Date.now()): TrashedTransaction[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((item): item is TrashedTransaction => {
    if (!item || typeof item !== "object") return false;
    const row = item as Partial<TrashedTransaction>;
    const tx = row.transaction;
    if (!tx || typeof tx.id !== "string" || !tx.id ||
        typeof tx.date !== "string" || typeof tx.amount !== "number" ||
        !Number.isFinite(tx.amount) || ids.has(tx.id) ||
        typeof row.deletedAt !== "number" || row.deletedAt > now ||
        now - row.deletedAt >= TRASH_RETENTION_MS ||
        !Array.isArray(row.originalOrder)) return false;
    ids.add(tx.id);
    return true;
  });
}
export type TransactionDeletion = {
  profileId: string;
  transactions: Transaction[];
  originalOrder: string[];
};

export function captureTransactionDeletion(
  data: ProfileData,
  profileId: string,
  ids: string[],
): TransactionDeletion | undefined {
  const wanted = new Set(ids);
  const transactions = selectTransactionLedgers(
    data.transactions,
    data.loanReceivables,
  ).regularTransactions.filter((item) => wanted.has(item.id));
  return transactions.length
    ? {
        profileId,
        transactions,
        originalOrder: data.transactions.map((item) => item.id),
      }
    : undefined;
}

export function applyTransactionDeletion(
  profiles: AppProfile[],
  deletion: TransactionDeletion,
): AppProfile[] {
  const ids = new Set(deletion.transactions.map((item) => item.id));
  return profiles.map((profile) =>
    profile.id === deletion.profileId
      ? {
          ...profile,
          data: {
            ...profile.data,
            transactions: profile.data.transactions.filter(
              (item) => !ids.has(item.id),
            ),
            trashedTransactions: [
              ...(profile.data.trashedTransactions ?? []).filter(entry => !ids.has(entry.transaction.id)),
              ...deletion.transactions.map((transaction) => ({
                transaction, deletedAt: Date.now(), originalOrder: deletion.originalOrder,
              })),
            ],
          },
        }
      : profile,
  );
}

/** Restore only the deleted rows, to their own profile, preserving later edits and additions. */
export function restoreTransactionDeletion(
  profiles: AppProfile[],
  deletion: TransactionDeletion,
): AppProfile[] {
  return profiles.map((profile) => {
    if (profile.id !== deletion.profileId) return profile;
    const existing = new Set(profile.data.transactions.map((item) => item.id));
    const missing = deletion.transactions.filter(
      (item) => !existing.has(item.id),
    );
    const trash = profile.data.trashedTransactions?.filter((entry) => !deletion.transactions.some((item) => item.id === entry.transaction.id));
    if (!missing.length && (!profile.data.trashedTransactions || trash?.length === profile.data.trashedTransactions.length)) return profile;
    const transactions = [...profile.data.transactions];
    for (const item of missing) {
      const originalIndex = deletion.originalOrder.indexOf(item.id);
      const nextId = deletion.originalOrder
        .slice(originalIndex + 1)
        .find((id) => transactions.some((row) => row.id === id));
      const insertion = nextId
        ? transactions.findIndex((row) => row.id === nextId)
        : transactions.length;
      transactions.splice(insertion, 0, item);
    }
    const { trashedTransactions: _priorTrash, ...restData } = profile.data;
    const nextData = { ...restData, transactions, ...(trash?.length ? { trashedTransactions: trash } : {}) };
    return { ...profile, data: nextData };
  });
}

/** Restore one deleted transaction after leaving and reopening the app. */
export function restoreTrashedTransaction(profiles: AppProfile[], profileId: string, transactionId: string): AppProfile[] {
  const profile = profiles.find(item => item.id === profileId);
  const trash = profile?.data.trashedTransactions?.find(item => item.transaction.id === transactionId);
  if (!trash) return profiles;
  return restoreTransactionDeletion(profiles, {
    profileId,
    transactions: [trash.transaction],
    originalOrder: trash.originalOrder,
  });
}
