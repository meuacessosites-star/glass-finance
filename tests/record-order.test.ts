import { test } from "node:test";
import assert from "node:assert/strict";
import type { LoanReceivable } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { selectLoanView, type LoanViewFilters } from "../src/lib/loan-view";
import {
  selectTransactionView,
  type TransactionViewFilters,
} from "../src/lib/transaction-view";

const today = "2026-10-18";
const transaction = (
  id: string,
  date: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  date,
  amount: -100,
  categoryId: "outros",
  paymentStatus: "pending",
  ...patch,
});
const loan = (
  id: string,
  startDate: string,
  patch: Partial<LoanReceivable> = {},
): LoanReceivable => ({
  id,
  loanId: id,
  contact: id,
  amount: 100,
  startDate,
  createdAt: today,
  dueDate: "2026-10-25",
  collectionMode: "fixed",
  operationType: "loan",
  status: "scheduled",
  ...patch,
});
const transactionFilters: TransactionViewFilters = {
  scope: "all",
  selectedMonth: "2026-10",
  selectedMonths: [],
  paymentStatus: "all",
  selectedCategories: [],
  searchQuery: "",
};
const loanFilters: LoanViewFilters = {
  scope: "all",
  selectedMonth: "2026-10",
  selectedMonths: [],
  tab: "dinheiro",
  status: "all",
  mode: "all",
  query: "",
};
const ids = (items: { id: string }[]) => items.map((item) => item.id);
const transactionView = (items: Transaction[], filters = transactionFilters) =>
  selectTransactionView(items, filters, (item) => item.paymentStatus ?? "paid");
const loanView = (items: LoanReceivable[], filters = loanFilters) =>
  selectLoanView(items, filters, today);

test("a newly added transaction leads its day, while a late-entered old transaction keeps its date position", () => {
  const saved = [
    transaction("yesterday", "2026-10-17"),
    transaction("old-month", "2026-09-10"),
    transaction("day5", "2026-10-05"),
  ];
  const added = [transaction("new", today), ...saved];
  assert.deepEqual(ids(transactionView(added)), [
    "new",
    "yesterday",
    "day5",
    "old-month",
  ]);
  const backdated = [transaction("backdated", "2026-10-10"), ...added];
  const snapshot = structuredClone(backdated);
  assert.deepEqual(ids(transactionView(backdated)), [
    "new",
    "yesterday",
    "backdated",
    "day5",
    "old-month",
  ]);
  assert.deepEqual(backdated, snapshot);
});

test("same-day transactions retain newest-inserted-first order after reload, independently of status or receipt time", () => {
  const saved = [
    transaction("newest", today, { paymentStatus: "paid", time: "08:00" }),
    transaction("previous", today, { time: "20:00" }),
    transaction("first", today),
  ];
  const reloaded = JSON.parse(JSON.stringify(saved)) as Transaction[];
  assert.deepEqual(ids(transactionView(reloaded)), [
    "newest",
    "previous",
    "first",
  ]);
  reloaded[1].paymentStatus = "paid";
  assert.deepEqual(ids(transactionView(reloaded)), [
    "newest",
    "previous",
    "first",
  ]);
});

test("transaction month, day and status filters keep chronological order without pulling in excluded records", () => {
  const rows = [
    transaction("backdated", "2026-09-10"),
    transaction("latest", today),
    transaction("older", "2026-10-10"),
    transaction("paid", "2026-10-12", { paymentStatus: "paid" }),
  ];
  assert.deepEqual(
    ids(
      transactionView(rows, {
        ...transactionFilters,
        scope: "month",
        paymentStatus: "pending",
      }),
    ),
    ["latest", "older"],
  );
  assert.deepEqual(
    ids(
      transactionView(rows, {
        ...transactionFilters,
        scope: "month",
        fromDate: "2026-10-10",
        untilDate: "2026-10-12",
      }),
    ),
    ["paid", "older"],
  );
});

test("new loans sort by the loan date rather than status or installment due date", () => {
  const recent = loan("recent", today, {
    status: "paid",
    paymentDate: today,
    dueDate: "2026-10-19",
  });
  const previous = loan("previous", "2026-10-17", { dueDate: "2027-01-25" });
  const older = loan("older", "2026-10-01", { dueDate: "2026-10-10" });
  const rows = [older, previous, recent];
  const snapshot = structuredClone(rows);
  assert.deepEqual(ids(loanView(rows)), ["recent", "previous", "older"]);
  assert.deepEqual(rows, snapshot);
});

test("a loan entered today with an old chosen date stays between the appropriate saved dates", () => {
  const backdated = loan("backdated", "2026-10-05");
  const rows = [
    backdated,
    loan("new", today),
    loan("mid", "2026-10-10"),
    loan("old", "2026-09-30"),
  ];
  assert.deepEqual(ids(loanView(rows)), ["new", "mid", "backdated", "old"]);
});

test("same-day loans keep insertion order and saved installment sequence when received or reloaded", () => {
  const first = loan("new-part1", today, {
    loanId: "new",
    installment: 1,
    installments: 2,
  });
  const second = loan("new-part2", today, {
    loanId: "new",
    installment: 2,
    installments: 2,
    dueDate: "2026-11-25",
  });
  const older = loan("earlier-registration", today);
  const rows = JSON.parse(
    JSON.stringify([first, second, older]),
  ) as LoanReceivable[];
  assert.deepEqual(ids(loanView(rows)), [
    "new-part1",
    "new-part2",
    "earlier-registration",
  ]);
  rows[0].status = "paid";
  rows[0].paymentDate = today;
  assert.deepEqual(ids(loanView(rows)), [
    "new-part1",
    "new-part2",
    "earlier-registration",
  ]);
});

test("borrowed-card purchases sort by purchase date without changing invoice dates or the selected period", () => {
  const card = (id: string, date: string, dueDate: string) =>
    loan(id, date, {
      operationType: "card",
      cardId: "card",
      cardClosingDate: `${dueDate.slice(0, 7)}-10`,
      cardInvoiceMonth: dueDate.slice(0, 7),
      dueDate,
    });
  const latest = card("latest", today, "2026-11-17");
  const older = card("older", "2026-09-10", "2026-12-17");
  const backdated = card("backdated", "2026-09-15", "2026-10-17");
  const rows = [backdated, latest, older];
  assert.deepEqual(ids(loanView(rows, { ...loanFilters, tab: "cartao" })), [
    "latest",
    "backdated",
    "older",
  ]);
  assert.deepEqual(
    ids(loanView(rows, { ...loanFilters, tab: "cartao", scope: "period" })),
    ["backdated"],
  );
  assert.equal(latest.dueDate, "2026-11-17");
});

test("carried free-loan balances keep their original date and totals when the list order changes", () => {
  const carried = loan("carried", "2026-08-10", {
    collectionMode: "open",
    dueDate: undefined,
    status: "open",
    amount: 500,
    receipts: [
      {
        id: "receipt",
        amount: 100,
        date: "2026-10-17",
        transactionId: "receipt",
      },
    ],
  });
  const rows = [carried, loan("today", today), loan("yesterday", "2026-10-17")];
  const snapshot = structuredClone(rows);
  assert.deepEqual(ids(loanView(rows, { ...loanFilters, scope: "period" })), [
    "today",
    "yesterday",
    "carried",
  ]);
  assert.deepEqual(rows, snapshot);
});

test("legacy loans without an original start date fall back to their saved creation date", () => {
  const legacy = loan("legacy", today, {
    startDate: undefined,
    createdAt: "2026-09-10",
  });
  assert.deepEqual(ids(loanView([legacy, loan("new", today)])), [
    "new",
    "legacy",
  ]);
});
