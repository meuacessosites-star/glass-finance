import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { getCardCommittedAmount, getCardHeaderForeground, getCardInvoiceMetrics, getCardInvoiceStatus, getCardStatementTotal, getInvoicePaymentAmount, getSelectedInvoiceParts, parseInvoiceMoney, selectCardPurchases } from "../src/lib/card-invoice-view";
import { getCardBillingReminders } from "../src/lib/card-billing";

const today = "2026-10-18";
const card: AppCard = { id: "a", name: "Principal", last4: "1234", color: "#2F6BFF", closingDay: 10, dueDay: 17, totalLimit: 1000 };
const purchase = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, title: "Compra", amount: -amount, categoryId: "compras", date: "2026-10-08", cardId: "a", cardMode: "credito", paymentMethod: "cartao", paymentStatus: "pending", ...extra });

test("selected statement months display each selected installment once, with exact cents and no gap month", () => {
  const row = purchase("split", 100, { recurrence: "parcelada", installments: 3 });
  const months = ["2026-10", "2026-12", "2026-10"];
  const parts = getSelectedInvoiceParts(row, card, "2026-10", null, null, months);
  assert.deepEqual(parts.map((part) => [part.number, part.month, part.amount]), [[1, "2026-10", 33.34], [3, "2026-12", 33.33]]);
  assert.equal(getCardStatementTotal(card, [row], "2026-10", "month", null, null, months), 66.67);
  assert.equal(getCardStatementTotal(card, [row], "2026-10", "all", null, null, months), 100);
});

test("a single selected month preserves the original statement, while changing scope is explicit", () => {
  const row = purchase("split", 300, { recurrence: "parcelada", installments: 3 });
  assert.deepEqual(getSelectedInvoiceParts(row, card, "2026-10"), getSelectedInvoiceParts(row, card, "2026-10", null, null, ["2026-10"]));
  assert.equal(getCardStatementTotal(card, [row], "2026-10", "month", null, null, ["2026-11"]), 100);
  assert.equal(getCardStatementTotal(card, [row], "2026-10", "month", null, null, ["2025-01", "invalid"]), 0);
  assert.equal(getCardStatementTotal(card, [row], "2026-10", "all"), 300);
});

test("statement date ranges use due dates even when a separate selection is retained", () => {
  const row = purchase("split", 300, { recurrence: "parcelada", installments: 3 });
  const parts = getSelectedInvoiceParts(row, card, "2026-10", "2026-11-01", "2026-11-30", ["2026-10", "2026-12"]);
  assert.deepEqual(parts.map((part) => part.month), ["2026-11"]);
});

test("paid and empty invoices never acquire an overdue warning", () => {
  assert.equal(getCardInvoiceStatus(card, "2026-10", { invoicePaid: true, invoiceTotal: 100, paidAmount: 100 }, today), "paid");
  assert.equal(getCardInvoiceStatus(card, "2026-10", { invoicePaid: false, invoiceTotal: 0, paidAmount: 0 }, today), "empty");
});

test("unpaid invoice status follows its due date, with warning priority for partial payments", () => {
  const metrics = { invoicePaid: false, invoiceTotal: 100, paidAmount: 20 };
  assert.equal(getCardInvoiceStatus(card, "2026-10", metrics, "2026-10-16"), "partial");
  assert.equal(getCardInvoiceStatus(card, "2026-10", metrics, "2026-10-17"), "due");
  assert.equal(getCardInvoiceStatus(card, "2026-10", metrics, "2026-10-18"), "overdue");
  assert.equal(getCardInvoiceStatus(card, "2026-10", { ...metrics, paidAmount: 0 }, "2026-10-16"), "open");
});

test("status uses the selected invoice cycle across years and clamps dates to the month's last day", () => {
  const metrics = { invoicePaid: false, invoiceTotal: 100, paidAmount: 0 };
  const c = { ...card, closingDay: 25, dueDay: 5 };
  assert.equal(getCardInvoiceStatus(c, "2027-01", metrics, "2026-12-31"), "open");
  assert.equal(getCardInvoiceStatus(c, "2027-01", metrics, "2027-01-06"), "overdue");
  assert.equal(getCardInvoiceStatus({ ...card, dueDay: 31 }, "2027-02", metrics, "2027-02-28"), "due");
  assert.equal(getCardInvoiceStatus({ ...card, dueDay: undefined }, "2026-10", metrics, today), "open");
});

test("bank header ink keeps at least 4.5 contrast across custom colors", () => {
  const luminance = (hex: string) => [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const channel = parseInt(hex.substring(1 + index * 2, 3 + index * 2), 16) / 255;
    return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }, 0);
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const color = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    const foreground = getCardHeaderForeground(color);
    const light = Math.max(luminance(color), luminance(foreground));
    const dark = Math.min(luminance(color), luminance(foreground));
    assert.ok((light + 0.05) / (dark + 0.05) >= 4.5, `${color} with ${foreground}`);
  }
  assert.equal(getCardHeaderForeground("#FFFFFF"), "#050505");
  assert.equal(getCardHeaderForeground("#000000"), "#FFFFFF");
});

test("status and bank presentation never change the invoice amounts or saved card color", () => {
  const rows = [purchase("x", 100)];
  for (const color of ["#FFFFFF", "#FF9500", "#6B32A9", "#000000"]) {
    const c = { ...card, color };
    const before = structuredClone(c);
    const metrics = getCardInvoiceMetrics(c, rows, "2026-10", today);
    assert.equal(getCardInvoiceStatus(c, "2026-10", metrics, today), "overdue");
    getCardHeaderForeground(color);
    assert.deepEqual(getCardInvoiceMetrics(c, rows, "2026-10", today), metrics);
    assert.deepEqual(c, before);
  }
});

test("invoice totals include ordinary purchases even when their description mentions debt or collections", () => {
  const rows = [purchase("debt", 20, { title: "Pagamento de dívida", note: "Cobrança da loja" }), purchase("loan", 30, { source: "loan" }), purchase("linked", 40, { operationType: "card" }), purchase("debit", 50, { cardMode: "debito" }), purchase("bad", Infinity)];
  assert.deepEqual(selectCardPurchases(rows).map((row) => row.id), ["debt"]);
  assert.equal(getCardInvoiceMetrics(card, rows, "2026-10", today).invoiceTotal, 20);
});

test("partial payments leave only the remaining balance and agree with billing reminders", () => {
  const c: AppCard = { ...card, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 30.01, paymentDate: today } } };
  const rows = [purchase("x", 100)];
  assert.deepEqual(getCardInvoiceMetrics(c, rows, "2026-10", today), { invoiceTotal: 100, paidAmount: 30.01, openAmount: 69.99, invoicePaid: false });
  assert.equal(getCardBillingReminders([c], rows, new Date(2026, 9, 18, 12))[0].amount, 69.99);
});

test("individual paid rows and cumulative payments overlap instead of being counted twice", () => {
  const c: AppCard = { ...card, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 30, paymentDate: today } } };
  const rows = [purchase("paid", 60, { paymentStatus: "paid" }), purchase("pending", 40)];
  assert.equal(getCardInvoiceMetrics(c, rows, "2026-10", today).openAmount, 40);
  c.invoicePaymentsByMonth!["2026-10"].paidAmount = 70;
  assert.equal(getCardInvoiceMetrics(c, rows, "2026-10", today).openAmount, 30);
});

test("a paid invoice has no remaining balance or committed limit for its own month", () => {
  const c: AppCard = { ...card, invoicePaidByMonth: { "2026-10": true } };
  const rows = [purchase("x", 100)];
  assert.deepEqual(getCardInvoiceMetrics(c, rows, "2026-10", today), { invoiceTotal: 100, paidAmount: 100, openAmount: 0, invoicePaid: true });
  assert.equal(getCardCommittedAmount(c, rows, today), 0);
});

test("invoice overrides, stored totals and payment amounts are reconciled in cents", () => {
  const c: AppCard = { ...card, invoiceOverrideByMonth: { "2026-10": 75.55 }, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 25.55, paymentDate: today } } };
  assert.equal(getCardInvoiceMetrics(c, [purchase("x", 100)], "2026-10", today).openAmount, 50);
  delete c.invoiceOverrideByMonth;
  assert.equal(getCardInvoiceMetrics(c, [], "2026-10", today).openAmount, 74.45);
  c.invoiceOverrideByMonth = { "2026-10": 0 };
  assert.equal(getCardInvoiceMetrics(c, [], "2026-10", today).openAmount, 0);
});

test("a future invoice never inherits another month's paid status", () => {
  const c: AppCard = { ...card, invoicePaidByMonth: { "2026-10": true } };
  const rows = [purchase("x", 100, { recurrence: "parcelada", installments: 3 })];
  assert.equal(getCardInvoiceMetrics(c, rows, "2026-10", today).openAmount, 0);
  assert.equal(getCardInvoiceMetrics(c, rows, "2026-11", today).openAmount, 33.33);
  assert.equal(getCardCommittedAmount(c, rows, today), 66.66);
});

test("card commitment includes previous and future invoices and releases actual payments only", () => {
  const rows = [purchase("old", 40, { date: "2026-09-08" }), purchase("split", 100, { recurrence: "parcelada", installments: 3 }), purchase("other", 999, { cardId: "b" })];
  const c: AppCard = { ...card, invoicePaymentsByMonth: { "2026-10": { totalAmount: 33.34, paidAmount: 10, paymentDate: today } } };
  assert.equal(getCardCommittedAmount(c, rows, today), 130);
  assert.equal(getCardInvoiceMetrics(c, rows, "2026-10", today).openAmount, 23.34);
});

test("statement date ranges across months do not change monthly invoice or payment totals", () => {
  const rows = [purchase("x", 100, { recurrence: "parcelada", installments: 3 })];
  const before = getCardInvoiceMetrics(card, rows, "2026-10", today);
  assert.equal(getCardStatementTotal(card, rows, "2026-10", "month", "2026-11-01", "2026-12-31"), 66.66);
  assert.equal(getCardStatementTotal(card, rows, "2026-10", "month", "2026-10-01", "2026-10-10"), 0);
  assert.deepEqual(getCardInvoiceMetrics(card, rows, "2026-10", today), before);
  assert.equal(before.invoiceTotal, 33.34);
});

test("statement sums only visible matching rows and history counts the original purchase once", () => {
  const rows = [purchase("x", 100, { recurrence: "parcelada", installments: 3 }), purchase("y", 50)];
  assert.equal(getCardStatementTotal(card, rows.slice(0, 1), "2026-10", "month"), 33.34);
  assert.equal(getCardStatementTotal(card, rows.slice(0, 1), "2026-10", "all"), 100);
  assert.equal(getCardStatementTotal(card, [], "2026-10", "all"), 0);
});

test("Brazilian values and decimal points retain their exact intended currency", () => {
  for (const [input, expected] of [["123.45", 123.45], ["123,45", 123.45], ["1.234,56", 1234.56], [" 20,50 ", 20.5], ["0", 0], ["1.000", 1000]] as const)
    assert.equal(parseInvoiceMoney(input), expected, input);
  for (const input of ["", "-1", "abc", "12,345", "1.2.3", "1e3", "1,2,3", "Infinity"])
    assert.equal(parseInvoiceMoney(input), null, input);
});

test("partial payments reject invalid, zero and excess amounts rather than silently capping", () => {
  for (const input of ["0", "", "100,01", "-2", "abc"])
    assert.equal(getInvoicePaymentAmount(100, "partial", input, 3), null, input);
  assert.equal(getInvoicePaymentAmount(100, "partial", "30.01", 3), 30.01);
  assert.equal(getInvoicePaymentAmount(100, "full", "", 3), 100);
  assert.equal(getInvoicePaymentAmount(0, "full", "", 3), null);
});

test("installment payment uses whole cents and rejects invalid counts", () => {
  assert.equal(getInvoicePaymentAmount(100, "installments", "", 3), 33.34);
  assert.equal(getInvoicePaymentAmount(0.01, "installments", "", 48), 0.01);
  for (const count of [0, 1, 2.5, 49, NaN]) assert.equal(getInvoicePaymentAmount(100, "installments", "", count), null);
});

test("view calculations never edit card data, status or purchase schedules", () => {
  const rows = [purchase("x", 100, { recurrence: "parcelada", installments: 3 })];
  const before = structuredClone({ card, rows });
  getCardInvoiceMetrics(card, rows, "2026-10", today);
  getCardCommittedAmount(card, rows, today);
  getCardStatementTotal(card, rows, "2026-10", "all");
  assert.deepEqual({ card, rows }, before);
});
