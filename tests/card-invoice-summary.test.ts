import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, LoanReceivable, ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { getBorrowedCardAnalyticsTransactions, getBorrowedCardInvoiceMetrics, getBorrowedCardParts, getInvoiceSummary, getScopedCommittedAmount, getScopedInvoiceMetrics, getScopedInvoiceMonths, recordScopedInvoicePayment, setScopedInvoiceStatus } from "../src/lib/card-invoice-summary";
import { setTransactionPaymentState } from "../src/lib/payment-updates";
import { cardHasHistory } from "../src/lib/card-operations";
import { getCardCategoryAnalytics, getCardMonthlyAnalytics } from "../src/lib/card-analytics";

const today = "2026-10-19";
const card: AppCard = { id: "a", name: "A", color: "#820AD1", last4: "1234", closingDay: 10, dueDay: 17 };
const second = { ...card, id: "b", name: "B", dueDay: 25 };
const purchase = (id: string, amount: number, patch: Partial<Transaction> = {}): Transaction => ({ id, title: id, categoryId: "compras", amount: -amount, date: "2026-10-01", paymentMethod: "cartao", cardMode: "credito", cardId: "a", cardInvoiceMonth: "2026-10", paymentStatus: "pending", ...patch });
const loan = (id: string, amount: number, patch: Partial<LoanReceivable> = {}): LoanReceivable => ({ id, loanId: "loan-a", contact: "Ana", amount, cardId: "a", cardInvoiceMonth: "2026-10", cardClosingDate: "2026-10-10", dueDate: "2026-10-17", operationType: "card", collectionMode: "fixed", status: "scheduled", installment: 1, installments: 2, startDate: "2026-10-01", createdAt: "2026-10-01T12:00:00Z", ...patch });
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({ cards: [card, second], transactions: [], loanReceivables: [], categories: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null, ...patch });
const summary = (data: ProfileData, patch: Partial<Parameters<typeof getInvoiceSummary>[0]> = {}) => getInvoiceSummary({ cards: data.cards, transactions: data.transactions, receivables: data.loanReceivables, month: "2026-10", today, ...patch });
const metrics = (data: ProfileData, include = true, month = "2026-10") => getScopedInvoiceMetrics(data.cards[0], data.transactions, data.loanReceivables, month, include, today);

test("monthly summary sums all active cards in cents, excluding other months, archives and noncredit rows", () => {
  const data = profile({ cards: [card, second, { ...card, id: "old", archived: true }], transactions: [purchase("a", 0.1), purchase("b", 0.2, { cardId: "b" }), purchase("next", 500, { cardInvoiceMonth: "2026-11" }), purchase("archive", 600, { cardId: "old" }), purchase("cash", 700, { paymentMethod: "dinheiro" })] });
  assert.equal(summary(data).openAmount, 0.3);
  assert.equal(summary(data).cardCount, 2);
  assert.equal(summary(data, { month: "2026-11" }).openAmount, 500);
  assert.equal(summary(data, { cardId: "b" }).openAmount, 0.2);
});

test("status filters recompute totals from the matching invoices including partial payments", () => {
  const data = profile({ transactions: [purchase("a", 100), purchase("b", 60, { cardId: "b", paymentStatus: "paid" })], cards: [{ ...card, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 25, paymentDate: today } } }, second] });
  const open = summary(data, { status: "open" });
  assert.equal(open.invoiceTotal, 100); assert.equal(open.openAmount, 75); assert.equal(open.paidAmount, 25);
  const paid = summary(data, { status: "paid" });
  assert.equal(paid.invoiceTotal, 60); assert.equal(paid.openAmount, 0); assert.equal(paid.paidAmount, 60);
  assert.equal(summary(data).paidAmount, 85);
});

test("date-range summary uses each card's invoice due date and gives exact monthly subtotals", () => {
  const data = profile({ transactions: [purchase("a", 300, { date: "2026-08-01", recurrence: "parcelada", installments: 3 }), purchase("b", 80, { cardId: "b" })] });
  const range = summary(data, { fromDate: "2026-10-01", untilDate: "2026-11-20" });
  assert.deepEqual(range.monthly.map((row) => [row.month, row.openAmount]), [["2026-10", 180], ["2026-11", 100]]);
  assert.equal(range.openAmount, 280);
  assert.equal(summary(data, { fromDate: "2026-10-16", untilDate: "2026-10-20" }).openAmount, 100);
  assert.equal(summary(data, { fromDate: "2026-12-20", untilDate: "2026-12-30" }).invoiceTotal, 0);
});

test("month and range filters never mutate invoices, payment records or purchases", () => {
  const data = profile({ transactions: [purchase("a", 300, { recurrence: "parcelada", installments: 3 })] });
  const snapshot = structuredClone(data);
  for (const month of ["2026-09", "2026-10", "2026-11", "2026-12"]) summary(data, { month, status: "open" });
  summary(data, { fromDate: "2026-10-17", untilDate: "2026-12-17" });
  assert.deepEqual(data, snapshot);
});

test("borrowed cards are optional and each saved installment is counted once, never the original advance", () => {
  const part = loan("part", 40);
  const data = profile({ transactions: [purchase("personal", 100), purchase("original-loan", 80, { source: "loan", operationType: "card" })], loanReceivables: [part, { ...part }, loan("future", 40, { cardInvoiceMonth: "2026-11", dueDate: "2026-11-17", installment: 2 })] });
  assert.equal(summary(data).openAmount, 100);
  assert.equal(summary(data, { includeBorrowed: true }).openAmount, 140);
  assert.equal(summary(data, { includeBorrowed: true }).borrowedTotal, 40);
  assert.equal(getScopedCommittedAmount(card, data.transactions, data.loanReceivables, true, today), 180);
  assert.equal(getScopedCommittedAmount(card, data.transactions, data.loanReceivables, false, today), 100);
});

test("receiving a person's repayment never marks the bank invoice as paid", () => {
  const paidLoan = loan("paid-by-person", 50, { status: "paid", paymentDate: today, receipts: [{ id: "receipt", amount: 50, date: today, transactionId: "receipt-t" }] });
  const data = profile({ cards: [{ ...card, invoicePaid: true, invoicePaidByMonth: { "2026-10": true } }], transactions: [purchase("personal", 100, { paymentStatus: "paid" })], loanReceivables: [paidLoan] });
  assert.equal(metrics(data).invoiceTotal, 150);
  assert.equal(metrics(data).paidAmount, 100);
  assert.equal(metrics(data).openAmount, 50);
  assert.equal(metrics(data).invoicePaid, false);
});

test("money loans, unlinked legacy card loans, invalid values and other cards are never guessed into a bill", () => {
  const rows = [loan("good", 50), loan("cash", 500, { operationType: "loan" }), loan("unlinked", 500, { cardId: undefined }), loan("undated", 500, { dueDate: undefined }), loan("other", 500, { cardId: "b" }), loan("nan", NaN), loan("negative", -500)];
  assert.deepEqual(getBorrowedCardParts(card, rows).map((row) => row.id), ["good"]);
  assert.equal(getBorrowedCardInvoiceMetrics(card, rows, "2026-10").invoiceTotal, 50);
});

test("paying a combined invoice settles personal transactions and the bank cost of loans without changing receivables", () => {
  const data = profile({ transactions: [purchase("personal", 100), purchase("other-card", 40, { cardId: "b" }), purchase("future", 40, { cardInvoiceMonth: "2026-11" })], loanReceivables: [loan("loan", 50)] });
  const snapshot = structuredClone(data);
  const paid = recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 150, paidAmount: 150, paymentDate: today }, true);
  assert.equal(metrics(paid).invoicePaid, true);
  assert.equal(paid.transactions[0].paymentStatus, "paid");
  assert.equal(paid.transactions[1], data.transactions[1]); assert.equal(paid.transactions[2], data.transactions[2]);
  assert.equal(paid.cards[0].invoicePaymentsByMonth?.["2026-10"].paidAmount, 100);
  assert.equal(paid.cards[0].borrowedInvoicePaymentsByMonth?.["2026-10"].paidAmount, 50);
  assert.equal(paid.loanReceivables, data.loanReceivables);
  assert.deepEqual(data, snapshot);
});

test("partial bank payments apply to personal purchases first and only the remainder to borrowed card costs", () => {
  let data = profile({ transactions: [purchase("personal", 100)], loanReceivables: [loan("loan", 50)] });
  data = recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 150, paidAmount: 90, paymentDate: today }, true);
  assert.equal(metrics(data).openAmount, 60); assert.equal(metrics(data).borrowed.paidAmount, 0);
  data = recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 150, paidAmount: 125, paymentDate: today }, true);
  assert.equal(metrics(data).personal.paidAmount, 100); assert.equal(metrics(data).borrowed.paidAmount, 25); assert.equal(metrics(data).openAmount, 25);
  const restored: ProfileData = JSON.parse(JSON.stringify(data));
  assert.deepEqual(metrics(restored), metrics(data));
  assert.equal(recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 150, paidAmount: 125, paymentDate: today }, true), data);
});

test("paying personal transactions individually cannot settle the borrowed part of the bank invoice", () => {
  const data = profile({ transactions: [purchase("personal", 100)], loanReceivables: [loan("loan", 50)] });
  const paid = setTransactionPaymentState(data, "personal", "paid", today);
  assert.equal(metrics(paid).invoicePaid, false); assert.equal(metrics(paid).openAmount, 50);
  assert.equal(metrics(paid, false).invoicePaid, true);
  assert.equal(paid.loanReceivables, data.loanReceivables);
});

test("reopening a combined invoice changes only the selected card/month and preserves all person receipts", () => {
  const receipt = { id: "receipt", amount: 50, date: today, transactionId: "receipt-t" };
  let data = profile({ transactions: [purchase("personal", 100)], loanReceivables: [loan("loan", 50, { status: "paid", receipts: [receipt] })] });
  data = setScopedInvoiceStatus(data, "a", "2026-10", true, true, today);
  data.cards[0] = { ...data.cards[0], borrowedInvoicePaymentsByMonth: { ...data.cards[0].borrowedInvoicePaymentsByMonth, "2026-11": { totalAmount: 20, paidAmount: 20, paymentDate: today } } };
  const open = setScopedInvoiceStatus(data, "a", "2026-10", false, true, today);
  assert.equal(metrics(open).openAmount, 150);
  assert.equal(open.cards[0].borrowedInvoicePaymentsByMonth?.["2026-10"], undefined);
  assert.equal(open.cards[0].borrowedInvoicePaymentsByMonth?.["2026-11"].paidAmount, 20);
  assert.equal(open.loanReceivables, data.loanReceivables); assert.deepEqual(open.loanReceivables[0].receipts, [receipt]);
  assert.equal(open.cards[1], data.cards[1]);
});

test("personal-only payment and reopening never erase previously paid borrowed invoices", () => {
  const payment = { totalAmount: 50, paidAmount: 50, paymentDate: today };
  const data = profile({ cards: [{ ...card, borrowedInvoicePaymentsByMonth: { "2026-10": payment } }], transactions: [purchase("personal", 100)], loanReceivables: [loan("loan", 50)] });
  const paid = recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 100, paidAmount: 100, paymentDate: today }, false);
  assert.equal(metrics(paid).openAmount, 0);
  const open = setScopedInvoiceStatus(paid, "a", "2026-10", false, false, today);
  assert.equal(metrics(open).openAmount, 100); assert.equal(open.cards[0].borrowedInvoicePaymentsByMonth?.["2026-10"], payment);
});

test("borrowed-only invoices support exact-cent partial payments and reserve only the unpaid card limit", () => {
  let data = profile({ loanReceivables: [loan("one", 33.34), loan("two", 33.33, { cardInvoiceMonth: "2026-11", dueDate: "2026-11-17", installment: 2 }), loan("three", 33.33, { cardInvoiceMonth: "2026-12", dueDate: "2026-12-17", installment: 3 })] });
  data = recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 33.34, paidAmount: 10.01, paymentDate: today }, true);
  assert.equal(metrics(data).openAmount, 23.33);
  assert.equal(getScopedCommittedAmount(data.cards[0], [], data.loanReceivables, true, today), 89.99);
  assert.equal(data.transactions.length, 0);
  assert.equal(summary(data, { includeBorrowed: true, fromDate: "2026-10-01", untilDate: "2026-12-31" }).invoiceTotal, 100);
});

test("bank payment history for borrowed cards prevents destructive card removal even after loan rows disappear", () => {
  assert.equal(cardHasHistory({ ...card, borrowedInvoicePaymentsByMonth: { "2026-10": { totalAmount: 50, paidAmount: 50, paymentDate: today } } }, [], []), true);
});

test("borrowed-card chart projections retain categories and actual invoice months without creating ledger entries", () => {
  const parts = [loan("one", 40, { transactionId: "return-one" }), loan("two", 60, { cardInvoiceMonth: "2026-11", dueDate: "2026-11-17", transactionId: "return-two" })];
  const rows = [purchase("return-one", 40, { amount: 40, categoryId: "saude", source: "loan" }), purchase("return-two", 60, { amount: 60, categoryId: "saude", source: "loan" })];
  const before = structuredClone({ parts, rows });
  const projection = getBorrowedCardAnalyticsTransactions(card, parts, rows);
  assert.equal(getCardCategoryAnalytics(card, projection, {}, "2026-10", "invoice").total, 40);
  assert.equal(getCardCategoryAnalytics(card, projection, {}, "2026-10", "history").data[0].categoryId, "saude");
  assert.deepEqual(getCardMonthlyAnalytics(card, projection, "2026-10", "forecast").slice(0, 2).map((row) => row.value), [40, 60]);
  assert.deepEqual({ parts, rows }, before);
});

test("invalid combined payment data and unknown cards do not change saved balances", () => {
  const data = profile({ loanReceivables: [loan("loan", 50)] });
  for (const patch of [{ paidAmount: NaN }, { paidAmount: -10 }, { totalAmount: -20 }, { paymentDate: "2026-02-31" }]) {
    assert.equal(recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 50, paidAmount: 50, paymentDate: today, ...patch }, true), data);
  }
  assert.equal(recordScopedInvoicePayment(data, "missing", "2026-10", { totalAmount: 50, paidAmount: 50, paymentDate: today }, true), data);
  assert.equal(setScopedInvoiceStatus(data, "a", "invalid", false, true, today), data);
});


test("month options ignore money loans and incomplete legacy records when borrowed cards are included", () => {
  const rows = [loan("money", 500, { operationType: "loan", cardId: undefined, cardInvoiceMonth: undefined }), loan("legacy", 500, { cardId: undefined, cardInvoiceMonth: undefined }), loan("valid", 50), loan("future", 60, { cardInvoiceMonth: "2026-11", dueDate: "2026-11-17" })];
  assert.deepEqual(getScopedInvoiceMonths([card], [], rows, true), ["2026-11", "2026-10"]);
  assert.deepEqual(getScopedInvoiceMonths([card], [], rows, false), []);
  assert.deepEqual(getScopedInvoiceMonths([{ ...card, borrowedInvoicePaymentsByMonth: { "2026-13": { totalAmount: 50, paidAmount: 10, paymentDate: today } } }], [], [], true), []);
});

test("multiple selected months sum only those invoices, excluding gaps and duplicate selections", () => {
  const data = profile({ transactions: [purchase("split", 100, { recurrence: "parcelada", installments: 3 }), purchase("second", 25, { cardId: "b", cardInvoiceMonth: "2026-12" })] });
  const value = summary(data, { months: ["2026-12", "2026-10", "2026-10", "bad"] });
  assert.equal(value.invoiceTotal, 91.67);
  assert.equal(value.openAmount, 91.67);
  assert.equal(value.cardCount, 2);
  assert.deepEqual(value.monthly.map((row) => row.month), ["2026-10", "2026-12"]);
  assert.deepEqual(summary(data, { months: ["2026-10"] }), summary(data));
});

test("multiple months retain invoice status and borrowed-card scope across years", () => {
  const data = profile({ transactions: [purchase("dec", 40, { cardInvoiceMonth: "2026-12", paymentStatus: "paid" }), purchase("jan", 900, { cardInvoiceMonth: "2027-01" }), purchase("feb", 60, { cardInvoiceMonth: "2027-02" })], loanReceivables: [loan("borrowed", 25, { cardInvoiceMonth: "2027-02", dueDate: "2027-02-17" })] });
  const selection = { months: ["2026-12", "2027-02"] };
  assert.equal(summary(data, selection).invoiceTotal, 100);
  assert.equal(summary(data, { ...selection, status: "paid" }).paidAmount, 40);
  assert.equal(summary(data, { ...selection, status: "open", includeBorrowed: true }).openAmount, 85);
});

test("an explicit due-date range takes precedence over the retained month selection", () => {
  const data = profile({ transactions: [purchase("split", 300, { recurrence: "parcelada", installments: 3 })] });
  assert.deepEqual(summary(data, { months: ["2026-10", "2026-12"], fromDate: "2026-11-01", untilDate: "2026-11-30" }).monthly.map((row) => [row.month, row.invoiceTotal]), [["2026-11", 100]]);
});

test("consulting several months never broadens the invoice being paid", () => {
  const data = profile({ transactions: [purchase("split", 300, { recurrence: "parcelada", installments: 3 })] });
  const snapshot = structuredClone(data);
  assert.equal(summary(data, { months: ["2026-10", "2026-12"] }).openAmount, 200);
  const next = recordScopedInvoicePayment(data, "a", "2026-10", { totalAmount: 100, paidAmount: 100, paymentDate: today });
  assert.equal(metrics(next, false, "2026-10").openAmount, 0);
  assert.equal(metrics(next, false, "2026-12").openAmount, 100);
  assert.equal(summary(next, { months: ["2026-10", "2026-12"] }).openAmount, 100);
  assert.deepEqual(data, snapshot);
});
