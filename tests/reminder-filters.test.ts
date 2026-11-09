import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterPaymentReminders, filterInboxMessages,
  sanitizeReminderPreferences, DEFAULT_REMINDER_PREFERENCES,
} from "../src/lib/reminder-filters";
import {
  browserReminderKey, browserReminderText, shouldSendBrowserReminder,
} from "../src/lib/browser-reminders";
import type { PaymentNotification } from "../src/lib/payment-notifications";
import type { AppNotification } from "../src/lib/app-store";

const rows: PaymentNotification[] = [
  { id: "l", kind: "loan", title: "Receber da Ana", amount: 120, date: "2026-11-09", phase: "today", receiving: true },
  { id: "t", kind: "transaction", title: "Luz", amount: 80, date: "2026-11-08", phase: "overdue" },
  { id: "f", kind: "invoice", title: "Nubank", amount: 290, date: "2026-11-12", phase: "upcoming" },
  { id: "c", kind: "invoice", title: "Inter", amount: 25, date: "2026-11-09", phase: "closing", event: "closing" },
];

test("payment filters select actual overdue and types independently", () => {
  assert.deepEqual(filterPaymentReminders(rows, { phase: "overdue", kind: "all", query: "" }).map(r=>r.id), ["t"]);
  assert.deepEqual(filterPaymentReminders(rows, { phase: "today", kind: "loan", query: "" }).map(r=>r.id), ["l"]);
  assert.deepEqual(filterPaymentReminders(rows, { phase: "upcoming", kind: "invoice", query: "" }).map(r=>r.id), ["f","c"]);
  assert.deepEqual(filterPaymentReminders(rows, { phase: "all", kind: "invoice", query: "nubank" }).map(r=>r.id), ["f"]);
});

test("payment search finds monetary values and dates in Portuguese", () => {
  assert.equal(filterPaymentReminders(rows, { phase: "all", kind: "all", query: "290,00" }).length, 1);
  assert.equal(filterPaymentReminders(rows, { phase: "all", kind: "all", query: "11/2026" }).length >= 1, true);
  assert.equal(filterPaymentReminders(rows, { phase: "all", kind: "loan", query: "nao existe" }).length, 0);
});

test("filter preferences are sanitized for persisted values and default to all", () => {
  assert.deepEqual(sanitizeReminderPreferences(undefined), DEFAULT_REMINDER_PREFERENCES);
  assert.deepEqual(sanitizeReminderPreferences({ enabled: true, phase: "bogus", kind: "x", browserEnabled: "yes" }), DEFAULT_REMINDER_PREFERENCES);
  assert.equal(sanitizeReminderPreferences({ phase: "overdue", kind: "loan", browserEnabled: true }).browserEnabled, true);
});

test("pending messages are really searched independently of approved items", () => {
  const data = {
    notifications: [
      { id: "p1", status: "pending", merchant: "Padaria", bank: "Banco Alfa", date: "2026-11-09", amount: 9 },
      { id: "p2", status: "pending", merchant: "Mercado", bank: "Banco Beta", date: "2026-11-09", amount: 90 },
      { id: "a", status: "approved", merchant: "Padaria", bank: "Banco Alfa", date: "2026-11-09", amount: 9 },
    ] as AppNotification[],
    transactions: [], loanReceivables: [], categories: [], cards: [],
  };
  assert.deepEqual(filterInboxMessages(data, "pending", "padaria").map(m=>m.id), ["p1"]);
  assert.deepEqual(filterInboxMessages(data, "approved", "padaria").map(m=>m.id), ["a"]);
});

test("browser alerts exclude future events, avoid duplicate alerts, hide financial amounts", () => {
  const today = "2026-11-09";
  assert.equal(shouldSendBrowserReminder(rows[0], today, new Set()), true);
  assert.equal(shouldSendBrowserReminder(rows[2], today, new Set()), false);
  assert.equal(shouldSendBrowserReminder(rows[0], today, new Set([browserReminderKey(rows[0], today)])), false);
  assert.equal(browserReminderText(rows[0]).includes("120"), false);
});
