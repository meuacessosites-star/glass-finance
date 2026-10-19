import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, ProfileData } from "../src/lib/app-store";
import { sanitizeTransactions } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { adjustCardInvoice, cardHasHistory, removeUnusedCard, updateCardPreservingHistory } from "../src/lib/card-operations";
import { emptyCardStatementFilters, getCardCategoryAnalytics, getCardMonthlyAnalytics } from "../src/lib/card-analytics";
import { getCardCommittedAmount, getCardInvoiceMetrics, getCardStatementTotal, getInvoicePaymentAmount } from "../src/lib/card-invoice-view";
import { getCardBillingReminders, getTransactionInvoiceMonth, getTransactionInvoiceSchedule } from "../src/lib/card-billing";
import { recordInvoicePayment, setInvoicePaymentStatus } from "../src/lib/payment-updates";

const today = "2026-10-18";
const card: AppCard = { id: "main", name: "Principal", institution: "Banco", last4: "1234", color: "#2F6BFF", closingDay: 10, dueDay: 17, totalLimit: 1000 };
const purchase = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, amount: -amount, title: "Compra", date: "2026-10-08", categoryId: "compras", cardId: "main", cardMode: "credito", paymentMethod: "cartao", paymentStatus: "pending", ...extra });
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({ categories: [], cards: [card], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null, ...patch });
const metrics = (data: ProfileData, month = "2026-10") => getCardInvoiceMetrics(data.cards[0], data.transactions, month, today);

test("editing card identity preserves its payments, transactions and other profile data", () => {
  const data = profile({ cards: [{ ...card, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 20, paymentDate: today } } }], transactions: [purchase("x", 100, { attachments: ["proof"], note: "Minha nota" })] });
  const snapshot = structuredClone(data);
  const next = updateCardPreservingHistory(data, "main", { name: "Novo nome", brand: "visa", color: "#FFFFFF" });
  assert.equal(next.cards[0].name, "Novo nome");
  assert.equal(next.cards[0].brand, "visa");
  assert.deepEqual(metrics(next), metrics(data));
  assert.equal(next.transactions, data.transactions);
  assert.deepEqual(data, snapshot);
});

test("editing closing day anchors older purchases and their future installments to the original invoices", () => {
  const data = profile({ transactions: [purchase("x", 300, { date: "2026-10-12", recurrence: "parcelada", installments: 3 }), purchase("other", 40, { cardId: "other" })] });
  const months = getTransactionInvoiceSchedule(data.transactions[0], card).map((part) => part.month);
  const next = updateCardPreservingHistory(data, "main", { closingDay: 15 });
  assert.deepEqual(getTransactionInvoiceSchedule(next.transactions[0], next.cards[0]).map((part) => part.month), months);
  assert.equal(next.transactions[0].cardInvoiceMonth, "2026-11");
  assert.equal(next.transactions[1], data.transactions[1]);
  assert.equal(getTransactionInvoiceMonth(purchase("new", 30, { date: "2026-10-12" }), next.cards[0]), "2026-10");
});

test("saved explicit invoice choices and year-crossing installments survive editing and reload", () => {
  const data = profile({ transactions: [purchase("x", 100, { date: "2026-12-25", cardInvoiceMonth: "2027-01", recurrence: "parcelada", installments: 3 })] });
  const next = updateCardPreservingHistory(data, "main", { closingDay: 31, dueDay: 5 });
  const rows = sanitizeTransactions(JSON.parse(JSON.stringify(next.transactions)), next.cards);
  assert.deepEqual(getTransactionInvoiceSchedule(rows[0], next.cards[0]).map((part) => part.month), ["2027-01", "2027-02", "2027-03"]);
  assert.equal(rows[0].amount, -100);
});

test("raising a paid invoice preserves the actual payment and opens only the additional balance", () => {
  let data = profile({ transactions: [purchase("x", 100)] });
  data = setInvoicePaymentStatus(data, "main", "2026-10", true, today);
  const next = adjustCardInvoice(data, "main", "2026-10", 130, today);
  assert.deepEqual(metrics(next), { invoiceTotal: 130, paidAmount: 100, openAmount: 30, invoicePaid: false });
  assert.equal(getCardBillingReminders(next.cards, next.transactions, new Date(2026, 9, 18, 12))[0].amount, 30);
  assert.equal(next.transactions, data.transactions);
});

test("restoring the purchase total removes a manual override and updates a partial-payment total", () => {
  let data = profile({ transactions: [purchase("x", 100)] });
  data = adjustCardInvoice(data, "main", "2026-10", 120, today);
  data = recordInvoicePayment(data, "main", "2026-10", { totalAmount: 120, paidAmount: 30, paymentDate: today });
  const next = adjustCardInvoice(data, "main", "2026-10", undefined, today);
  assert.equal(next.cards[0].invoiceOverrideByMonth?.["2026-10"], undefined);
  assert.equal(next.cards[0].invoicePaymentsByMonth?.["2026-10"].totalAmount, 100);
  assert.deepEqual(metrics(next), { invoiceTotal: 100, paidAmount: 30, openAmount: 70, invoicePaid: false });
});

test("invoice adjustments reject invalid input and cannot erase amounts already paid", () => {
  const data = recordInvoicePayment(profile({ transactions: [purchase("x", 100)] }), "main", "2026-10", { totalAmount: 100, paidAmount: 80, paymentDate: today });
  for (const amount of [79.99, -1, Infinity, NaN, 1e308]) assert.equal(adjustCardInvoice(data, "main", "2026-10", amount, today), data);
  assert.equal(adjustCardInvoice(data, "main", "2026-13", 100, today), data);
  assert.equal(adjustCardInvoice(data, "missing", "2026-10", 100, today), data);
  assert.equal(metrics(adjustCardInvoice(data, "main", "2026-10", 100.005, today)).invoiceTotal, 100.01);
});

test("adjustments preserve unrelated invoice months, cards and loan records", () => {
  const other = { ...card, id: "other" };
  const data = profile({ cards: [{ ...card, invoiceOverrideByMonth: { "2026-11": 80 } }, other], transactions: [purchase("x", 100), purchase("loan", 999, { source: "loan" })] });
  const next = adjustCardInvoice(data, "main", "2026-10", 110, today);
  assert.equal(next.cards[0].invoiceOverrideByMonth?.["2026-11"], 80);
  assert.equal(next.cards[1], other);
  assert.equal(next.transactions, data.transactions);
});

test("registering three successive suggested parcels does not keep shrinking the payment", () => {
  let data = profile({ transactions: [purchase("x", 100)] });
  const amounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const current = metrics(data);
    const amount = getInvoicePaymentAmount(current.openAmount, "installments", "", 3, current.invoiceTotal)!;
    amounts.push(amount);
    data = recordInvoicePayment(data, "main", "2026-10", { totalAmount: current.invoiceTotal, paidAmount: Math.round((current.paidAmount + amount) * 100) / 100, paymentDate: today, installments: 3 });
  }
  assert.deepEqual(amounts, [33.34, 33.34, 33.32]);
  assert.equal(metrics(data).openAmount, 0);
  assert.equal(metrics(data).invoicePaid, true);
  assert.equal(data.transactions.length, 1);
});

test("reopening a paid invoice leaves other invoice payments intact", () => {
  const data = profile({ transactions: [purchase("x", 100), purchase("future", 80, { cardInvoiceMonth: "2026-11" })] });
  const both = setInvoicePaymentStatus(setInvoicePaymentStatus(data, "main", "2026-10", true, today), "main", "2026-11", true, today);
  const reopened = setInvoicePaymentStatus(both, "main", "2026-10", false, today);
  assert.equal(metrics(reopened).openAmount, 100);
  assert.equal(metrics(reopened, "2026-11").openAmount, 0);
  assert.deepEqual(reopened.cards[0].invoicePaymentsByMonth?.["2026-11"], both.cards[0].invoicePaymentsByMonth?.["2026-11"]);
});

test("history and associated expenses reset old search/category filters to their own scope", () => {
  assert.deepEqual(emptyCardStatementFilters("all"), { query: "", category: "todas", scope: "all" });
  assert.deepEqual(emptyCardStatementFilters("month"), { query: "", category: "todas", scope: "month" });
  const rows = [purchase("x", 300, { recurrence: "parcelada", installments: 3 })];
  assert.equal(getCardStatementTotal(card, rows, "2026-10", "month"), 100);
  assert.equal(getCardStatementTotal(card, rows, "2026-10", "all"), 300);
});

test("category graphs distinguish invoice installments from whole-purchase history without loans or other cards", () => {
  const rows = [purchase("x", 100, { recurrence: "parcelada", installments: 3 }), purchase("y", 20, { categoryId: "food" }), purchase("loan", 900, { source: "loan" }), purchase("other", 900, { cardId: "other" })];
  const invoice = getCardCategoryAnalytics(card, rows, {}, "2026-10", "invoice");
  assert.equal(invoice.total, 53.34);
  assert.deepEqual(invoice.data.map((item) => item.value), [33.34, 20]);
  assert.equal(getCardCategoryAnalytics(card, rows, {}, "2026-10", "history").total, 120);
  assert.equal(getCardCategoryAnalytics(card, rows, {}, "2025-01", "invoice").total, 0);
});

test("monthly evolution includes zero months, years and the selected month despite far-future installments", () => {
  const rows = [purchase("x", 480, { recurrence: "parcelada", installments: 48 })];
  const history = getCardMonthlyAnalytics(card, rows, "2026-10", "history");
  assert.equal(history.length, 12);
  assert.deepEqual(history[0], { key: "2025-11", value: 0 });
  assert.deepEqual(history[11], { key: "2026-10", value: 10 });
  const forecast = getCardMonthlyAnalytics(card, rows, "2026-10", "forecast");
  assert.deepEqual(forecast[0], { key: "2026-10", value: 10 });
  assert.deepEqual(forecast[11], { key: "2027-09", value: 10 });
});

test("archiving and restoring retain payments, installments and the same committed balance", () => {
  const data = profile({ transactions: [purchase("x", 100, { recurrence: "parcelada", installments: 3 })] });
  const before = getCardCommittedAmount(card, data.transactions, today);
  const archived = updateCardPreservingHistory(data, "main", { archived: true });
  assert.equal(archived.cards[0].archived, true);
  assert.equal(getCardCommittedAmount(archived.cards[0], archived.transactions, today), before);
  const restored = updateCardPreservingHistory(archived, "main", { archived: false });
  assert.deepEqual(restored.transactions, data.transactions);
  assert.deepEqual(metrics(restored), metrics(data));
});

test("a card with purchases or invoice payments cannot be removed and orphan its history", () => {
  const linked = profile({ transactions: [purchase("x", 100)] });
  assert.equal(removeUnusedCard(linked, "main"), linked);
  const paid = profile({ cards: [{ ...card, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 100, paymentDate: today } } }] });
  assert.equal(cardHasHistory(paid.cards[0], []), true);
  assert.equal(removeUnusedCard(paid, "main"), paid);
  const unused = profile({ cards: [card, { ...card, id: "other" }] });
  assert.deepEqual(removeUnusedCard(unused, "main").cards.map((item) => item.id), ["other"]);
  assert.equal(unused.cards.length, 2);
});

test("adjusted and partially paid invoice remains correct after serializing and reloading", () => {
  let data = adjustCardInvoice(profile({ transactions: [purchase("x", 100)] }), "main", "2026-10", 110, today);
  data = recordInvoicePayment(data, "main", "2026-10", { totalAmount: 110, paidAmount: 40, paymentDate: today });
  const restored: ProfileData = JSON.parse(JSON.stringify(data));
  restored.transactions = sanitizeTransactions(restored.transactions, restored.cards);
  assert.equal(metrics(restored).openAmount, 70);
  assert.deepEqual(metrics(restored), metrics(data));
});

test("closing-day edits do not re-anchor legacy purchases linked to borrowed-card receivables", () => {
  const loan = purchase("linked-loan", 900, { date: "2026-10-12" });
  const receivable = { id: "r", loanId: "l", transactionId: loan.id, contact: "Pessoa", amount: 900, cardId: "main", operationType: "card" as const, status: "open" as const, createdAt: today };
  const data = profile({ transactions: [loan, purchase("personal", 100)], loanReceivables: [receivable] });
  const next = updateCardPreservingHistory(data, "main", { closingDay: 15 });
  assert.equal(next.transactions[0], loan);
  assert.equal(next.transactions[1].cardInvoiceMonth, "2026-10");
  assert.equal(next.loanReceivables, data.loanReceivables);
  assert.equal(removeUnusedCard(profile({ loanReceivables: [receivable] }), "main").cards.length, 1);
});

test("automatic invoice restoration excludes legacy loans linked by receivable ID", () => {
  const loan = purchase("linked-loan", 900);
  const receivable = { id: "r", loanId: "l", transactionId: loan.id, contact: "Pessoa", amount: 900, cardId: "main", status: "open" as const, createdAt: today };
  const data = profile({ cards: [{ ...card, invoiceOverrideByMonth: { "2026-10": 120 } }], transactions: [purchase("personal", 100), loan], loanReceivables: [receivable] });
  const next = adjustCardInvoice(data, "main", "2026-10", undefined, today);
  assert.equal(next.cards[0].invoiceOverrideByMonth?.["2026-10"], undefined);
  assert.equal(next.transactions, data.transactions);
  const adjusted = adjustCardInvoice(data, "main", "2026-10", 110, today);
  assert.equal(adjusted.cards[0].invoiceOverrideByMonth?.["2026-10"], 110);
});

test("correcting an older inconsistent override cannot discard the payment it had hidden", () => {
  const data = profile({ cards: [{ ...card, invoiceOverrideByMonth: { "2026-10": 0 }, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 80, paymentDate: today } } }], transactions: [purchase("x", 100)] });
  assert.equal(adjustCardInvoice(data, "main", "2026-10", 79, today), data);
  const corrected = adjustCardInvoice(data, "main", "2026-10", undefined, today);
  assert.equal(corrected.cards[0].invoicePaymentsByMonth?.["2026-10"].paidAmount, 80);
  assert.deepEqual(metrics(corrected), { invoiceTotal: 100, paidAmount: 80, openAmount: 20, invoicePaid: false });
});
