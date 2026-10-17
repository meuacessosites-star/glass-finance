import type { Transaction } from "@/lib/mock-data";
import type { AppCard, LoanReceivable } from "@/lib/app-store";
import { getCardBillingReminders, isCreditCardExpense, localDateKey } from "./card-billing";
import { getTransactionDueDate, getTransactionPaymentStatus } from "./transaction-status";
export { localDateKey } from "./card-billing";
export const isRegularCreditPurchase = isCreditCardExpense;
export type DueTodayAlert = { id: string; label: string; kind: "invoice" | "transaction" | "loan" };
export function getDueTodayAlerts(cards: AppCard[], transactions: Transaction[], loanReceivables: LoanReceivable[], now = new Date()): DueTodayAlert[] {
  const today = localDateKey(now);
  const alerts: DueTodayAlert[] = getCardBillingReminders(cards, transactions, now)
    .filter((item) => item.phase !== "upcoming")
    .map((item) => ({ id: `${item.id}-${item.phase}`, kind: "invoice", label: `${item.cardName}: ${item.phase === "closing" ? "fatura fecha hoje" : item.phase === "due" ? "fatura vence hoje" : "fatura em atraso"}` }));
  for (const transaction of transactions) {
    if (transaction.source === "loan" || isCreditCardExpense(transaction) || loanReceivables.some((item) => item.transactionId === transaction.id)) continue;
    const dueDate = getTransactionDueDate(transaction, cards, loanReceivables);
    const status = getTransactionPaymentStatus(transaction, cards, loanReceivables, today);
    if (!dueDate || dueDate > today || status === "paid") continue;
    alerts.push({ id: `transaction-${transaction.id}-${status}`, label: `${transaction.title}: ${status === "overdue" ? "conta vencida" : "transação pendente vence hoje"}`, kind: "transaction" });
  }
  for (const item of loanReceivables) {
    if (!item.dueDate || item.dueDate > today || item.status === "paid") continue;
    alerts.push({ id: `loan-${item.id}`, label: `${item.contact}: recebimento de empréstimo ${item.dueDate < today ? "vencido" : "vence hoje"}`, kind: "loan" });
  }
  return alerts;
}
