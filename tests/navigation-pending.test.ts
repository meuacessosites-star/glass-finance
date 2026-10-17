import { test } from "node:test";
import assert from "node:assert/strict";
import type { Transaction } from "../src/lib/mock-data";
import { getTransactionPaymentStatus } from "../src/lib/transaction-status";
import { countUnpaidTransactions, selectTransactionView, type TransactionViewFilters } from "../src/lib/transaction-view";
import { pendingCountReducer, readPendingCount, type PendingCountState } from "../src/lib/navigation-pending-state";

const today = "2026-10-17";
const bill = (id: string, date: string, patch: Partial<Transaction> = {}): Transaction => ({ id, date, title: id, categoryId: "moradia", amount: -100, paymentMethod: "boleto", paymentStatus: "pending", ...patch });
const transactions = [
  bill("september", "2026-09-15"),
  bill("oct-pending", "2026-10-05", { title: "Pão de Açúcar", categoryId: "alimentacao", dueDate: "2026-10-20" }),
  bill("oct-paid", "2026-10-06", { paymentStatus: "paid" }),
  bill("oct-overdue", "2026-10-10", { title: "Internet", dueDate: "2026-10-16" }),
  bill("oct-income", "2026-10-15", { title: "Reembolso", categoryId: "outros", amount: 120, dueDate: "2026-10-22" }),
  bill("november", "2026-11-01", { dueDate: "2026-11-10" }),
];
const base: TransactionViewFilters = { scope: "month", selectedMonth: "2026-10", selectedMonths: [], paymentStatus: "all", selectedCategories: [], searchQuery: "" };
const status = (item: Transaction) => getTransactionPaymentStatus(item, [], [], today);
const viewCount = (patch: Partial<TransactionViewFilters> = {}, entries = transactions) => countUnpaidTransactions(selectTransactionView(entries, { ...base, ...patch }, status), status);

test("the pending badge follows each selected month, including scheduled items in that month", () => {
  assert.equal(viewCount(), 3);
  assert.equal(viewCount({ selectedMonth: "2026-09" }), 1);
  assert.equal(viewCount({ selectedMonth: "2026-11" }), 1);
  assert.equal(viewCount({ selectedMonth: "2026-12" }), 0);
});

test("paid, pending and overdue filters count only the rows in their results", () => {
  assert.equal(viewCount({ paymentStatus: "paid" }), 0);
  assert.equal(viewCount({ paymentStatus: "pending" }), 3);
  assert.equal(viewCount({ paymentStatus: "overdue" }), 1);
});

test("category, search text and combined filters narrow the same list used by the badge", () => {
  assert.equal(viewCount({ selectedCategories: ["moradia"] }), 1);
  assert.equal(viewCount({ searchQuery: "pao de acucar" }), 1);
  assert.equal(viewCount({ searchQuery: "internet", selectedCategories: ["alimentacao"] }), 0);
  assert.equal(viewCount({ searchQuery: "nenhum resultado" }), 0);
});

test("custom date ranges, multiple months and all-history search have matching pending counts", () => {
  assert.equal(viewCount({ fromDate: "2026-10-05", untilDate: "2026-10-10" }), 2);
  assert.equal(viewCount({ selectedMonths: ["2026-10", "2026-11"] }), 4);
  assert.equal(viewCount({ scope: "all" }), 5);
  assert.equal(viewCount({ scope: "all", searchQuery: "november" }), 1);
});

test("paying a visible item reduces the count and loan entries cannot inflate Transactions", () => {
  const paid = transactions.map((item) => item.id === "oct-pending" ? { ...item, paymentStatus: "paid" as const } : item);
  assert.equal(viewCount({}, paid), 2);
  const mixed = [...transactions, bill("loan", "2026-10-01", { source: "loan" }), bill("card-loan", "2026-10-02", { operationType: "card" }), bill("loan-receivable-x", "2026-10-03")];
  assert.equal(viewCount({}, mixed), 3);
});

test("a zero from a filtered view hides the badge instead of restoring the global count", () => {
  const state = pendingCountReducer({}, { type: "report", report: { section: "transactions", ownerId: "view", profileId: "a", pathname: "/dashboard/transacoes", count: 0 } });
  assert.equal(readPendingCount(state, "transactions", "a", "/dashboard/transacoes", 9), 0);
  assert.equal(readPendingCount(state, "loans", "a", "/dashboard/transacoes", 2), 2);
});

test("changing route or profile cannot reuse another view's pending count", () => {
  const state: PendingCountState = { transactions: { section: "transactions", ownerId: "old", profileId: "a", pathname: "/dashboard/transacoes", count: 6 } };
  assert.equal(readPendingCount(state, "transactions", "b", "/dashboard/transacoes", 1), 1);
  assert.equal(readPendingCount(state, "transactions", "a", "/dashboard", 3), 3);
  const next = pendingCountReducer(state, { type: "report", report: { ...state.transactions!, ownerId: "new", count: 2 } });
  assert.equal(pendingCountReducer(next, { type: "clear", section: "transactions", ownerId: "old" }), next);
  assert.deepEqual(pendingCountReducer(next, { type: "clear", section: "transactions", ownerId: "new" }), {});
});
