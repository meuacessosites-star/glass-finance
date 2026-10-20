import type { AppCard, LoanReceivable } from "./app-store";
import type { Transaction } from "./mock-data";
import {
  getInvoiceDates,
  isCreditCardExpense,
  localDateKey,
} from "./card-billing";
import {
  getScopedInvoiceMetrics,
  getScopedInvoiceMonths,
} from "./card-invoice-summary";
import {
  getTransactionDueDate,
  getTransactionPaymentStatus,
} from "./transaction-status";
import { selectTransactionLedgers } from "./transaction-ledgers";
import { getLoanOutstandingAmount } from "./loan-repayments";

export type PaymentNotification = {
  id: string;
  kind: "invoice" | "transaction" | "loan";
  title: string;
  date: string;
  amount: number;
  receiving?: boolean;
  phase: "overdue" | "today" | "closing" | "upcoming";
  event?: "closing" | "due";
  cardId?: string;
  invoiceMonth?: string;
  transactionId?: string;
  receivableId?: string;
};

/** Reading dismisses a message, never the underlying payment. A new phase/date is a new notice. */
export function getPaymentNotifications(
  {
    cards,
    transactions,
    loanReceivables,
    readPaymentNotificationIds = [],
    includeBorrowedCardInvoices = false,
  }: {
    cards: AppCard[];
    transactions: Transaction[];
    loanReceivables: LoanReceivable[];
    readPaymentNotificationIds?: string[];
    includeBorrowedCardInvoices?: boolean;
  },
  today = localDateKey(),
  daysAhead = 7,
): PaymentNotification[] {
  const until = new Date(`${today}T12:00:00`);
  until.setDate(until.getDate() + daysAhead);
  const horizon = localDateKey(until);
  const read = new Set(readPaymentNotificationIds);
  const result: PaymentNotification[] = [];
  for (const card of cards.filter((item) => !item.archived)) {
    for (const month of getScopedInvoiceMonths(
      [card],
      transactions,
      loanReceivables,
      includeBorrowedCardInvoices,
    )) {
      const dates = getInvoiceDates(card, month);
      if (!dates) continue;
      const metrics = getScopedInvoiceMetrics(
        card,
        transactions,
        loanReceivables,
        month,
        includeBorrowedCardInvoices,
        today,
      );
      if (metrics.openAmount <= 0) continue;
      const phase =
        dates.dueDate < today
          ? "overdue"
          : dates.dueDate === today
            ? "today"
            : dates.closingDate === today
              ? "closing"
              : "upcoming";
      const event =
        phase === "closing" ||
        (phase === "upcoming" &&
          dates.closingDate >= today &&
          dates.closingDate <= horizon)
          ? "closing"
          : "due";
      const date = event === "closing" ? dates.closingDate : dates.dueDate;
      if (phase === "upcoming" && date > horizon) continue;
      result.push({
        id: `invoice:${card.id}:${month}:${event}:${phase}:${date}`,
        kind: "invoice",
        title: `${card.name} ····${card.last4}`,
        date,
        phase,
        event,
        amount: metrics.openAmount,
        cardId: card.id,
        invoiceMonth: month,
      });
    }
  }
  const regular = selectTransactionLedgers(
    transactions,
    loanReceivables,
  ).regularTransactions;
  for (const row of regular) {
    if (isCreditCardExpense(row)) continue;
    const due = getTransactionDueDate(row, cards, loanReceivables);
    if (
      !due ||
      due > horizon ||
      getTransactionPaymentStatus(row, cards, loanReceivables, today) === "paid"
    )
      continue;
    const phase =
      due < today ? "overdue" : due === today ? "today" : "upcoming";
    result.push({
      id: `transaction:${row.id}:${due}:${phase}`,
      kind: "transaction",
      title: row.title,
      date: due,
      phase,
      amount: Math.abs(row.amount),
      receiving: row.amount > 0,
      transactionId: row.id,
    });
  }
  for (const row of loanReceivables) {
    if (!row.dueDate || row.dueDate > horizon || row.status === "paid")
      continue;
    const amount = getLoanOutstandingAmount(row);
    if (amount <= 0) continue;
    const phase =
      row.dueDate < today
        ? "overdue"
        : row.dueDate === today
          ? "today"
          : "upcoming";
    result.push({
      id: `loan:${row.id}:${row.dueDate}:${phase}`,
      kind: "loan",
      title: `Receber de ${row.contact}`,
      date: row.dueDate,
      phase,
      amount,
      receiving: true,
      receivableId: row.id,
      cardId: row.cardId,
      invoiceMonth: row.cardInvoiceMonth,
    });
  }
  return result
    .filter((item) => !read.has(item.id))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "pt-BR"),
    );
}
