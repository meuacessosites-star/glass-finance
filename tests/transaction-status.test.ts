import { test } from "node:test";
import assert from "node:assert/strict";
import { getTransactionDueDate, getTransactionPaymentStatus, matchesPaymentStatusFilter, sanitizeDueDate } from "../src/lib/transaction-status";
import { sanitizeTransactions, type AppCard, type LoanReceivable, type ProfileData } from "../src/lib/app-store";
import { createDemoProfile, createOverdueExample, DEMO_PROFILE_ID, installDemoExamples, OVERDUE_DEMO_ID } from "../src/lib/demo-examples";
import { getDueTodayAlerts } from "../src/lib/due-today";
import type { Transaction } from "../src/lib/mock-data";

const today = "2026-10-17";
const now = new Date(2026, 9, 17, 12);
const card: AppCard = { id: "card", name: "Cartão", last4: "1234", color: "#000", closingDay: 10, dueDay: 17 };
const bill = (patch: Partial<Transaction> = {}): Transaction => ({ id: "bill", title: "Conta", categoryId: "moradia", date: "2026-10-01", dueDate: today, amount: -100, paymentMethod: "boleto", paymentStatus: "pending", ...patch });
const base: ProfileData = { categories: [], cards: [], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null };

test("bills become overdue only after the due date, and paying removes the overdue state", () => {
  assert.equal(getTransactionPaymentStatus(bill(), [], [], today), "pending");
  assert.equal(getTransactionPaymentStatus(bill(), [], [], "2026-10-18"), "overdue");
  assert.equal(getTransactionPaymentStatus(bill({ dueDate: "2026-10-18" }), [], [], today), "pending");
  assert.equal(getTransactionPaymentStatus(bill({ dueDate: "2026-10-16" }), [], [], today), "overdue");
  assert.equal(getTransactionPaymentStatus(bill({ dueDate: "2026-10-16", paymentStatus: "paid" }), [], [], today), "paid");
  assert.equal(getTransactionPaymentStatus(bill({ dueDate: undefined }), [], [], today), "overdue");
});

test("the chosen card invoice controls overdue status rather than the purchase date", () => {
  const purchase = bill({ date: "2026-10-11", cardId: card.id, cardMode: "credito", paymentMethod: "cartao", dueDate: "2026-10-01" });
  assert.equal(getTransactionDueDate(purchase, [card]), "2026-11-17");
  assert.equal(getTransactionPaymentStatus(purchase, [card], [], "2026-10-18"), "pending");
  const currentInvoice = { ...purchase, cardInvoiceMonth: "2026-10" };
  assert.equal(getTransactionPaymentStatus(currentInvoice, [card], [], "2026-10-18"), "overdue");
  assert.equal(getTransactionPaymentStatus(currentInvoice, [{ ...card, invoicePaidByMonth: { "2026-10": true } }], [], "2026-10-18"), "paid");
  assert.equal(getTransactionPaymentStatus({ ...currentInvoice, paymentStatus: "paid" }, [card], [], "2026-10-18"), "paid");
  assert.equal(getTransactionPaymentStatus(purchase, [{ ...card, dueDay: undefined }], [], "2026-10-18"), "pending");
});

test("scheduled loan receipts remain unpaid until received; debts without due dates do not become overdue", () => {
  const receivable: LoanReceivable = { id: "receipt", transactionId: "linked", loanId: "loan", contact: "Pessoa", amount: 100, status: "scheduled", dueDate: "2026-10-16", operationType: "loan", createdAt: "2026-10-01" };
  for (const id of ["linked", "loan-receivable-receipt"]) {
    const transaction = bill({ id, amount: 100, source: "loan", paymentStatus: undefined });
    assert.equal(getTransactionPaymentStatus(transaction, [], [receivable], today), "overdue");
    assert.equal(getTransactionPaymentStatus(transaction, [], [{ ...receivable, dueDate: today }], today), "pending");
    assert.equal(getTransactionPaymentStatus(transaction, [], [{ ...receivable, status: "paid" }], today), "paid");
    assert.equal(getTransactionPaymentStatus(transaction, [], [{ ...receivable, status: "open", dueDate: undefined }], today), "pending");
  }
});

test("the overdue filter isolates expired bills while pending includes every unpaid bill", () => {
  const statuses = ["paid", "pending", "overdue"] as const;
  assert.deepEqual(statuses.filter((s) => matchesPaymentStatusFilter(s, "all")), statuses);
  assert.deepEqual(statuses.filter((s) => matchesPaymentStatusFilter(s, "paid")), ["paid"]);
  assert.deepEqual(statuses.filter((s) => matchesPaymentStatusFilter(s, "pending")), ["pending", "overdue"]);
  assert.deepEqual(statuses.filter((s) => matchesPaymentStatusFilter(s, "overdue")), ["overdue"]);
});

test("due dates survive saving, reloading and editing; malformed calendar dates are rejected", () => {
  const original = bill({ date: "2026-10-15", dueDate: "2026-10-20" });
  const reloaded = sanitizeTransactions(JSON.parse(JSON.stringify([original])))[0];
  const edited = { ...reloaded, title: "Conta editada" };
  assert.equal(edited.dueDate, "2026-10-20");
  assert.equal(getTransactionPaymentStatus(edited, [], [], today), "pending");
  for (const invalid of [undefined, null, 20261020, "2026-02-30", "2026-13-01", "2026-1-01", "2026-10-20-extra"]) assert.equal(sanitizeDueDate(invalid), undefined);
  assert.equal(sanitizeDueDate("2028-02-29"), "2028-02-29");
});

test("alerts use explicit due dates and include overdue bills without warning for paid or future bills", () => {
  const transactions = [bill({ id: "due" }), bill({ id: "overdue", dueDate: "2026-10-16" }), bill({ id: "future", dueDate: "2026-10-18" }), bill({ id: "paid", dueDate: "2026-10-16", paymentStatus: "paid" })];
  const alerts = getDueTodayAlerts([], transactions, [], now);
  assert.equal(alerts.length, 2);
  assert.ok(alerts.some((a) => a.id.includes("overdue") && a.label.includes("conta vencida")));
  assert.ok(alerts.some((a) => a.label.includes("vence hoje")));
});

test("the new overdue example is added once to the demonstration profile while preserving existing profiles and edits", () => {
  const personal = { ...createDemoProfile(base, now), id: "personal", name: "Meu perfil" };
  const demo = createDemoProfile(base, now);
  demo.data.transactions = [bill({ id: "my-edit", title: "Meu lançamento de teste" })];
  const state = { profiles: [personal, demo], activeProfileId: personal.id, exampleDataVersion: 1 };
  const snapshot = structuredClone(state);
  const upgraded = installDemoExamples(state, base, now);
  assert.deepEqual(state, snapshot);
  assert.equal(upgraded.activeProfileId, personal.id);
  assert.equal(upgraded.profiles[0], personal);
  assert.deepEqual(upgraded.profiles[1].data.transactions[1], demo.data.transactions[0]);
  const example = upgraded.profiles[1].data.transactions.find((t) => t.id === OVERDUE_DEMO_ID)!;
  assert.equal(getTransactionPaymentStatus(example, [], [], today), "overdue");
  assert.equal(example.date, today);
  assert.equal(installDemoExamples(upgraded, base, now), upgraded);
  const deletedDemo = { ...state, profiles: [personal] };
  assert.equal(installDemoExamples(deletedDemo, base, now).profiles.length, 1);
  assert.equal(createOverdueExample(new Date(2027, 0, 1, 12)).dueDate, "2026-12-31");
  const fresh = installDemoExamples({ profiles: [personal], activeProfileId: personal.id }, base, now);
  assert.equal(fresh.activeProfileId, DEMO_PROFILE_ID);
  assert.equal(fresh.profiles[1].data.transactions.filter((t) => t.id === OVERDUE_DEMO_ID).length, 1);
});
