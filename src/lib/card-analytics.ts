import type { AppCard } from "./app-store";
import type { Transaction } from "./mock-data";
import { getInvoicePartsInPeriod, getTransactionInvoiceSchedule } from "./card-billing";
import { selectCardPurchases } from "./card-invoice-view";

export type CardAnalyticsScope = "invoice" | "history";
export function shiftInvoiceMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + offset, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getCardCategoryAnalytics(card: AppCard, transactions: Transaction[], categories: Record<string, { label: string; color: string }>, month: string, scope: CardAnalyticsScope) {
  const totals = new Map<string, number>();
  for (const row of selectCardPurchases(transactions).filter((item) => item.cardId === card.id)) {
    const cents = scope === "history" ? Math.round(Math.abs(row.amount) * 100)
      : getInvoicePartsInPeriod(row, card, month).reduce((sum, part) => sum + Math.round(part.amount * 100), 0);
    if (cents > 0) totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + cents);
  }
  const data = [...totals].map(([categoryId, cents]) => ({ categoryId, value: cents / 100,
    name: categories[categoryId]?.label ?? "Outros", color: categories[categoryId]?.color ?? "#8E8E93",
  })).sort((a, b) => b.value - a.value);
  return { data, total: [...totals.values()].reduce((sum, cents) => sum + cents, 0) / 100 };
}

/** Continuous months, including zeroes; future installments cannot hide recent history. */
export function getCardMonthlyAnalytics(card: AppCard, transactions: Transaction[], selectedMonth: string, mode: "history" | "forecast") {
  const totals = new Map<string, number>();
  for (const row of selectCardPurchases(transactions).filter((item) => item.cardId === card.id))
    for (const part of getTransactionInvoiceSchedule(row, card))
      totals.set(part.month, (totals.get(part.month) ?? 0) + Math.round(part.amount * 100));
  return Array.from({ length: 12 }, (_, index) => {
    const key = shiftInvoiceMonth(selectedMonth, mode === "history" ? index - 11 : index);
    return { key, value: (totals.get(key) ?? 0) / 100 };
  });
}

export const emptyCardStatementFilters = (scope: "month" | "all" = "month") => ({ query: "", category: "todas", scope });
