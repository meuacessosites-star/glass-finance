import type { AppNotification, ProfileData } from "./app-store";
import {
  getTransactionInvoiceSchedule,
  isCreditCardExpense,
  isInvoicePartPaid,
  localDateKey,
} from "./card-billing";
import {
  getCardInvoiceMetrics,
  selectCardPurchases,
} from "./card-invoice-view";
import { getBorrowedCardParts } from "./card-invoice-summary";

const cents = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
const reference = (note?: string) =>
  note?.match(/(?:^|\n)Referência:\s*([^\r\n]+)/)?.[1].trim();

/** Undo only the linked registration, including its loan installments and receipts. */
export function removeNotificationRegistration(
  data: ProfileData,
  notification: AppNotification,
  linked?: { kind: "loan" | "transaction"; id: string },
): ProfileData {
  const loanId =
    notification.loanId ??
    (linked?.kind === "loan"
      ? data.loanReceivables.find((row) => row.id === linked.id)?.loanId
      : undefined);
  const removedLoans = loanId
    ? data.loanReceivables.filter((row) => row.loanId === loanId)
    : [];
  const removedLoanIds = new Set(removedLoans.map((row) => row.id));
  const transactionIds = new Set<string>();
  if (linked?.kind === "transaction") transactionIds.add(linked.id);
  if (notification.transactionId)
    transactionIds.add(notification.transactionId);
  for (const row of removedLoans) {
    if (row.transactionId) transactionIds.add(row.transactionId);
    transactionIds.add(`loan-receivable-${row.id}`);
    for (const receipt of row.receipts ?? [])
      transactionIds.add(receipt.transactionId);
  }
  if (loanId)
    for (const row of data.transactions)
      if (
        reference(row.note) === loanId &&
        (row.source === "loan" ||
          row.operationType === "loan" ||
          row.operationType === "card")
      )
        transactionIds.add(row.id);
  const removed = data.transactions.filter((row) => transactionIds.has(row.id));
  if (!removed.length && !removedLoans.length) return data;
  const transactions = data.transactions.filter(
    (row) => !transactionIds.has(row.id),
  );
  const loanReceivables = data.loanReceivables.filter(
    (row) => !removedLoanIds.has(row.id),
  );
  const today = localDateKey();
  const cards = data.cards.map((card) => {
    const personal = removed.filter(
      (row) => row.cardId === card.id && isCreditCardExpense(row),
    );
    const borrowed = removedLoans.filter(
      (row) =>
        row.operationType === "card" &&
        row.cardId === card.id &&
        row.cardInvoiceMonth,
    );
    if (!personal.length && !borrowed.length) return card;
    const personalMonths = new Set(
      personal.flatMap((row) =>
        getTransactionInvoiceSchedule(row, card).map((part) => part.month),
      ),
    );
    const payments = { ...card.invoicePaymentsByMonth };
    const paidIds = { ...card.invoicePaidPurchaseIdsByMonth };
    const paidMonths = { ...card.invoicePaidByMonth };
    let invoicePaid = card.invoicePaid;
    for (const month of personalMonths) {
      const parts = personal.flatMap((row) =>
        getTransactionInvoiceSchedule(row, card)
          .filter((part) => part.month === month)
          .map((part) => ({ row, part })),
      );
      const removedAmount = parts.reduce(
        (sum, { part }) => sum + cents(part.amount),
        0,
      );
      const removedPaid = parts.reduce(
        (sum, { row, part }) =>
          sum +
          (isInvoicePartPaid(row, card, part, today) ? cents(part.amount) : 0),
        0,
      );
      const before = getCardInvoiceMetrics(
        card,
        data.transactions,
        month,
        today,
      );
      const remaining = selectCardPurchases(transactions)
        .filter((row) => row.cardId === card.id)
        .flatMap((row) =>
          getTransactionInvoiceSchedule(row, card)
            .filter((part) => part.month === month)
            .map((part) => ({ row, part })),
        );
      const gross = remaining.reduce(
        (sum, { part }) => sum + cents(part.amount),
        0,
      );
      const total =
        card.invoiceOverrideByMonth?.[month] !== undefined
          ? cents(card.invoiceOverrideByMonth[month])
          : Math.max(gross, cents(before.invoiceTotal) - removedAmount);
      const individuallyPaid = remaining.reduce(
        (sum, { row, part }) =>
          sum +
          (isInvoicePartPaid(row, card, part, today) ? cents(part.amount) : 0),
        0,
      );
      const paid = Math.min(
        total,
        Math.max(individuallyPaid, cents(before.paidAmount) - removedPaid),
      );
      if (total > 0 && (payments[month] || paid > 0))
        payments[month] = {
          ...payments[month],
          totalAmount: total / 100,
          paidAmount: paid / 100,
          paymentDate: payments[month]?.paymentDate ?? today,
        };
      else delete payments[month];
      paidIds[month] = remaining
        .filter(({ row, part }) => isInvoicePartPaid(row, card, part, today))
        .map(({ row }) => row.id);
      paidMonths[month] = total > 0 && paid >= total;
      if (month === today.slice(0, 7)) invoicePaid = paidMonths[month];
    }
    const borrowedPayments = { ...card.borrowedInvoicePaymentsByMonth };
    for (const month of new Set(borrowed.map((row) => row.cardInvoiceMonth!))) {
      const old = borrowedPayments[month];
      if (!old) continue;
      const removedAmount = borrowed
        .filter((row) => row.cardInvoiceMonth === month)
        .reduce((sum, row) => sum + cents(row.amount), 0);
      const remaining = getBorrowedCardParts(card, loanReceivables)
        .filter((row) => row.cardInvoiceMonth === month)
        .reduce((sum, row) => sum + cents(row.amount), 0);
      const total = Math.max(remaining, cents(old.totalAmount) - removedAmount);
      if (total)
        borrowedPayments[month] = {
          ...old,
          totalAmount: total / 100,
          paidAmount: Math.min(total, cents(old.paidAmount)) / 100,
        };
      else delete borrowedPayments[month];
    }
    return {
      ...card,
      invoicePaymentsByMonth: payments,
      invoicePaidPurchaseIdsByMonth: paidIds,
      invoicePaidByMonth: paidMonths,
      invoicePaid,
      borrowedInvoicePaymentsByMonth: borrowedPayments,
    };
  });
  return { ...data, transactions, loanReceivables, cards };
}
