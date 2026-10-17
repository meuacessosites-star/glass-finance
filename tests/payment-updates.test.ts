import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { setInvoicePaymentStatus, setTransactionPaymentState } from "../src/lib/payment-updates";
import { getCardBillingReminders } from "../src/lib/card-billing";
import { getTransactionPaymentStatus } from "../src/lib/transaction-status";

const card: AppCard = { id: "card", name: "Cartão", last4: "1234", color: "#000000", closingDay: 10, dueDay: 17 };
const purchase = (id: string, amount: number, patch: Partial<Transaction> = {}): Transaction => ({ id, title: id, categoryId: "compras", amount, date: "2026-10-05", paymentMethod: "cartao", cardMode: "credito", cardId: card.id, paymentStatus: "pending", ...patch });
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({ categories: [], cards: [card], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null, ...patch });

test("reopening an invoice clears its prior payment and makes its own purchases pending again", () => {
  const otherPayment = { totalAmount: 90, paidAmount: 90, paymentDate: "2026-11-17" };
  const data = profile({ cards: [{ ...card, invoicePaid: true, invoicePaidByMonth: { "2026-10": true, "2026-11": true }, invoicePaymentsByMonth: { "2026-10": { totalAmount: 300, paidAmount: 300, paymentDate: "2026-10-17" }, "2026-11": otherPayment } }], transactions: [purchase("a", -100, { paymentStatus: "paid", paymentDate: "2026-10-17" }), purchase("b", -200, { paymentStatus: "paid" }), purchase("next", -90, { cardInvoiceMonth: "2026-11", paymentStatus: "paid" })] });
  const snapshot = structuredClone(data);
  const next = setTransactionPaymentState(data, "a", "pending", "2026-10-18");
  assert.equal(next.cards[0].invoicePaidByMonth?.["2026-10"], false);
  assert.equal(next.cards[0].invoicePaymentsByMonth?.["2026-10"], undefined);
  assert.deepEqual(next.cards[0].invoicePaymentsByMonth?.["2026-11"], otherPayment);
  for (const item of next.transactions.slice(0, 2)) {
    assert.equal(item.paymentStatus, "pending");
    assert.equal(item.paymentDate, undefined);
    assert.equal(getTransactionPaymentStatus(item, next.cards, [], "2026-10-18"), "overdue");
  }
  assert.equal(next.transactions[2], data.transactions[2]);
  assert.equal(getCardBillingReminders(next.cards, next.transactions, new Date(2026, 9, 18, 12))[0].amount, 300);
  assert.deepEqual(data, snapshot);
});

test("paying from a credit purchase settles that invoice with its adjusted total and local date", () => {
  const data = profile({ cards: [{ ...card, invoiceOverrideByMonth: { "2026-10": 330 }, invoicePaymentsByMonth: { "2026-10": { totalAmount: 300, paidAmount: 80, paymentDate: "2026-10-16" } } }], transactions: [purchase("a", -100), purchase("b", -200), purchase("next", -90, { cardInvoiceMonth: "2026-11" })] });
  const next = setTransactionPaymentState(data, "a", "paid", "2026-10-17");
  assert.deepEqual(next.cards[0].invoicePaymentsByMonth?.["2026-10"], { totalAmount: 330, paidAmount: 330, paymentDate: "2026-10-17" });
  assert.equal(next.cards[0].invoicePaidByMonth?.["2026-10"], true);
  assert.ok(next.transactions.slice(0, 2).every((item) => item.paymentStatus === "paid" && item.paymentDate === "2026-10-17"));
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
