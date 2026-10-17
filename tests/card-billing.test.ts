import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarDate, getCardBillingCycle, getCardBillingChoices, getInvoiceDates, getCardBillingReminders, getInvoicePartsInPeriod, getTransactionBillingCycle, getTransactionInvoiceAmount, getTransactionInvoiceMonth, getTransactionInvoiceSchedule, localDateKey, sanitizeInvoiceMonth } from "../src/lib/card-billing";
import { getDueTodayAlerts } from "../src/lib/due-today";
import { createDemoProfile, installDemoExamples, DEMO_PROFILE_ID } from "../src/lib/demo-examples";
import type { AppCard, ProfileData } from "../src/lib/app-store";
import { sanitizeTransactions } from "../src/lib/app-store";
import { getTransactionPaymentStatus } from "../src/lib/transaction-status";
import type { Transaction } from "../src/lib/mock-data";

const card = (id = "a", closingDay = 10, dueDay = 17): AppCard => ({ id, name: id, last4: "1234", color: "#2F6BFF", closingDay, dueDay });
const purchase = (id: string, cardId: string, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, cardId, date, title: "Compra", categoryId: "compras", amount: -100, paymentMethod: "cartao", cardMode: "credito", paymentStatus: "pending", ...extra });
const now = new Date(2026, 9, 17, 12);
const emptyData = (): ProfileData => ({ categories: [], cards: [], transactions: [], loanReceivables: [], people: [], reserves: [], reservesInBalance: true, notifications: [], financings: [], financingsInFlow: false, showCategoryNameOnCard: true, goals: [], pin: null });

test("installment invoice totals and reminder balances share exact cents across future months", () => {
  const t = purchase("installments", "a", "2026-10-08", { recurrence: "parcelada", installments: 3 });
  const snapshot = structuredClone(t);
  const parts = getTransactionInvoiceSchedule(t, card());
  assert.deepEqual(parts.map((p) => [p.month, p.amount]), [["2026-10", 33.34], ["2026-11", 33.33], ["2026-12", 33.33]]);
  assert.deepEqual(parts.map((p) => getTransactionInvoiceAmount(t, card(), p.month)), [33.34, 33.33, 33.33]);
  assert.deepEqual(getCardBillingReminders([card()], [t], now).map((r) => r.amount), [33.34, 33.33, 33.33]);
  assert.deepEqual(getInvoicePartsInPeriod(t, card(), "2026-10", "2026-11-01", "2026-12-17").map((p) => p.number), [2, 3]);
  assert.equal(getTransactionInvoiceAmount(t, card(), "2027-01"), 0);
  assert.deepEqual(t, snapshot);
});

test("a missing credit payment status stays unpaid before and after reloading", () => {
  const t = purchase("approved", "a", "2026-10-08", { paymentStatus: undefined });
  assert.equal(getTransactionPaymentStatus(t, [card()], [], "2026-10-17"), "pending");
  assert.equal(getCardBillingReminders([card()], [t], now)[0].amount, 100);
  const reloaded = sanitizeTransactions([t], [card()])[0];
  assert.equal(reloaded.paymentStatus, "pending");
  assert.equal(getTransactionPaymentStatus(reloaded, [card()], [], "2026-10-17"), "pending");
  assert.deepEqual(getCardBillingReminders([card()], [reloaded], now), getCardBillingReminders([card()], [t], now));
});

test("purchases on either side of closing are billed to the correct month", () => {
  assert.deepEqual(getCardBillingCycle(card(), "2026-10-10"), { closingDate: "2026-10-10", dueDate: "2026-10-17", month: "2026-10" });
  assert.deepEqual(getCardBillingCycle(card(), "2026-10-11"), { closingDate: "2026-11-10", dueDate: "2026-11-17", month: "2026-11" });
  assert.equal(getTransactionInvoiceMonth(purchase("x", "a", "2026-10-11"), card()), "2026-11");
});

test("December and due dates in the following month cross the year correctly", () => {
  assert.deepEqual(getCardBillingCycle(card("a", 25, 5), "2026-12-24"), { closingDate: "2026-12-25", dueDate: "2027-01-05", month: "2027-01" });
  assert.deepEqual(getCardBillingCycle(card("a", 25, 5), "2026-12-26"), { closingDate: "2027-01-25", dueDate: "2027-02-05", month: "2027-02" });
});

test("after closing, both offered invoices use that card's actual closing and due dates", () => {
  assert.deepEqual(getCardBillingChoices(card(), "2026-10-11"), {
    current: { closingDate: "2026-10-10", dueDate: "2026-10-17", month: "2026-10" },
    next: { closingDate: "2026-11-10", dueDate: "2026-11-17", month: "2026-11" },
  });
  assert.deepEqual(getCardBillingChoices(card("b", 25, 5), "2026-12-26"), {
    current: { closingDate: "2026-12-25", dueDate: "2027-01-05", month: "2027-01" },
    next: { closingDate: "2027-01-25", dueDate: "2027-02-05", month: "2027-02" },
  });
  for (const date of ["2026-10-01", "2026-10-10", "2026-02-30"]) assert.equal(getCardBillingChoices(card(), date), null);
  assert.equal(getCardBillingChoices({ closingDay: 10 }, "2026-10-11"), null);
  assert.equal(getCardBillingChoices(card("b", 31, 10), "2027-02-28"), null);
});

test("a saved invoice choice survives reload and unrelated edits without changing the purchase date", () => {
  const choices = getCardBillingChoices(card(), "2026-10-11")!;
  for (const cycle of [choices.current, choices.next]) {
    const original = purchase("chosen", "a", "2026-10-11", { cardInvoiceMonth: cycle.month });
    const reloaded = sanitizeTransactions(JSON.parse(JSON.stringify([original])), [card()])[0];
    assert.equal(reloaded.cardInvoiceMonth, cycle.month);
    assert.equal(reloaded.date, "2026-10-11");
    assert.equal(getTransactionInvoiceMonth(reloaded, card()), cycle.month);
    assert.equal(getTransactionInvoiceMonth(reloaded), cycle.month);
    const edited = { ...reloaded, title: "Título editado" };
    assert.deepEqual(getTransactionBillingCycle(edited, card()), cycle);
    const debit = sanitizeTransactions([{ ...reloaded, cardMode: "debito" }], [card()])[0];
    assert.equal(debit.cardInvoiceMonth, undefined);
    const cleared = sanitizeTransactions([{ ...reloaded, cardInvoiceMonth: undefined }], [card()])[0];
    assert.equal(getTransactionInvoiceMonth(cleared, card()), choices.next.month);
  }
});

test("invoice choices determine reminder totals and dates, independently for each card", () => {
  const cards = [card(), card("b", 25, 5)];
  const txs = [
    purchase("current", "a", "2026-10-11", { cardInvoiceMonth: "2026-10", amount: -125 }),
    purchase("next", "a", "2026-10-11", { cardInvoiceMonth: "2026-11", amount: -75 }),
    purchase("other", "b", "2026-10-26", { cardInvoiceMonth: "2026-11", amount: -200 }),
  ];
  const reminders = getCardBillingReminders(cards, txs, now);
  assert.deepEqual(reminders.map((r) => [r.cardId, r.month, r.amount, r.dueDate, r.phase]), [
    ["a", "2026-10", 125, "2026-10-17", "due"],
    ["b", "2026-11", 200, "2026-11-05", "upcoming"],
    ["a", "2026-11", 75, "2026-11-17", "upcoming"],
  ]);
  assert.equal(getDueTodayAlerts(cards, txs, [], now).length, 1);
  assert.equal(getDueTodayAlerts(cards, txs, [], new Date(2026, 10, 17, 12)).filter((a) => a.label.includes("vence hoje")).length, 1);
});

test("invalid saved months fall back safely and non-credit transactions discard invoice choices", () => {
  for (const value of [undefined, null, 202610, "2026-13", "2026-00", "2026-1", "2026-10-extra"]) {
    assert.equal(sanitizeInvoiceMonth(value), undefined);
    const t = purchase("invalid", "a", "2026-10-11", { cardInvoiceMonth: value as any });
    assert.equal(getTransactionInvoiceMonth(t, card()), "2026-11");
    assert.deepEqual(getTransactionBillingCycle(t, card()), getCardBillingCycle(card(), t.date));
    assert.equal(sanitizeTransactions([t], [card()])[0].cardInvoiceMonth, undefined);
  }
  for (const extra of [{ cardMode: "debito" }, { paymentMethod: "pix" }, { amount: 100 }, { source: "loan" as const }, { cardId: undefined }]) {
    assert.equal(sanitizeTransactions([purchase("other", "a", "2026-10-11", { cardInvoiceMonth: "2026-10", ...extra })], [card()])[0].cardInvoiceMonth, undefined);
  }
});

test("short months and leap years clamp calendar days without rolling dates", () => {
  assert.equal(getCardBillingCycle(card("a", 31, 10), "2027-02-28")?.closingDate, "2027-02-28");
  assert.equal(getCardBillingCycle(card("a", 31, 10), "2028-02-29")?.closingDate, "2028-02-29");
  assert.equal(getInvoiceDates(card("a", 10, 31), "2027-02")?.dueDate, "2027-02-28");
  assert.equal(getInvoiceDates(card("a", 10, 31), "2028-02")?.dueDate, "2028-02-29");
});

test("calculated invoice dates agree for all calendar-day combinations", () => {
  for (const year of [2027, 2028]) for (const month of [0, 1, 3, 11]) for (const closing of [1, 10, 25, 28, 30, 31]) for (const due of [1, 5, 17, 28, 30, 31]) for (const day of [1, 10, 26, 31]) {
    const date = calendarDate(year, month, day), c = card("a", closing, due);
    const cycle = getCardBillingCycle(c, date)!;
    assert.ok(cycle.closingDate >= date);
    assert.ok(cycle.dueDate >= cycle.closingDate);
    assert.deepEqual(getInvoiceDates(c, cycle.month), cycle);
  }
});

test("invalid dates or missing card settings do not invent invoice dates", () => {
  assert.equal(getCardBillingCycle({ closingDay: 10 }, "2026-10-01"), null);
  assert.equal(getCardBillingCycle(card(), "2026-02-30"), null);
  assert.equal(getCardBillingCycle(card("a", 0, 17), "2026-10-01"), null);
  assert.equal(getInvoiceDates(card(), "2026-13"), null);
});

test("separate cards alert on closing, due date and overdue dates independently", () => {
  const cards = [card("due"), card("closing", 17, 25), card("overdue", 5, 12)];
  const txs = [purchase("a", "due", "2026-10-08"), purchase("b", "closing", "2026-10-16"), purchase("c", "overdue", "2026-10-01"), purchase("d", "due", "2026-10-11")];
  const reminders = getCardBillingReminders(cards, txs, now);
  assert.equal(reminders.find((x) => x.cardId === "due" && x.month === "2026-10")?.phase, "due");
  assert.equal(reminders.find((x) => x.cardId === "closing")?.phase, "closing");
  assert.equal(reminders.find((x) => x.cardId === "overdue")?.phase, "overdue");
  assert.equal(reminders.find((x) => x.month === "2026-11")?.phase, "upcoming");
  assert.equal(getDueTodayAlerts(cards, txs, [], now).length, 3);
});

test("paid invoices, paid purchases, debit, income, loans and archived cards do not warn", () => {
  const paid = { ...card("paid"), invoicePaidByMonth: { "2026-10": true } };
  const cards = [paid, card("a"), { ...card("archived"), archived: true }];
  const txs = [purchase("paid-invoice", "paid", "2026-10-01"), purchase("paid-item", "a", "2026-10-02", { paymentStatus: "paid" }), purchase("debit", "a", "2026-10-03", { cardMode: "debito" }), purchase("income", "a", "2026-10-04", { amount: 100 }), purchase("loan", "a", "2026-10-05", { source: "loan" }), purchase("archived", "archived", "2026-10-01")];
  assert.equal(getCardBillingReminders(cards, txs, now).length, 0);
});

test("partial payments calculate only the remaining amount without double subtraction", () => {
  const partial = { ...card(), invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 30, paymentDate: "2026-10-12" } } };
  const txs = [purchase("one", "a", "2026-10-01", { amount: -60, paymentStatus: "paid" }), purchase("two", "a", "2026-10-02", { amount: -40 })];
  assert.equal(getCardBillingReminders([partial], txs, now)[0].amount, 40);
  assert.equal(getCardBillingReminders([{ ...partial, invoicePaymentsByMonth: { "2026-10": { totalAmount: 100, paidAmount: 100, paymentDate: "2026-10-12" } } }], txs, now).length, 0);
});

test("due alerts follow the requested local date, including another month", () => {
  const next = new Date(2026, 10, 17, 12);
  const txs = [purchase("next", "a", "2026-10-11")];
  assert.equal(getDueTodayAlerts([card()], txs, [], now).length, 0);
  assert.match(getDueTodayAlerts([card()], txs, [], next)[0].label, /vence hoje/);
  assert.equal(localDateKey(new Date("2026-10-17T01:00:00Z")), "2026-10-16");
});

test("examples cover the requested screens, dates and payment states", () => {
  const profile = createDemoProfile(emptyData(), now), data = profile.data;
  assert.ok(data.transactions.some((t) => t.amount > 0 && t.paymentStatus === "pending"));
  assert.ok(data.transactions.some((t) => t.amount > 0 && t.paymentStatus === "paid"));
  for (const method of ["cartao", "pix", "dinheiro", "boleto"]) assert.ok(data.transactions.some((t) => t.paymentMethod === method));
  assert.ok(data.loanReceivables.some((x) => x.status === "paid"));
  assert.ok(data.loanReceivables.some((x) => x.operationType === "card"));
  const phases = new Set(getCardBillingReminders(data.cards, data.transactions, now).map((x) => x.phase));
  for (const phase of ["closing", "due", "overdue", "upcoming"]) assert.ok(phases.has(phase as any));
});

test("examples preserve prior data and only select the demonstration profile once", () => {
  const previous = { profiles: [{ ...createDemoProfile(emptyData(), now), id: "my-profile", name: "Meu perfil" }], activeProfileId: "my-profile", exampleDataVersion: 0 };
  const snapshot = structuredClone(previous);
  const installed = installDemoExamples(previous, emptyData(), now);
  assert.deepEqual(previous, snapshot);
  assert.deepEqual(installed.profiles[0], snapshot.profiles[0]);
  assert.equal(installed.activeProfileId, DEMO_PROFILE_ID);
  assert.equal(installed.profiles.length, 2);
  const selected = { ...installed, activeProfileId: "my-profile" };
  assert.equal(installDemoExamples(selected, emptyData(), now), selected);
});
