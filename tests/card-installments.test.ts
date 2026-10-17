import { test } from "node:test";
import assert from "node:assert/strict";
import { getCardInstallmentHistory } from "../src/lib/card-installments";
import type { AppCard } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";

const card: AppCard = { id: "card", name: "Meu cartão", last4: "1234", color: "#AF52DE", closingDay: 10, dueDay: 20 };
const purchase = (extra: Partial<Transaction> = {}): Transaction => ({ id: "purchase", title: "Compra", categoryId: "compras", amount: -750, date: "2026-08-08", paymentMethod: "cartao", cardMode: "credito", cardId: "card", paymentStatus: "pending", recurrence: "parcelada", installments: 3, currentInstallment: 1, ...extra });

test("the card purchase history shows the current installment and the scheduled following installments", () => {
  const result = getCardInstallmentHistory(purchase(), card, "2026-08-20");
  assert.deepEqual(result.map((item) => [item.number, item.total, item.amount, item.dueDate, item.status]), [
    [1, 3, 250, "2026-08-20", "pending"],
    [2, 3, 250, "2026-09-20", "scheduled"],
    [3, 3, 250, "2026-10-20", "scheduled"],
  ]);
  assert.deepEqual(result.map((item) => item.isCurrent), [true, false, false]);
});

test("the chosen invoice determines the first installment after closing", () => {
  const automatic = getCardInstallmentHistory(purchase({ date: "2026-08-11" }), card, "2026-08-17");
  const selected = getCardInstallmentHistory(purchase({ date: "2026-08-11", cardInvoiceMonth: "2026-08" }), card, "2026-08-17");
  assert.deepEqual(automatic.map((item) => item.month), ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(selected.map((item) => item.month), ["2026-08", "2026-09", "2026-10"]);
});

test("installments keep exact cents and preserve the total purchase amount", () => {
  assert.deepEqual(getCardInstallmentHistory(purchase({ amount: -100 }), card).map((item) => item.amount), [33.34, 33.33, 33.33]);
  for (const total of [0.05, 10.01, 100, 999.99]) {
    const rows = getCardInstallmentHistory(purchase({ amount: -total, installments: 7 }), card);
    assert.equal(rows.reduce((sum, item) => sum + Math.round(item.amount * 100), 0), Math.round(total * 100));
  }
});

test("monthly due dates clamp short months and recover the configured day afterward", () => {
  const due31 = { ...card, dueDay: 31 };
  assert.deepEqual(getCardInstallmentHistory(purchase({ date: "2027-01-08" }), due31).map((item) => item.dueDate), ["2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.deepEqual(getCardInstallmentHistory(purchase({ date: "2028-01-08" }), due31).map((item) => item.dueDate), ["2028-01-31", "2028-02-29", "2028-03-31"]);
  assert.deepEqual(getCardInstallmentHistory(purchase({ date: "2026-12-08" }), due31).map((item) => item.dueDate), ["2026-12-31", "2027-01-31", "2027-02-28"]);
});

test("paid invoices and manual payment affect their own installment, without assuming prior installments were paid", () => {
  const transaction = purchase({ currentInstallment: 2 });
  assert.deepEqual(getCardInstallmentHistory(transaction, card, "2026-09-20").map((item) => item.status), ["overdue", "pending", "scheduled"]);
  const paidFirst = { ...card, invoicePaidByMonth: { "2026-08": true } };
  assert.deepEqual(getCardInstallmentHistory(transaction, paidFirst, "2026-09-20").map((item) => item.status), ["paid", "pending", "scheduled"]);
  assert.deepEqual(getCardInstallmentHistory({ ...transaction, paymentStatus: "paid" }, paidFirst, "2026-09-20").map((item) => item.status), ["paid", "paid", "scheduled"]);
  assert.equal(getCardInstallmentHistory(transaction, card, "2026-09-21")[1].status, "overdue");
});

test("a single credit purchase gets one row; unavailable card dates remain explicit", () => {
  const single = getCardInstallmentHistory(purchase({ recurrence: undefined, installments: undefined }), card, "2026-08-20");
  assert.equal(single.length, 1);
  assert.equal(single[0].amount, 750);
  assert.equal(single[0].dueDate, "2026-08-20");
  for (const selectedCard of [undefined, { ...card, dueDay: undefined }]) {
    const rows = getCardInstallmentHistory(purchase(), selectedCard, "2026-08-20");
    assert.ok(rows.every((item) => !item.dueDate && item.status === "pending"));
  }
  assert.equal(getCardInstallmentHistory(purchase({ cardId: undefined }), undefined).length, 3);
});

test("debit, income and loan records do not receive a credit card installment history", () => {
  for (const extra of [{ cardMode: "debito" }, { amount: 750 }, { source: "loan" as const }, { paymentMethod: "pix" }]) {
    assert.deepEqual(getCardInstallmentHistory(purchase(extra), card), []);
  }
  const original = purchase(), snapshot = structuredClone(original);
  getCardInstallmentHistory(original, card, "2026-09-21");
  assert.deepEqual(original, snapshot);
});
