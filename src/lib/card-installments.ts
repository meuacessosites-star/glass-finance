import type { AppCard } from "./app-store";
import type { Transaction } from "./mock-data";
import { getCurrentInstallment, getTransactionInvoiceSchedule, isInvoicePartPaid, localDateKey } from "./card-billing";

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
  const current = getCurrentInstallment(transaction);
  return getTransactionInvoiceSchedule(transaction, card).map((part) => {
    const { number, dueDate } = part;
    const paid = isInvoicePartPaid(transaction, card, part, today);
    const status: CardInstallment["status"] = paid ? "paid" : dueDate && dueDate < today ? "overdue" :
      number > current && dueDate && dueDate > today ? "scheduled" : "pending";
    return { ...part, isCurrent: number === current, status };
  });
}
