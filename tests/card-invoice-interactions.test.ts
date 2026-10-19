import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { getCardInvoiceMetrics, getCardCommittedAmount } from "../src/lib/card-invoice-view";
import { getInvoiceHeaderColor } from "../src/lib/card-appearance";
import { isInvoicePartPaid, getTransactionInvoiceSchedule, sanitizeInvoicePaidPurchaseIds } from "../src/lib/card-billing";
import { getCardInstallmentHistory } from "../src/lib/card-installments";
import { getTransactionPaymentStatus } from "../src/lib/transaction-status";
import { reorderActiveCards, updateCardPreservingHistory } from "../src/lib/card-operations";
import { openUnpaidPurchaseInvoices, recordInvoicePayment, setInvoicePaymentStatus, setTransactionPaymentState } from "../src/lib/payment-updates";

const today = "2026-10-18";
const card: AppCard = { id: "main", name: "Meu cartão", institution: "Nubank", color: "#AF52DE", last4: "1234", closingDay: 10, dueDay: 17 };
const purchase = (id: string, value: number, patch: Partial<Transaction> = {}): Transaction => ({ id, title: id, categoryId: "compras", amount: -value, date: "2026-10-05", paymentMethod: "cartao", cardMode: "credito", cardId: card.id, paymentStatus: "pending", ...patch });
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({ categories: [], cards: [card], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null, ...patch });
const metrics = (data: ProfileData, month = "2026-10") => getCardInvoiceMetrics(data.cards[0], data.transactions, month, today);

test("pay purchases one by one: only the last purchase settles the invoice", () => {
  const initial = profile({ transactions: [purchase("a", 0.1), purchase("b", 0.2), purchase("c", 99.7)] });
  const snapshot = structuredClone(initial);
  let data = setTransactionPaymentState(initial, "b", "paid", today);
  assert.deepEqual(metrics(data), { invoiceTotal: 100, paidAmount: 0.2, openAmount: 99.8, invoicePaid: false });
  assert.equal(data.transactions[0], initial.transactions[0]);
  assert.equal(data.transactions[2], initial.transactions[2]);
  data = setTransactionPaymentState(data, "c", "paid", today);
  assert.equal(metrics(data).openAmount, 0.1);
  assert.equal(metrics(data).invoicePaid, false);
  data = setTransactionPaymentState(data, "a", "paid", today);
  assert.equal(metrics(data).openAmount, 0);
  assert.equal(metrics(data).invoicePaid, true);
  assert.equal(data.cards[0].invoicePaidByMonth?.["2026-10"], true);
  assert.equal(setTransactionPaymentState(data, "a", "paid", today), data);
  assert.deepEqual(initial, snapshot);
});

test("invoice payment changes this card/month, retaining other months, cards, debit and loan rows", () => {
  const other = { ...card, id: "other" };
  const rows = [purchase("chosen", 40), purchase("split", 90, { recurrence: "parcelada", installments: 3 }), purchase("next", 20, { cardInvoiceMonth: "2026-11" }), purchase("other-card", 20, { cardId: other.id }), purchase("debit", 20, { cardMode: "debito" }), purchase("loan", 20, { source: "loan" })];
  const data = profile({ cards: [card, other], transactions: rows });
  const paid = recordInvoicePayment(data, card.id, "2026-10", { totalAmount: 70, paidAmount: 70, paymentDate: today });
  assert.ok(paid.transactions.slice(0, 2).every((row) => getTransactionPaymentStatus(row, paid.cards, [], today) === "paid"));
  assert.equal(metrics(paid, "2026-11").openAmount, 50);
  for (let i = 2; i < rows.length; i++) assert.equal(paid.transactions[i], rows[i]);
  assert.equal(paid.cards[1], other);
  assert.equal(paid.transactions.length, rows.length);
});

test("reopening one purchase retains already paid future parts of other purchases", () => {
  const data = profile({ transactions: [purchase("current", 40), purchase("earlier", 90, { date: "2026-09-05", recurrence: "parcelada", installments: 3 })] });
  const paid = setInvoicePaymentStatus(data, card.id, "2026-10", true, today);
  const reopened = setTransactionPaymentState(paid, "current", "pending", today);
  assert.equal(metrics(reopened).paidAmount, 30);
  assert.equal(metrics(reopened).openAmount, 40);
  assert.equal(reopened.transactions[1], paid.transactions[1]);
  const earlier = reopened.transactions[1];
  assert.deepEqual(getCardInstallmentHistory(earlier, reopened.cards[0], today).map((part) => part.status), ["overdue", "paid", "scheduled"]);
  const restored: ProfileData = JSON.parse(JSON.stringify(reopened));
  restored.cards[0].invoicePaidPurchaseIdsByMonth = sanitizeInvoicePaidPurchaseIds(restored.cards[0].invoicePaidPurchaseIdsByMonth);
  assert.deepEqual(metrics(restored), metrics(reopened));
  assert.equal(isInvoicePartPaid(earlier, restored.cards[0], getTransactionInvoiceSchedule(earlier, card)[1], today), true);
});

test("explicitly reopening the whole invoice clears all individual purchase marks for that month", () => {
  let data = profile({ transactions: [purchase("a", 40), purchase("b", 60)] });
  data = setTransactionPaymentState(data, "a", "paid", today);
  data = setTransactionPaymentState(data, "b", "paid", today);
  data = setInvoicePaymentStatus(data, card.id, "2026-10", false, today);
  assert.equal(metrics(data).openAmount, 100);
  assert.equal(data.cards[0].invoicePaidPurchaseIdsByMonth?.["2026-10"], undefined);
  assert.ok(data.transactions.every((row) => row.paymentStatus === "pending"));
});

test("a new purchase reopens the invoice while its previously paid installments stay paid", () => {
  let data = profile({ transactions: [purchase("earlier", 90, { date: "2026-09-05", recurrence: "parcelada", installments: 3 })] });
  data = setInvoicePaymentStatus(data, card.id, "2026-10", true, today);
  const newPurchase = purchase("new", 20);
  data = openUnpaidPurchaseInvoices({ ...data, transactions: [...data.transactions, newPurchase] }, newPurchase, today);
  assert.deepEqual(metrics(data), { invoiceTotal: 50, paidAmount: 30, openAmount: 20, invoicePaid: false });
  assert.equal(getCardInstallmentHistory(data.transactions[0], data.cards[0], today)[1].status, "paid");
  data = setTransactionPaymentState(data, "new", "paid", today);
  assert.equal(metrics(data).invoicePaid, true);
});

test("mixed partial invoice payments and individual purchases never double count", () => {
  let data = profile({ transactions: [purchase("a", 60), purchase("b", 40)] });
  data = recordInvoicePayment(data, card.id, "2026-10", { totalAmount: 100, paidAmount: 30, paymentDate: today });
  data = setTransactionPaymentState(data, "a", "paid", today);
  assert.equal(metrics(data).paidAmount, 60);
  data = recordInvoicePayment(data, card.id, "2026-10", { totalAmount: 100, paidAmount: 70, paymentDate: today });
  assert.deepEqual(data.cards[0].invoicePaidPurchaseIdsByMonth?.["2026-10"], ["a"]);
  assert.equal(metrics(data).openAmount, 30);
  data = setTransactionPaymentState(data, "a", "pending", today);
  assert.equal(metrics(data).paidAmount, 10);
  assert.equal(getCardCommittedAmount(data.cards[0], data.transactions, today), 90);
});

test("manual later-installment payment stays in that month without paying another purchase", () => {
  let data = profile({ transactions: [purchase("split", 90, { recurrence: "parcelada", installments: 3, currentInstallment: 2 }), purchase("november", 10, { cardInvoiceMonth: "2026-11" })] });
  data = setTransactionPaymentState(data, "split", "paid", "2026-11-15");
  assert.equal(metrics(data, "2026-10").openAmount, 30);
  assert.deepEqual(metrics(data, "2026-11"), { invoiceTotal: 40, paidAmount: 30, openAmount: 10, invoicePaid: false });
  assert.equal(metrics(data, "2026-12").openAmount, 30);
});

test("reordering retains archived positions, unknown/new cards and every financial field", () => {
  const archived = { ...card, id: "archived", archived: true };
  const second = { ...card, id: "second", invoicePaymentsByMonth: { "2026-10": { totalAmount: 60, paidAmount: 20, paymentDate: today } } };
  const newest = { ...card, id: "new" };
  const data = profile({ cards: [card, archived, second, newest], transactions: [purchase("a", 100)] });
  const ordered = reorderActiveCards(data, ["second", "deleted", "second", "main", "archived"]);
  assert.deepEqual(ordered.cards.map((row) => row.id), ["second", "archived", "main", "new"]);
  assert.equal(ordered.cards[0], second);
  assert.equal(ordered.cards[1], archived);
  assert.equal(ordered.transactions, data.transactions);
  assert.deepEqual(data.cards.map((row) => row.id), ["main", "archived", "second", "new"]);
  assert.deepEqual(JSON.parse(JSON.stringify(ordered)).cards.map((row: AppCard) => row.id), ["second", "archived", "main", "new"]);
  assert.equal(reorderActiveCards(ordered, ["second", "main", "new"]), ordered);
});

test("collapse and strip preferences retain payments, dates, saved card color and profile isolation", () => {
  const data = profile({ transactions: [purchase("a", 100)] });
  const otherProfile = profile({ cards: [{ ...card }] });
  const saved = updateCardPreservingHistory(data, card.id, { invoiceCollapsed: true, invoiceHeaderColorMode: "bank" });
  assert.equal(saved.cards[0].invoiceCollapsed, true);
  assert.equal(saved.cards[0].color, "#AF52DE");
  assert.equal(getInvoiceHeaderColor(saved.cards[0]), "#820AD1");
  assert.equal(getInvoiceHeaderColor({ ...saved.cards[0], invoiceHeaderColorMode: "card" }), "#AF52DE");
  assert.equal(getInvoiceHeaderColor({ institution: "Inter", color: "#FF9500" }), "#FF7A00");
  assert.equal(getInvoiceHeaderColor({ institution: "Não listado", color: "#123456" }), "#123456");
  assert.equal(getInvoiceHeaderColor({ institution: "", color: "invalid" }), "#2F6BFF");
  assert.deepEqual(metrics(saved), metrics(data));
  assert.equal(saved.transactions, data.transactions);
  assert.equal(otherProfile.cards[0].invoiceCollapsed, undefined);
  assert.equal(data.cards[0].invoiceCollapsed, undefined);
});

test("monthly purchase marks sanitize imported data and survive serialization", () => {
  assert.deepEqual(sanitizeInvoicePaidPurchaseIds({ "2026-10": ["a", "a", 42, null, "", "b"], "2026-13": ["x"], bad: ["x"], "2026-11": true }), { "2026-10": ["a", "b"] });
  for (const invalid of [null, "bad", [], 42]) assert.deepEqual(sanitizeInvoicePaidPurchaseIds(invalid), {});
  const marks = { "2026-10": ["a"], "2026-11": ["b"] };
  assert.deepEqual(sanitizeInvoicePaidPurchaseIds(JSON.parse(JSON.stringify(marks))), marks);
});
