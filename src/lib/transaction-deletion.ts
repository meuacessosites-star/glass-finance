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
            transactions: profile.data.transactions
              .filter((item) => !ids.has(item.id))
              .map((item) => {
                if (item.recurrence !== "recorrente" || item.recurrenceSourceId) return item;
                // A deleted instance must not reappear when a later month is
                // opened. Persist its date on the originating series.
                const deletedDates = deletion.transactions
                  .filter((row) => row.recurrenceSourceId === item.id)
                  .map((row) => {
                    const prefix = `recurrence:${item.id}:`;
                    // Preserve the scheduled date even after moving one entry.
                    return row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.date;
                  });
                if (!deletedDates.length) return item;
                return {
                  ...item,
                  recurrenceSkippedDates: [...new Set([...(item.recurrenceSkippedDates ?? []), ...deletedDates])],
                };
              }),
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
    // Undo also clears skipped dates so the original recurrence remains
    // consistent if the restored instance is deleted or edited later.
    const restoredDates = new Map<string, Set<string>>();
    for (const row of deletion.transactions) {
      if (!row.recurrenceSourceId) continue;
      const dates = restoredDates.get(row.recurrenceSourceId) ?? new Set<string>();
      const prefix = `recurrence:${row.recurrenceSourceId}:`;
      dates.add(row.id.startsWith(prefix) ? row.id.slice(prefix.length) : row.date);
      restoredDates.set(row.recurrenceSourceId, dates);
    }
    const restored = transactions.map((row) => {
      const restoredFor = restoredDates.get(row.id);
      if (!restoredFor || !row.recurrenceSkippedDates?.length) return row;
      return { ...row, recurrenceSkippedDates: row.recurrenceSkippedDates.filter((date) => !restoredFor.has(date)) };
    });
    const nextData = { ...restData, transactions: restored, ...(trash?.length ? { trashedTransactions: trash } : {}) };
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
