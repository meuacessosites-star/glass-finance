import { removeNotificationRegistration } from "./notification-redo";
import {
  isNotificationExpired,
  sanitizeNotificationRetention,
  ignoredCountToday,
} from "./notification-history";
import type {
  AppNotification,
  LoanCreationInput,
  ProfileData,
} from "./app-store";
import type { Transaction } from "./mock-data";
import {
  localDateKey,
  isCreditCardExpense,
  sanitizeInvoiceMonth,
  getCardBillingChoices,
  getCardBillingCycle,
} from "./card-billing";
import { openUnpaidPurchaseInvoices } from "./payment-updates";
import { createLoanRecordData } from "./loan-creation";
import { sanitizeDueDate } from "./transaction-status";

export type NotificationTransactionInput = Omit<Transaction, "id">;
export function notificationRecord(
  data: Pick<ProfileData, "transactions" | "loanReceivables">,
  n: AppNotification,
) {
  const loan = data.loanReceivables.find(
    (item) =>
      item.id === n.receivableId || (n.loanId && item.loanId === n.loanId),
  );
  if (loan) return { kind: "loan" as const, id: loan.id };
  const transaction = data.transactions.find(
    (item) => item.id === n.transactionId && item.source !== "loan",
  );
  if (transaction) return { kind: "transaction" as const, id: transaction.id };
  if (n.status === "approved" || n.recordKind === "legacy") {
    const old = data.transactions.find(
      (item) =>
        item.source !== "loan" &&
        item.title === n.merchant &&
        item.date === n.date &&
        Math.round(Math.abs(item.amount) * 100) ===
          Math.round(n.amount * 100) &&
        item.note === `Aprovado da notificação do ${n.bank}`,
    );
    if (old) return { kind: "transaction" as const, id: old.id };
  }
  return undefined;
}

export function approveNotificationData(
  data: ProfileData,
  id: string,
  input: NotificationTransactionInput | undefined,
  makeId: (prefix: string) => string,
): ProfileData {
  const n = data.notifications.find(
    (item) => item.id === id && item.status === "pending",
  );
  if (
    !n ||
    isNotificationExpired(
      n,
      sanitizeNotificationRetention(data.notificationRetentionDays),
    )
  )
    return data;
  const existing = notificationRecord(data, n);
  // Restored approvals keep their financial record. Confirming never inserts it twice.
  if (existing || n.recordKind)
    return {
      ...data,
      notifications: data.notifications.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "approved",
              approvedAt: item.approvedAt ?? new Date().toISOString(),
              recordKind: existing?.kind ?? item.recordKind ?? "legacy",
              transactionId:
                existing?.kind === "transaction"
                  ? existing.id
                  : item.transactionId,
              receivableId:
                existing?.kind === "loan" ? existing.id : item.receivableId,
            }
          : item,
      ),
    };
  if (
    !input ||
    !input.title.trim() ||
    !Number.isFinite(input.amount) ||
    !input.amount ||
    !sanitizeDueDate(input.date) ||
    !data.categories.some((item) => item.id === input.categoryId)
  )
    return data;
  if (
    input.cardId &&
    !data.cards.some((card) => card.id === input.cardId && !card.archived)
  )
    return data;
  const credit =
    input.amount < 0 &&
    (input.paymentMethod === "credito" ||
      (input.paymentMethod === "cartao" && input.cardMode === "credito"));
  const card = data.cards.find((row) => row.id === input.cardId);
  // Before closing the regular form uses the automatic cycle; after closing
  // it asks the user to choose a month explicitly.
  const invoiceMonth =
    credit && card
      ? (sanitizeInvoiceMonth(input.cardInvoiceMonth) ??
        (!input.cardInvoiceMonth && !getCardBillingChoices(card, input.date)
          ? getCardBillingCycle(card, input.date)?.month
          : undefined))
      : undefined;
  if (credit && !invoiceMonth) return data;
  const paymentStatus =
    input.paymentStatus ?? (isCreditCardExpense(input) ? "pending" : "paid");
  const transaction: Transaction = {
    ...input,
    id: makeId("t"),
    ...(credit ? { cardInvoiceMonth: invoiceMonth } : {}),
    paymentStatus,
    paymentDate:
      paymentStatus === "paid"
        ? (input.paymentDate ?? localDateKey())
        : undefined,
    showPaymentDateOnCard: input.showPaymentDateOnCard ?? true,
    cardDisplayMode: input.cardDisplayMode ?? "last4",
  };
  return {
    ...openUnpaidPurchaseInvoices(data, transaction),
    transactions: [transaction, ...data.transactions],
    notifications: data.notifications.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "approved",
            approvedAt: item.approvedAt ?? new Date().toISOString(),
            recordKind: "transaction",
            transactionId: transaction.id,
          }
        : item,
    ),
  };
}

export function approveLoanNotificationData(
  data: ProfileData,
  id: string,
  input: LoanCreationInput,
  makeId: (prefix: string) => string,
): ProfileData {
  const n = data.notifications.find(
    (item) => item.id === id && item.status === "pending",
  );
  if (
    !n ||
    isNotificationExpired(
      n,
      sanitizeNotificationRetention(data.notificationRetentionDays),
    )
  )
    return data;
  if (notificationRecord(data, n) || n.recordKind)
    return approveNotificationData(data, id, undefined, makeId);
  if (!data.categories.some((item) => item.id === input.categoryId))
    return data;
  if (
    input.operationType === "card" &&
    !data.cards.some((card) => card.id === input.cardId && !card.archived)
  )
    return data;
  if (
    !input.contact.trim() ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    !sanitizeDueDate(input.date) ||
    input.date > localDateKey()
  )
    return data;
  if (
    input.collectionMode === "fixed" &&
    input.operationType !== "card" &&
    (!input.receivables?.length ||
      input.receivables.some(
        (part) =>
          !sanitizeDueDate(part.dueDate) ||
          !Number.isFinite(part.amount) ||
          part.amount <= 0,
      ) ||
      Math.round(
        input.receivables.reduce((sum, part) => sum + part.amount, 0) * 100,
      ) !== Math.round(input.amount * 100))
  )
    return data;
  const next = createLoanRecordData(data, input, makeId);
  if (next === data || !next.loanReceivables[0]) return data;
  const item = next.loanReceivables[0];
  return {
    ...next,
    notifications: data.notifications.map((row) =>
      row.id === id
        ? {
            ...row,
            status: "approved",
            approvedAt: row.approvedAt ?? new Date().toISOString(),
            recordKind: "loan",
            receivableId: item.id,
            loanId: item.loanId,
          }
        : row,
    ),
  };
}

export function ignoreNotificationsData(
  data: ProfileData,
  ids: readonly string[],
  today = localDateKey(),
): ProfileData {
  const selected = new Set(ids);
  const removed = data.notifications.filter((item) => selected.has(item.id));
  if (!removed.length) return data;
  return {
    ...data,
    notifications: data.notifications.filter((item) => !selected.has(item.id)),
    ignoredNotificationDate: today,
    ignoredNotificationCount: ignoredCountToday(data, today) + removed.length,
  };
}

/** Refazer returns the original message to pending and removes its saved registration. */
export function restoreNotificationsData(
  data: ProfileData,
  ids: readonly string[],
): ProfileData {
  let next = data;
  for (const id of new Set(ids)) {
    const item = next.notifications.find(
      (row) => row.id === id && row.status === "approved",
    );
    if (
      !item ||
      isNotificationExpired(
        item,
        sanitizeNotificationRetention(next.notificationRetentionDays),
      )
    )
      continue;
    next = removeNotificationRegistration(
      next,
      item,
      notificationRecord(next, item),
    );
    next = {
      ...next,
      notifications: next.notifications.map((row) =>
        row.id === id
          ? {
              ...row,
              status: "pending",
              approvedAt: undefined,
              recordKind: undefined,
              transactionId: undefined,
              receivableId: undefined,
              loanId: undefined,
            }
          : row,
      ),
    };
  }
  return next;
}

export function sanitizeReadNotificationIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0 && item.length < 300,
          ),
        ),
      ].slice(-5000)
    : [];
}
export function readPaymentNotificationsData(
  data: ProfileData,
  ids: readonly string[],
): ProfileData {
  return {
    ...data,
    readPaymentNotificationIds: sanitizeReadNotificationIds([
      ...(data.readPaymentNotificationIds ?? []),
      ...ids,
    ]),
  };
}
