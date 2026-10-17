import type { Transaction } from "./mock-data";

type PaymentStatus = "paid" | "pending" | "overdue";
export type TransactionViewFilters = {
  scope: "month" | "all";
  selectedMonth: string;
  selectedMonths: string[];
  fromDate?: string | null;
  untilDate?: string | null;
  paymentStatus: "all" | PaymentStatus;
  selectedCategories: string[];
  searchQuery: string;
};

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function transactionInPeriod(transaction: Transaction, selectedMonth: string, untilDate?: string | null, fromDate?: string | null): boolean {
  const [year, month] = selectedMonth.split("-").map(Number);
  const startDate = fromDate ?? `${selectedMonth}-01`;
  const defaultEnd = `${selectedMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const endDate = untilDate && untilDate >= startDate ? untilDate : defaultEnd;
  return transaction.date >= startDate && transaction.date <= endDate;
}

export function selectTransactionView<T extends Transaction>(transactions: T[], filters: TransactionViewFilters, statusFor: (transaction: T) => PaymentStatus): T[] {
  const query = normalizeSearchText(filters.searchQuery.trim());
  return transactions
    .filter((transaction) => filters.scope === "all" || (filters.selectedMonths.length
      ? filters.selectedMonths.includes(transaction.date.slice(0, 7))
      : transactionInPeriod(transaction, filters.selectedMonth, filters.untilDate, filters.fromDate)))
    .filter((transaction) => {
      const status = statusFor(transaction);
      return filters.paymentStatus === "all" || (filters.paymentStatus === "pending" ? status !== "paid" : status === filters.paymentStatus);
    })
    .filter((transaction) => !filters.selectedCategories.length || filters.selectedCategories.includes(transaction.categoryId))
    .filter((transaction) => !query || normalizeSearchText(`${transaction.title} ${transaction.note ?? ""}`).includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Count the same rows the user can see; loan entries have their own badge. */
export function countUnpaidTransactions<T extends Transaction>(transactions: T[], statusFor: (transaction: T) => PaymentStatus): number {
  return transactions.filter((transaction) => transaction.source !== "loan" && transaction.operationType !== "loan" && transaction.operationType !== "card" && !transaction.id.startsWith("loan-receivable-") && statusFor(transaction) !== "paid").length;
}
