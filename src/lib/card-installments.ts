import type { AppCard } from "./app-store";
import type { Transaction } from "./mock-data";
import { calendarDate, getInvoiceDates, getTransactionBillingCycle, isInvoiceMarkedPaid, localDateKey } from "./card-billing";

export type CardInstallment = {
  number: number;
  total: number;
  amount: number;
  month?: string;
  dueDate?: string;
  isCurrent: boolean;
  status: "paid" | "pending" | "overdue" | "scheduled";
};

export function getCardInstallmentHistory(transaction: Transaction, card?: AppCard, today = localDateKey()): CardInstallment[] {
  const creditPurchase = transaction.amount < 0 && transaction.source !== "loan" &&
    (transaction.paymentMethod === "cartao" || transaction.paymentMethod === "credito") &&
    (transaction.cardMode === "credito" || transaction.paymentMethod === "credito");
  if (!creditPurchase) return [];
  const count = transaction.recurrence === "parcelada" && Number.isFinite(transaction.installments)
    ? Math.min(48, Math.max(1, Math.round(transaction.installments!))) : 1;
  const current = Number.isFinite(transaction.currentInstallment)
    ? Math.min(count, Math.max(1, Math.round(transaction.currentInstallment!))) : 1;
  const totalCents = Math.round(Math.abs(transaction.amount) * 100);
  const cents = Math.floor(totalCents / count), remainder = totalCents % count;
  const firstCycle = card ? getTransactionBillingCycle(transaction, card) : null;
  const [year, monthNumber] = firstCycle?.month.split("-").map(Number) ?? [];

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const month = firstCycle ? calendarDate(year, monthNumber - 1 + index, 1).slice(0, 7) : undefined;
    const dueDate = card && month ? getInvoiceDates(card, month)?.dueDate : undefined;
    const paid = Boolean(card && month && isInvoiceMarkedPaid(card, month, today.slice(0, 7))) ||
      (number === current && transaction.paymentStatus === "paid");
    const status: CardInstallment["status"] = paid ? "paid" : dueDate && dueDate < today ? "overdue" :
      number > current && dueDate && dueDate > today ? "scheduled" : "pending";
    return { number, total: count, amount: (cents + (index < remainder ? 1 : 0)) / 100, month, dueDate, isCurrent: number === current, status };
  });
}
