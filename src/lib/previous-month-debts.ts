import type { AppCard, LoanReceivable } from "./app-store";
import type { Transaction } from "./mock-data";
import { getCardBillingReminders, isCreditCardExpense, localDateKey, sanitizeInvoiceMonth, type CardBillingReminder } from "./card-billing";
import { selectTransactionLedgers } from "./transaction-ledgers";
import { getTransactionDueDate, getTransactionPaymentStatus, sanitizeDueDate } from "./transaction-status";

export type PreviousMonthDebt =
  | { kind: "transaction"; id: string; dueDate: string; amount: number; transaction: Transaction }
  | (CardBillingReminder & { kind: "invoice" });

/** Unpaid expenses carried from earlier due months, without moving their records. */
export function getPreviousMonthDebts(
  cards: AppCard[],
  transactions: Transaction[],
  receivables: LoanReceivable[] = [],
  today = localDateKey(),
  referenceMonth = today.slice(0, 7),
) {
  const validToday = sanitizeDueDate(today) ?? localDateKey();
  const month = sanitizeInvoiceMonth(referenceMonth) ?? validToday.slice(0, 7);
  const monthStart = `${month}-01`;
  const isPreviousDebt = (dueDate: string) => dueDate < monthStart && dueDate < validToday;
  const { regularTransactions } = selectTransactionLedgers(transactions, receivables);
  const items: PreviousMonthDebt[] = getCardBillingReminders(cards, regularTransactions, new Date(`${validToday}T12:00:00`))
    .filter((invoice) => isPreviousDebt(invoice.dueDate))
    .map((invoice) => ({ ...invoice, kind: "invoice" }));

  for (const transaction of regularTransactions) {
    // Credit purchases are counted once per invoice, using its remaining balance.
    if (transaction.amount >= 0 || isCreditCardExpense(transaction)) continue;
    if (getTransactionPaymentStatus(transaction, cards, receivables, validToday) === "paid") continue;
    const dueDate = getTransactionDueDate(transaction, cards, receivables);
    if (!dueDate || !isPreviousDebt(dueDate)) continue;
    items.push({ kind: "transaction", id: `previous-debt-${transaction.id}`, dueDate, amount: Math.abs(transaction.amount), transaction });
  }

  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const total = items.reduce((cents, item) => cents + Math.round(item.amount * 100), 0) / 100;
  return { month, items, total };
}
