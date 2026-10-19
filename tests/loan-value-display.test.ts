import { test } from "node:test";
import assert from "node:assert/strict";
import type { LoanReceivable, ProfileData } from "../src/lib/app-store";
import {
  getLoanValueDisplay,
  sanitizeLoanValueMode,
} from "../src/lib/loan-value-display";
import {
  recordFreeLoanReceipt,
  settleLoanReceivables,
} from "../src/lib/loan-repayments";
import { reopenLoanReceivable } from "../src/lib/loan-record-actions";
import { getLoanViewSummary, type LoanViewFilters } from "../src/lib/loan-view";

const item = (patch: Partial<LoanReceivable> = {}): LoanReceivable => ({
  id: "one",
  loanId: "loan",
  contact: "Pessoa",
  amount: 500,
  status: "scheduled",
  operationType: "loan",
  collectionMode: "fixed",
  startDate: "2026-10-01",
  createdAt: "2026-10-01",
  dueDate: "2026-10-17",
  ...patch,
});
const profile = (loan: LoanReceivable): ProfileData => ({
  categories: [],
  cards: [],
  transactions: [],
  loanReceivables: [loan],
  people: [],
  reserves: [],
  reservesInBalance: true,
  notifications: [],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
});

test("old or invalid preferences retain uniform display and saved profiles keep their own choice", () => {
  for (const value of [undefined, null, "", "unknown", true, {}, "uniform"])
    assert.equal(sanitizeLoanValueMode(value), "uniform");
  const saved = JSON.parse(
    JSON.stringify([
      { loanValueMode: "status" },
      { loanValueMode: "uniform" },
      {},
    ]),
  );
  assert.deepEqual(
    saved.map((entry: { loanValueMode?: unknown }) =>
      sanitizeLoanValueMode(entry.loanValueMode),
    ),
    ["status", "uniform", "uniform"],
  );
});

test("status display keeps unpaid fixed, free and borrowed-card amounts red with a minus, while uniform display stays identical", () => {
  const loans = [
    item(),
    item({ dueDate: "2026-12-17" }),
    item({ status: "open", collectionMode: "open", dueDate: undefined }),
    item({
      operationType: "card",
      cardId: "card",
      cardInvoiceMonth: "2026-10",
      cardClosingDate: "2026-10-10",
    }),
    item({ operationType: "card", dueDate: undefined }),
  ];
  const before = structuredClone(loans);
  for (const loan of loans) {
    assert.deepEqual(getLoanValueDisplay(loan, "status"), {
      amount: 500,
      sign: "−",
      className: "text-[#d63036] dark:text-[#ff9b96]",
    });
    assert.deepEqual(getLoanValueDisplay(loan, "uniform"), {
      amount: 500,
      sign: "+",
      className: "text-[#17a443] dark:text-[#7edb9d]",
    });
  }
  assert.deepEqual(loans, before);
});

test("receiving and reopening a real installment updates presentation without changing its amount", () => {
  const original = profile(item());
  const paid = settleLoanReceivables(original, ["one"], "2026-10-18");
  assert.equal(
    getLoanValueDisplay(original.loanReceivables[0], "status").sign,
    "−",
  );
  const received = getLoanValueDisplay(paid.loanReceivables[0], "status");
  assert.equal(received.sign, "+");
  assert.equal(received.amount, 500);
  assert.equal(
    received.className,
    getLoanValueDisplay(paid.loanReceivables[0], "uniform").className,
  );
  const reopened = reopenLoanReceivable(paid, "one");
  assert.equal(
    getLoanValueDisplay(reopened.loanReceivables[0], "status").sign,
    "−",
  );
  assert.equal(
    getLoanValueDisplay(reopened.loanReceivables[0], "status").amount,
    500,
  );
});

test("changing presentation preserves partial receipts, totals and the positive outstanding balance", () => {
  const original = profile(
    item({
      status: "open",
      collectionMode: "open",
      dueDate: undefined,
      amount: 500.5,
    }),
  );
  const partial = recordFreeLoanReceipt(
    original,
    "one",
    125.25,
    "2026-10-18",
    "partial",
  );
  const before = structuredClone(partial);
  const filters: LoanViewFilters = {
    selectedMonth: "2026-10",
    selectedMonths: [],
    scope: "period",
    tab: "dinheiro",
    status: "all",
    mode: "all",
    query: "",
  };
  const totals = getLoanViewSummary(partial.loanReceivables, filters);
  for (const mode of ["uniform", "status"] as const) {
    assert.equal(
      getLoanValueDisplay(partial.loanReceivables[0], mode).amount,
      375.25,
    );
    assert.deepEqual(
      getLoanViewSummary(partial.loanReceivables, filters),
      totals,
    );
  }
  assert.deepEqual(totals, { outstanding: 375.25, received: 125.25 });
  assert.deepEqual(partial, before);
});
