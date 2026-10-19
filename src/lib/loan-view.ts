import type { LoanReceivable } from "./app-store";
import {
  getLoanOutstandingAmount,
  getLoanRepaymentStatus,
  isFreeLoan,
  selectLoanReceivablesForMonth,
} from "./loan-repayments";
import { normalizeSearchText } from "./transaction-view";
import { sanitizeDueDate } from "./transaction-status";
import { needsCardLoanInvoice } from "./card-loans";
import type { Transaction } from "./mock-data";

/** Legacy files may live on the linked statement; an explicit empty list stays empty. */
export function getLoanAttachments(
  item: LoanReceivable,
  transactions: Transaction[],
): string[] {
  if (item.attachments !== undefined) return item.attachments;
  const linked = transactions.find((row) => row.id === item.transactionId);
  const belongsToLoan = (row: Transaction) =>
    row.source === "loan" &&
    Boolean(
      row.note
        ?.split("\n")
        .some((line) => line.trim() === `Referência: ${item.loanId}`),
    );
  const original = transactions.find(
    (row) => row.amount < 0 && belongsToLoan(row),
  );
  const related = transactions.find(
    (row) => belongsToLoan(row) && row.attachments !== undefined,
  );
  return (
    linked?.attachments ?? original?.attachments ?? related?.attachments ?? []
  );
}

export type LoanModeFilter =
  | "all"
  | "fixed"
  | "free-installments"
  | "free-flexible";
export type LoanViewFilters = {
  selectedMonth: string;
  selectedMonths: string[];
  fromDate?: string | null;
  untilDate?: string | null;
  scope: "period" | "all";
  tab: "dinheiro" | "cartao";
  status: "all" | "pending" | "paid" | "overdue";
  mode: LoanModeFilter;
  query: string;
};

function matchesLoanRange(
  item: LoanReceivable,
  from: string,
  until: string,
): boolean {
  const inRange = (date?: string) =>
    Boolean(date && date >= from && date <= until);
  if (!isFreeLoan(item))
    return (
      inRange(item.dueDate ?? item.startDate ?? item.createdAt) ||
      inRange(item.paymentDate) ||
      Boolean(item.receipts?.some((receipt) => inRange(receipt.date)))
    );
  const start = item.startDate ?? item.createdAt;
  const end =
    item.status === "paid" ? (item.paymentDate ?? item.createdAt) : undefined;
  return start <= until && (!end || end >= from);
}

/** Period, text and mode filters narrow the same rows used for totals and badges. */
export function selectLoanView<T extends LoanReceivable>(
  items: T[],
  filters: LoanViewFilters,
  today: string,
): T[] {
  let periodIds: Set<string> | undefined;
  if (filters.scope !== "all") {
    if (filters.fromDate || filters.untilDate) {
      const from = sanitizeDueDate(filters.fromDate);
      const until = sanitizeDueDate(filters.untilDate ?? filters.fromDate);
      if (!from || !until || until < from) return [];
      periodIds = new Set(
        items
          .filter((item) => matchesLoanRange(item, from, until))
          .map((item) => item.id),
      );
    } else {
      const months = filters.selectedMonths.length
        ? filters.selectedMonths
        : [filters.selectedMonth];
      periodIds = new Set(
        months
          .flatMap((month) => selectLoanReceivablesForMonth(items, month))
          .map((item) => item.id),
      );
    }
  }
  const query = normalizeSearchText(filters.query.trim());
  return items
    .filter((item) => {
      if (periodIds && !periodIds.has(item.id)) return false;
      if (
        filters.tab === "cartao"
          ? item.operationType !== "card"
          : item.operationType === "card"
      )
        return false;
      const status = getLoanRepaymentStatus(item, today);
      if (filters.status === "pending" && status === "paid") return false;
      if (filters.status === "paid" && status !== "paid") return false;
      if (filters.status === "overdue" && status !== "overdue") return false;
      const free = isFreeLoan(item);
      if (filters.mode === "fixed" && free) return false;
      if (
        filters.mode === "free-installments" &&
        (!free || item.freePaymentMode !== "installments")
      )
        return false;
      if (
        filters.mode === "free-flexible" &&
        (!free || item.freePaymentMode === "installments")
      )
        return false;
      return (
        !query ||
        normalizeSearchText(
          `${item.contact} ${item.description ?? ""} ${item.note ?? ""}`,
        ).includes(query)
      );
    })
    .sort((a, b) =>
      (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt),
    );
}

/** Summarize the visible loans, counting receipts only on their actual dates. */
export function getLoanViewSummary(
  rows: LoanReceivable[],
  filters: LoanViewFilters,
): { outstanding: number; received: number } {
  const matchesReceiptPeriod = (date?: string) => {
    if (filters.scope === "all") return true;
    const actual = sanitizeDueDate(date);
    if (!actual) return false;
    if (filters.fromDate || filters.untilDate) {
      const from = sanitizeDueDate(filters.fromDate);
      const until = sanitizeDueDate(filters.untilDate ?? filters.fromDate);
      return Boolean(
        from && until && from <= until && actual >= from && actual <= until,
      );
    }
    const months = filters.selectedMonths.length
      ? filters.selectedMonths
      : [filters.selectedMonth];
    return months.includes(actual.slice(0, 7));
  };
  let outstandingCents = 0;
  let receivedCents = 0;
  for (const item of rows) {
    outstandingCents += Math.round(getLoanOutstandingAmount(item) * 100);
    let uncountedCents = Math.round(item.amount * 100);
    for (const receipt of item.receipts ?? []) {
      const cents = Math.min(
        uncountedCents,
        Math.max(0, Math.round(receipt.amount * 100)),
      );
      if (matchesReceiptPeriod(receipt.date)) receivedCents += cents;
      uncountedCents -= cents;
    }
    // Older completed records may store only a payment date, without receipt rows.
    if (item.status === "paid" && matchesReceiptPeriod(item.paymentDate))
      receivedCents += uncountedCents;
  }
  return { outstanding: outstandingCents / 100, received: receivedCents / 100 };
}

export function getLoanMonthOptions(
  items: LoanReceivable[],
  currentMonth: string,
  selectedMonth: string,
): string[] {
  const months = [
    currentMonth,
    selectedMonth,
    ...items
      .flatMap((item) => [
        item.startDate,
        item.createdAt,
        item.dueDate,
        item.paymentDate,
        ...(item.receipts ?? []).map((receipt) => receipt.date),
      ])
      .filter((date): date is string => Boolean(date))
      .map((date) => date.slice(0, 7)),
  ]
    .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .sort();
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return [];
  const [firstYear, firstMonth] = first.split("-").map(Number);
  const [lastYear, lastMonth] = last.split("-").map(Number);
  const count = (lastYear - firstYear) * 12 + lastMonth - firstMonth + 1;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(firstYear, firstMonth - 1 + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }).reverse();
}

/** Keep a newly linked purchase visible without changing its saved invoice dates. */
export function getLoanViewAfterInvoiceLink(
  item: LoanReceivable,
  filters: LoanViewFilters,
  today: string,
): LoanViewFilters {
  const dueDate = sanitizeDueDate(item.dueDate);
  if (
    item.operationType !== "card" ||
    needsCardLoanInvoice(item) ||
    !dueDate ||
    selectLoanView([item], filters, today).length
  )
    return filters;
  return {
    ...filters,
    selectedMonth: dueDate.slice(0, 7),
    selectedMonths: [],
    fromDate: null,
    untilDate: null,
    scope: "period",
    tab: "cartao",
    status: "all",
    mode: "all",
    query: "",
  };
}
