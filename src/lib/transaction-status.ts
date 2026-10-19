import type { AppCard, LoanReceivable } from "./app-store";
import type { Transaction } from "./mock-data";
import { getCurrentInvoiceMonth, getInvoiceDates, isCreditCardExpense, isInvoiceMarkedPaid, localDateKey } from "./card-billing";

export type TransactionPaymentStatus = "paid" | "pending" | "overdue";
export type PaymentStatusFilter = "all" | TransactionPaymentStatus;

export function sanitizeDueDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day, 12)) === value ? value : undefined;
}

function linkedReceivable(transaction: Transaction, receivables: LoanReceivable[]) {
  return receivables.find((item) => item.transactionId === transaction.id || `loan-receivable-${item.id}` === transaction.id);
}

export function getTransactionDueDate(transaction: Transaction, cards: AppCard[], receivables: LoanReceivable[] = []): string | undefined {
  const receivable = linkedReceivable(transaction, receivables);
  if (receivable) return sanitizeDueDate(receivable.dueDate);
  if (transaction.source === "loan") return undefined;
  if (isCreditCardExpense(transaction)) {
    const card = cards.find((item) => item.id === transaction.cardId);
    return card ? getInvoiceDates(card, getCurrentInvoiceMonth(transaction, card))?.dueDate : undefined;
  }
  // Older entries used their only date as the bill's due date.
  return sanitizeDueDate(transaction.dueDate) ?? sanitizeDueDate(transaction.date);
}

export function getTransactionPaymentStatus(transaction: Transaction, cards: AppCard[], receivables: LoanReceivable[] = [], today = localDateKey()): TransactionPaymentStatus {
  const receivable = linkedReceivable(transaction, receivables);
  if (receivable?.status === "paid") return "paid";
  if (!receivable) {
    const card = isCreditCardExpense(transaction) ? cards.find((item) => item.id === transaction.cardId) : undefined;
    const month = getCurrentInvoiceMonth(transaction, card);
    if (card && (isInvoiceMarkedPaid(card, month, today.slice(0, 7)) || card.invoicePaidPurchaseIdsByMonth?.[month]?.includes(transaction.id))) return "paid";
    if (transaction.paymentStatus === "paid" || (!isCreditCardExpense(transaction) && transaction.paymentStatus !== "pending")) return "paid";
  }
  const dueDate = getTransactionDueDate(transaction, cards, receivables);
  return dueDate && dueDate < today ? "overdue" : "pending";
}

export function matchesPaymentStatusFilter(status: TransactionPaymentStatus, filter: PaymentStatusFilter): boolean {
  return filter === "all" || (filter === "pending" ? status !== "paid" : status === filter);
}
