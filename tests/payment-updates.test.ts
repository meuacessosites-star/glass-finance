import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { openUnpaidPurchaseInvoices, recordInvoicePayment, setInvoicePaymentStatus, setTransactionPaymentState } from "../src/lib/payment-updates";
import { getCardBillingReminders } from "../src/lib/card-billing";
import { getCardInstallmentHistory } from "../src/lib/card-installments";
import { getTransactionPaymentStatus } from "../src/lib/transaction-status";

const card: AppCard = { id: "card", name: "Cartão", last4: "1234", color: "#000000", closingDay: 10, dueDay: 17 };
const purchase = (id: string, amount: number, patch: Partial<Transaction> = {}): Transaction => ({ id, title: id, categoryId: "compras", amount, date: "2026-10-05", paymentMethod: "cartao", cardMode: "credito", cardId: card.id, paymentStatus: "pending", ...patch });
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({ categories: [], cards: [card], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null, ...patch });

test("new installments reopen every affected unpaid invoice and preserve previous payments", () => {
  const payment = { totalAmount: 50, paidAmount: 50, paymentDate: "2026-11-17" };
  const data = profile({ cards: [{ ...card, invoicePaidByMonth: { "2026-10": true, "2026-11": true, "2026-12": true, "2027-01": true }, invoicePaymentsByMonth: { "2026-11": payment } }] });
  const t = purchase("new", -300, { recurrence: "parcelada", installments: 3 });
  const next = openUnpaidPurchaseInvoices(data, t, "2026-10-17");
  assert.deepEqual(next.cards[0].invoicePaidByMonth, { "2026-10": false, "2026-11": false, "2026-12": false, "2027-01": true });
  assert.deepEqual(next.cards[0].invoicePaymentsByMonth?.["2026-11"], payment);
  const paidFirst = openUnpaidPurchaseInvoices(data, { ...t, paymentStatus: "paid" }, "2026-10-17");
  assert.equal(paidFirst.cards[0].invoicePaidByMonth?.["2026-10"], true);
  assert.equal(paidFirst.cards[0].invoicePaidByMonth?.["2026-11"], false);
  assert.equal(openUnpaidPurchaseInvoices(data, { ...t, source: "loan" }), data);
  assert.equal(data.cards[0].invoicePaidByMonth?.["2026-11"], true);
});

test("settling and reopening a future installment changes only its invoice without duplicating the purchase", () => {
  const data = profile({ transactions: [purchase("three", -300, { recurrence: "parcelada", installments: 3 })] });
  const october = setInvoicePaymentStatus(data, card.id, "2026-10", true, "2026-10-17");
  assert.equal(october.cards[0].invoicePaymentsByMonth?.["2026-10"].totalAmount, 100);
  assert.deepEqual(getCardBillingReminders(october.cards, october.transactions, new Date(2026, 9, 18, 12)).map((r) => [r.month, r.amount]), [["2026-11", 100], ["2026-12", 100]]);
  const november = recordInvoicePayment(october, card.id, "2026-11", { totalAmount: 100, paidAmount: 100, paymentDate: "2026-11-17" });
  assert.deepEqual(getCardInstallmentHistory(november.transactions[0], november.cards[0], "2026-11-17").map((p) => p.status), ["paid", "paid", "scheduled"]);
  const reopened = setInvoicePaymentStatus(november, card.id, "2026-11", false, "2026-11-18");
  assert.equal(reopened.cards[0].invoicePaymentsByMonth?.["2026-11"], undefined);
  assert.equal(reopened.cards[0].invoicePaymentsByMonth?.["2026-10"].paidAmount, 100);
  assert.deepEqual(getCardInstallmentHistory(reopened.transactions[0], reopened.cards[0], "2026-11-18").map((p) => p.status), ["paid", "overdue", "scheduled"]);
  assert.equal(reopened.transactions.length, 1);
  assert.equal(reopened.transactions[0].amount, -300);
  assert.deepEqual(data.transactions, [purchase("three", -300, { recurrence: "parcelada", installments: 3 })]);
});

test("full payment from the invoice modal synchronizes purchases and reopening clears payment history", () => {
  const data = profile({ transactions: [purchase("one", -100), purchase("two", -200)] });
  const paid = recordInvoicePayment(data, card.id, "2026-10", { totalAmount: 300, paidAmount: 300, paymentDate: "2026-10-17", installments: 3 });
  assert.ok(paid.transactions.every((t) => t.paymentStatus === "paid" && t.paymentDate === "2026-10-17"));
  assert.equal(paid.cards[0].invoicePaymentsByMonth?.["2026-10"].installments, 3);
  const reopened = setInvoicePaymentStatus(paid, card.id, "2026-10", false, "2026-10-18");
  assert.equal(reopened.cards[0].invoicePaymentsByMonth?.["2026-10"], undefined);
  assert.ok(reopened.transactions.every((t) => t.paymentStatus === "pending" && !t.paymentDate));
  assert.equal(getCardBillingReminders(reopened.cards, reopened.transactions, new Date(2026, 9, 18, 12))[0].amount, 300);
});

test("partial modal payment preserves separately paid purchases and only deducts the greater paid balance", () => {
  const data = profile({ transactions: [purchase("one", -60, { paymentStatus: "paid" }), purchase("two", -40)] });
  const next = recordInvoicePayment(data, card.id, "2026-10", { totalAmount: 100, paidAmount: 30, paymentDate: "2026-10-17" });
  assert.equal(next.transactions[0].paymentStatus, "paid");
  assert.equal(next.transactions[1].paymentStatus, "pending");
  assert.equal(getCardBillingReminders(next.cards, next.transactions, new Date(2026, 9, 18, 12))[0].amount, 40);
});

test("manual payment from an existing later installment targets its month only", () => {
  const data = profile({ transactions: [purchase("three", -300, { recurrence: "parcelada", installments: 3, currentInstallment: 2 })] });
  const next = setTransactionPaymentState(data, "three", "paid", "2026-11-17");
  assert.equal(next.cards[0].invoicePaymentsByMonth?.["2026-11"].paidAmount, 100);
  assert.equal(next.cards[0].invoicePaymentsByMonth?.["2026-10"], undefined);
  assert.deepEqual(getCardInstallmentHistory(next.transactions[0], next.cards[0], "2026-11-17").map((p) => p.status), ["overdue", "paid", "scheduled"]);
});

test("reopening one paid purchase preserves the other purchases and invoices", () => {
  const otherPayment = { totalAmount: 90, paidAmount: 90, paymentDate: "2026-11-17" };
  const data = profile({ cards: [{ ...card, invoicePaid: true, invoicePaidByMonth: { "2026-10": true, "2026-11": true }, invoicePaymentsByMonth: { "2026-10": { totalAmount: 300, paidAmount: 300, paymentDate: "2026-10-17" }, "2026-11": otherPayment } }], transactions: [purchase("a", -100, { paymentStatus: "paid", paymentDate: "2026-10-17" }), purchase("b", -200, { paymentStatus: "paid" }), purchase("next", -90, { cardInvoiceMonth: "2026-11", paymentStatus: "paid" })] });
  const snapshot = structuredClone(data);
  const next = setTransactionPaymentState(data, "a", "pending", "2026-10-18");
  assert.equal(next.cards[0].invoicePaidByMonth?.["2026-10"], false);
  assert.equal(next.cards[0].invoicePaymentsByMonth?.["2026-10"]?.paidAmount, 200);
  assert.deepEqual(next.cards[0].invoicePaymentsByMonth?.["2026-11"], otherPayment);
  assert.equal(next.transactions[0].paymentStatus, "pending");
  assert.equal(next.transactions[0].paymentDate, undefined);
  assert.equal(getTransactionPaymentStatus(next.transactions[0], next.cards, [], "2026-10-18"), "overdue");
  assert.equal(next.transactions[1], data.transactions[1]);
  assert.equal(getTransactionPaymentStatus(next.transactions[1], next.cards, [], "2026-10-18"), "paid");
  assert.equal(next.transactions[2], data.transactions[2]);
  assert.equal(getCardBillingReminders(next.cards, next.transactions, new Date(2026, 9, 18, 12))[0].amount, 100);
  assert.deepEqual(data, snapshot);
});

test("paying one credit purchase changes only that purchase and retains the adjusted total", () => {
  const data = profile({ cards: [{ ...card, invoiceOverrideByMonth: { "2026-10": 330 }, invoicePaymentsByMonth: { "2026-10": { totalAmount: 300, paidAmount: 80, paymentDate: "2026-10-16" } } }], transactions: [purchase("a", -100), purchase("b", -200), purchase("next", -90, { cardInvoiceMonth: "2026-11" })] });
  const next = setTransactionPaymentState(data, "a", "paid", "2026-10-17");
  assert.deepEqual(next.cards[0].invoicePaymentsByMonth?.["2026-10"], { totalAmount: 330, paidAmount: 100, paymentDate: "2026-10-17" });
  assert.equal(next.cards[0].invoicePaidByMonth?.["2026-10"], false);
  assert.equal(next.transactions[0].paymentStatus, "paid");
  assert.equal(next.transactions[1], data.transactions[1]);
  assert.equal(next.transactions[2], data.transactions[2]);
});

test("regular payments remain independent and loan records cannot be changed through Transactions", () => {
  const regular = purchase("pix", -50, { cardId: undefined, cardMode: undefined, paymentMethod: "pix", note: "Minha nota", attachments: ["comprovante"] });
  const loan = purchase("loan", -100, { source: "loan" });
  const data = profile({ transactions: [regular, loan] });
  const next = setTransactionPaymentState(data, regular.id, "paid", "2026-10-17");
  assert.equal(next.transactions[0].paymentDate, "2026-10-17");
  assert.equal(next.transactions[0].note, regular.note);
  assert.deepEqual(next.transactions[0].attachments, regular.attachments);
  assert.equal(next.transactions[1], loan);
  assert.equal(next.cards, data.cards);
  assert.equal(setTransactionPaymentState(data, loan.id, "paid"), data);
  assert.equal(setTransactionPaymentState(data, "missing", "paid"), data);
});

test("invoice actions isolate personal purchases from card lending and validate the chosen month", () => {
  const loan = purchase("loan", -500, { operationType: "card" });
  const data = profile({ transactions: [purchase("chosen", -100, { date: "2026-10-11", cardInvoiceMonth: "2026-10" }), loan] });
  const next = setInvoicePaymentStatus(data, card.id, "2026-10", true, "2026-10-17");
  assert.equal(next.cards[0].invoicePaymentsByMonth?.["2026-10"]?.totalAmount, 100);
  assert.equal(next.transactions[1], loan);
  assert.equal(setInvoicePaymentStatus(data, card.id, "2026-13", true), data);
  assert.equal(setInvoicePaymentStatus(data, "missing", "2026-10", true), data);
});
