import { budgets, type Transaction } from "./mock-data";
import { normalizeReportMonths } from "./report-view";
import { sanitizeDueDate } from "./transaction-status";

/** Missing = existing default; null = deliberately no spending limit. */
export type CategoryLimits = Record<string, number | null>;

export function parseCategoryMonthlyLimit(value: string): number | null {
  const input = value.trim();
  const brazilian = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(input);
  if (!brazilian && !/^\d+\.\d{1,2}$/.test(input)) return null;
  const amount = Number(
    brazilian ? input.replace(/\./g, "").replace(",", ".") : input,
  );
  const cents = Math.round(amount * 100);
  return Number.isFinite(cents) && cents > 0 ? cents / 100 : null;
}

export function sanitizeCategoryLimits(value: unknown): CategoryLimits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap<[string, number | null]>(([id, amount]) => {
      if (!id.trim()) return [];
      if (amount === null) return [[id, null]];
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
        return [];
      const rounded = Math.round(amount * 100) / 100;
      return rounded > 0 ? [[id, rounded]] : [];
    }),
  );
}

export function getCategoryMonthlyLimit(
  categoryId: string,
  settings: CategoryLimits,
): number | null {
  const saved = sanitizeCategoryLimits(settings);
  if (Object.prototype.hasOwnProperty.call(saved, categoryId))
    return saved[categoryId];
  return (
    budgets.find((budget) => budget.categoryId === categoryId)?.limit ?? null
  );
}

/** Return a new profile setting; never edit transactions or another profile. */
export function updateCategoryLimit(
  settings: CategoryLimits,
  categoryId: string,
  value: number | null,
): CategoryLimits {
  const valid = sanitizeCategoryLimits({ [categoryId]: value });
  return { ...sanitizeCategoryLimits(settings), ...valid };
}

/** Reference only: closed months with expenses in this category, before the
 * earliest selected month. Search and unfinished/future months cannot skew it. */
export function getCategoryHistoryReference(
  transactions: Transaction[],
  categoryId: string,
  selectedMonths: string[],
  currentMonth: string,
) {
  const selected = normalizeReportMonths(selectedMonths);
  const cutoff = selected.length ? [selected[0], currentMonth].sort()[0] : null;
  const totals = new Map<string, number>();
  for (const row of transactions) {
    if (
      !cutoff ||
      row.categoryId !== categoryId ||
      !Number.isFinite(row.amount) ||
      !sanitizeDueDate(row.date)
    )
      continue;
    const month = row.date.slice(0, 7);
    const cents = Math.round(row.amount * 100);
    if (month >= cutoff || cents >= 0) continue;
    totals.set(month, (totals.get(month) ?? 0) - cents);
  }
  const months = [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({ month, spent: cents / 100 }));
  const totalCents = [...totals.values()].reduce(
    (sum, cents) => sum + cents,
    0,
  );
  const averageCents = months.length
    ? Math.round(totalCents / months.length)
    : 0;
  return {
    months,
    total: totalCents / 100,
    monthlyAverage: averageCents / 100,
    periodReference: (averageCents * selected.length) / 100,
  };
}
