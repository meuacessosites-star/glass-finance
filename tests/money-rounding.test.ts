import assert from "node:assert/strict";
import test from "node:test";
import type { Transaction } from "../src/lib/mock-data";
import { formatCurrency, monthTotals } from "../src/lib/mock-data";
import { fromCents, sumCents, toCents } from "../src/lib/money";

function transaction(id: string, date: string, amount: number): Transaction {
  return { id, date, amount } as Transaction;
}

test("converts decimal values to exact cents, including midpoint rounding", () => {
  assert.equal(toCents(0.1), 10);
  assert.equal(toCents(0.2), 20);
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(-1.005), -101);
  assert.equal(toCents(1e-8), 0);
  assert.equal(fromCents(10_001), 100.01);
});

test("sums month income and expenses in cents and filters other months", () => {
  const entries = [
    transaction("i1", "2026-08-01", 0.1),
    transaction("i2", "2026-08-02", 0.2),
    transaction("i3", "2026-08-03", 0.05),
    transaction("e1", "2026-08-04", -0.1),
    transaction("e2", "2026-08-05", -0.2),
    transaction("e3", "2026-08-06", -0.05),
    transaction("other", "2026-07-31", 99.99),
  ];
  const result = monthTotals(entries, "2026-08");
  assert.equal(result.income, 0.35);
  assert.equal(result.expense, 0.35);
  assert.deepEqual(result.list.map(({ id }) => id), ["i1", "i2", "i3", "e1", "e2", "e3"]);
});

test("sums large but safe values and rejects non-finite or unsafe money", () => {
  assert.equal(sumCents([1_000_000_000, 2.34]), 100_000_000_234);
  assert.throws(() => toCents(Number.NaN), RangeError);
  assert.throws(() => toCents(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => toCents(100_000_000_000_000), RangeError);
  assert.throws(() => sumCents([Number.MAX_SAFE_INTEGER / 100, 1]), RangeError);
});

test("formats currency only to cents and signals invalid values", () => {
  assert.equal(formatCurrency(1.005), new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(1.01));
  assert.equal(formatCurrency(-1.005, true), `- ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(1.01)}`);
  assert.equal(formatCurrency(0, true).startsWith("+"), true);
  assert.equal(formatCurrency(Number.NaN), "—");
  assert.equal(formatCurrency(Number.POSITIVE_INFINITY), "—");
});
