import type { AppProfile, ProfileData } from "./app-store";
import type { Transaction } from "./mock-data";
import { selectTransactionLedgers } from "./transaction-ledgers";

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
    if (!missing.length) return profile;
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
    return { ...profile, data: { ...profile.data, transactions } };
  });
}
