import assert from "node:assert/strict";
import test from "node:test";
import type { ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { financialOverview } from "../src/lib/financial-overview";

const transaction = (id: string, amount: number): Transaction => ({
  id,
  title: id,
  amount,
  date: "2026-08-10",
  categoryId: "outros",
  paymentStatus: "paid",
} as Transaction);

function profile(): ProfileData {
  return {
    transactions: [
      transaction("income-1", 0.1),
      transaction("income-2", 0.2),
      transaction("income-3", 0.05),
      transaction("expense-1", -0.1),
      transaction("expense-2", -0.2),
      transaction("expense-3", -0.05),
    ],
    cards: [],
    loanReceivables: [],
    financings: [],
    reserves: [{ id: "r1", amount: 0.1 }, { id: "r2", amount: 0.2 }, { id: "r3", amount: 0.05 }],
    goals: [],
    notifications: [],
  } as unknown as ProfileData;
}

test("financial overview aggregates reais exactly at cent precision", () => {
  const summary = financialOverview(profile(), "2026-08", "2026-08-15");
  assert.equal(summary.received, 0.35);
  assert.equal(summary.expected, 0);
  assert.equal(summary.expense, 0.35);
  assert.equal(summary.result, 0);
  assert.equal(summary.paid, 0.35);
  assert.equal(summary.pending, 0);
  assert.equal(summary.reserveTotal, 0.35);
  assert.equal(summary.cardCommitted, 0);
  assert.equal(summary.loanOutstanding, 0);
});

test("financial overview refuses invalid monetary data instead of misreporting totals", () => {
  const data = profile();
  data.reserves[0].amount = Number.POSITIVE_INFINITY;
  assert.throws(() => financialOverview(data, "2026-08", "2026-08-15"), RangeError);
});
