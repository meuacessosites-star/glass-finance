import type { Transaction } from "./mock-data";
import { monthShortLabel } from "./mock-data";
import { shiftBalanceMonth } from "./home-balance";
import { sanitizeDueDate } from "./transaction-status";
import { normalizeSearchText } from "./transaction-view";

type ReportCategory = { label: string; color: string };

/** Search only the expenses already selected by the category/period report. */
export function searchReportCategoryExpenses(
  transactions: Transaction[],
  search: string,
) {
  const query = normalizeSearchText(search.trim());
  const list = transactions.filter(
    (row) =>
      !query ||
      normalizeSearchText(`${row.title} ${row.note ?? ""}`).includes(query),
  );
  return {
    list,
    total:
      list.reduce((cents, row) => cents - Math.round(row.amount * 100), 0) /
      100,
  };
}

export function normalizeReportMonths(value: string | string[]): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [value]).filter((month) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
      ),
    ),
  ].sort();
}

/** Monthly allowances are summed once per selected month, including empty ones. */
export function getReportPeriodLimit(
  monthlyLimit: number,
  months: string | string[],
): number {
  if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) return 0;
  return (
    (Math.round(monthlyLimit * 100) * normalizeReportMonths(months).length) /
    100
  );
}

/** All report panels read the same months, search and active-profile rows. */
export function getReportView(
  transactions: Transaction[],
  categories: Record<string, ReportCategory>,
  selectedMonths: string | string[],
  search: string,
) {
  const query = normalizeSearchText(search.trim());
  const months = normalizeReportMonths(selectedMonths);
  const monthSet = new Set(months);
  const matching = transactions.filter(
    (row) =>
      months.length > 0 &&
      Number.isFinite(row.amount) &&
      Boolean(sanitizeDueDate(row.date)) &&
      (!query ||
        normalizeSearchText(
          `${row.title} ${row.note ?? ""} ${categories[row.categoryId]?.label ?? "Outros"}`,
        ).includes(query)),
  );
  const list = matching.filter((row) => monthSet.has(row.date.slice(0, 7)));
  const expenseByCategory = new Map<string, number>();
  let incomeCents = 0;
  for (const row of list) {
    const cents = Math.round(row.amount * 100);
    if (cents > 0) incomeCents += cents;
    else if (cents < 0)
      expenseByCategory.set(
        row.categoryId,
        (expenseByCategory.get(row.categoryId) ?? 0) - cents,
      );
  }
  const byCategory = [...expenseByCategory]
    .map(([categoryId, cents]) => ({
      categoryId,
      name: categories[categoryId]?.label ?? "Outros",
      color: categories[categoryId]?.color ?? "#8E8E93",
      value: cents / 100,
    }))
    .sort((a, b) => b.value - a.value);
  const seriesMonths =
    months.length > 1
      ? months
      : months.length === 1
        ? Array.from({ length: 6 }, (_, index) =>
            shiftBalanceMonth(months[0], index - 5),
          )
        : [];
  const series = seriesMonths.map((key) => {
    let income = 0;
    let expense = 0;
    for (const row of matching) {
      if (row.date.slice(0, 7) !== key) continue;
      const cents = Math.round(row.amount * 100);
      if (cents > 0) income += cents;
      else expense -= cents;
    }
    return {
      monthKey: key,
      month: `${monthShortLabel(key).slice(0, 3)} ${key.slice(2, 4)}`,
      income: income / 100,
      expense: expense / 100,
    };
  });
  return {
    months,
    list,
    byCategory,
    series,
    totalIncome: incomeCents / 100,
    totalExpense:
      [...expenseByCategory.values()].reduce((sum, cents) => sum + cents, 0) /
      100,
    matchedCategoryIds: [...new Set(list.map((row) => row.categoryId))],
  };
}

/** A category drill-down contains exactly the expenses included in its card. */
export function getReportCategoryDetails(
  report: ReturnType<typeof getReportView>,
  categoryId: string,
  monthlyLimit: number | null,
) {
  const transactions = report.list
    .filter(
      (row) =>
        row.categoryId === categoryId && Math.round(row.amount * 100) < 0,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const spentCents = transactions.reduce(
    (sum, row) => sum - Math.round(row.amount * 100),
    0,
  );
  const hasLimit =
    monthlyLimit !== null && Number.isFinite(monthlyLimit) && monthlyLimit > 0;
  const limit = hasLimit
    ? getReportPeriodLimit(monthlyLimit, report.months)
    : 0;
  const limitCents = Math.round(limit * 100);
  return {
    transactions,
    months: report.months,
    hasLimit,
    monthlyLimit,
    used: spentCents / 100,
    limit,
    remaining: Math.max(0, limitCents - spentCents) / 100,
    overage: hasLimit ? Math.max(0, spentCents - limitCents) / 100 : 0,
    percentage: limitCents > 0 ? (spentCents / limitCents) * 100 : 0,
  };
}
