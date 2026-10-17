import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, LoanReceivable } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { getPreviousMonthDebts } from "../src/lib/previous-month-debts";

const card: AppCard = { id: "card", name: "Meu cartão", last4: "1234", color: "#8020AA", closingDay: 10, dueDay: 17 };
const bill = (patch: Partial<Transaction> = {}): Transaction => ({ id: "bill", title: "Conta", categoryId: "moradia", date: "2026-10-01", dueDate: "2026-10-31", amount: -100, paymentMethod: "boleto", paymentStatus: "pending", ...patch });
const purchase = (patch: Partial<Transaction> = {}): Transaction => bill({ id: "purchase", date: "2026-10-05", dueDate: undefined, paymentMethod: "cartao", cardId: card.id, cardMode: "credito", ...patch });

test("an unpaid bill carries over at the local month boundary and disappears when paid", () => {
  const pending = bill();
  assert.equal(getPreviousMonthDebts([], [pending], [], "2026-10-31").items.length, 0);
  const reminder = getPreviousMonthDebts([], [pending], [], "2026-11-01");
  assert.equal(reminder.month, "2026-11");
  assert.equal(reminder.items.length, 1);
  assert.equal(reminder.total, 100);
  assert.equal(reminder.items[0].dueDate, "2026-10-31");
  assert.equal(getPreviousMonthDebts([], [{ ...pending, paymentStatus: "paid" }], [], "2026-11-01").items.length, 0);
  assert.equal(getPreviousMonthDebts([], [pending], [], "2026-12-01").items.length, 1);
});

test("due months control carryover rather than the entry or purchase month", () => {
  const transactions = [bill({ id: "old", date: "2026-11-01", dueDate: "2026-09-30" }), bill({ id: "future", date: "2026-09-01", dueDate: "2026-11-10" }), bill({ id: "due-today", dueDate: "2026-11-01" })];
  const result = getPreviousMonthDebts([], transactions, [], "2026-11-01");
  assert.deepEqual(result.items.map((item) => item.id), ["previous-debt-old"]);
  assert.equal(getPreviousMonthDebts([], [bill({ dueDate: undefined, date: "2026-09-30" })], [], "2026-11-01").items.length, 1);
});

test("browsing the following month shows already expired debts without warning for future due dates", () => {
  const transactions = [bill({ id: "expired", dueDate: "2026-10-16" }), bill({ id: "future", dueDate: "2026-10-20" })];
  assert.equal(getPreviousMonthDebts([], transactions, [], "2026-10-17", "2026-10").items.length, 0);
  const next = getPreviousMonthDebts([], transactions, [], "2026-10-17", "2026-11");
  assert.deepEqual(next.items.map((item) => item.id), ["previous-debt-expired"]);
  assert.equal(getPreviousMonthDebts([], transactions, [], "2026-10-17", "2026-09").items.length, 0);
});

test("paid bills, incomes and every loan ledger record stay outside the expense reminder", () => {
  const receipt: LoanReceivable = { id: "receipt", transactionId: "linked", loanId: "loan", contact: "Pessoa", amount: 100, status: "scheduled", dueDate: "2026-10-01", operationType: "loan", createdAt: "2026-10-01" };
  const transactions = [
    bill({ id: "paid", paymentStatus: "paid" }), bill({ id: "legacy-paid", paymentStatus: undefined }), bill({ id: "income", amount: 100 }), bill({ id: "zero", amount: 0 }),
    bill({ id: "loan", source: "loan" }), bill({ id: "operation", operationType: "loan" }), bill({ id: "card-loan", operationType: "card" }),
    bill({ id: "linked" }), bill({ id: "loan-receivable-receipt" }), bill({ id: "reference", note: "Referência: loan" }),
  ];
  assert.deepEqual(getPreviousMonthDebts([], transactions, [receipt], "2026-11-01").items, []);
});

test("credit reminders group each invoice once and subtract only its outstanding balance", () => {
  const partialPayment = { totalAmount: 300, paidAmount: 80, paymentDate: "2026-10-17" };
  const partial: AppCard = { ...card, invoicePaymentsByMonth: { "2026-10": partialPayment } };
  const transactions = [purchase({ id: "paid", amount: -50, paymentStatus: "paid" }), purchase({ id: "pending", amount: -250 }), purchase({ id: "next", date: "2026-10-11", amount: -70 })];
  const result = getPreviousMonthDebts([partial], transactions, [], "2026-11-01");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, "invoice");
  assert.equal(result.total, 220);
  assert.equal(result.items[0].dueDate, "2026-10-17");
  assert.equal(getPreviousMonthDebts([{ ...partial, invoicePaidByMonth: { "2026-10": true } }], transactions, [], "2026-11-01").items.length, 0);
  assert.equal(getPreviousMonthDebts([{ ...partial, invoicePaymentsByMonth: { "2026-10": { ...partialPayment, paidAmount: 300 } } }], transactions, [], "2026-11-01").items.length, 0);
  assert.equal(getPreviousMonthDebts([{ ...partial, archived: true }], transactions, [], "2026-11-01").items.length, 0);
});

test("chosen invoice months, missing card settings and standalone invoice balances are respected", () => {
  const chosen = purchase({ date: "2026-10-11", cardInvoiceMonth: "2026-10" });
  assert.equal(getPreviousMonthDebts([card], [chosen], [], "2026-11-01").items.length, 1);
  assert.equal(getPreviousMonthDebts([{ ...card, dueDay: undefined }], [chosen], [], "2026-11-01").items.length, 0);
  assert.equal(getPreviousMonthDebts([{ ...card, invoiceOverrideByMonth: { "2026-09": 75.25 } }], [], [], "2026-11-01").total, 75.25);
});

test("December and leap-day debts survive year and month changes without mutating the ledger", () => {
  const transactions = [bill({ id: "december", dueDate: "2026-12-31", amount: -0.1 }), bill({ id: "older", dueDate: "2026-11-30", amount: -0.2 })];
  const snapshot = structuredClone(transactions);
  const result = getPreviousMonthDebts([], transactions, [], "2027-01-01");
  assert.equal(result.total, 0.3);
  assert.deepEqual(result.items.map((item) => item.dueDate), ["2026-11-30", "2026-12-31"]);
  assert.deepEqual(transactions, snapshot);
  assert.equal(getPreviousMonthDebts([], [bill({ dueDate: "2028-02-29" })], [], "2028-03-01").items.length, 1);
});
