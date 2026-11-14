import test from "node:test";
import assert from "node:assert/strict";
import { receiptInstallmentPlan } from "../src/lib/receipt-installments";

test("extracts 4x credit-card purchase into four installments", () => {
  assert.deepEqual(receiptInstallmentPlan(4, 0), { installments: 4, currentInstallment: 1 });
});
test("2x and the printed current installment are preselected", () => {
  assert.deepEqual(receiptInstallmentPlan("2x", "2"), { installments: 2, currentInstallment: 2 });
});
test("empty or unique payment stays non-installment", () => {
  assert.equal(receiptInstallmentPlan(0, 0), null);
  assert.equal(receiptInstallmentPlan(1, 1), null);
  assert.equal(receiptInstallmentPlan(undefined, undefined), null);
});
test("unsupported counts don't silently truncate a payment plan", () => {
  assert.equal(receiptInstallmentPlan(25, 1), null);
  assert.equal(receiptInstallmentPlan("itens 2x", 0), null);
});
test("invalid current installment defaults to first for user review", () => {
  assert.deepEqual(receiptInstallmentPlan(3, 5), { installments: 3, currentInstallment: 1 });
});
