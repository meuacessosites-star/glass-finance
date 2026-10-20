import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppNotification, LoanReceivable } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import {
  createHomeAlertSession,
  getHomeAlerts,
  hideHomeAlert,
  HOME_ALERT_DISPLAY_MS,
  registerHomeAlerts,
  visibleHomeAlerts,
} from "../src/lib/home-alerts";
import { getPaymentNotifications } from "../src/lib/payment-notifications";
import {
  hideHomePaymentAlerts,
  loadHomeAlertSession,
  resetHomeAlertSessions,
  saveHomeAlertSession,
} from "../src/lib/home-alert-session";

const today = "2026-10-20";
type Data = Parameters<typeof getHomeAlerts>[0];
const data = (patch: Partial<Data> = {}): Data => ({
  cards: [],
  transactions: [],
  loanReceivables: [],
  notifications: [],
  includeBorrowedCardInvoices: false,
  ...patch,
});
const transaction = (
  id: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  date: today,
  amount: -50,
  categoryId: "outros",
  paymentStatus: "pending",
  ...patch,
});
const message = (
  id: string,
  patch: Partial<AppNotification> = {},
): AppNotification => ({
  id,
  merchant: id,
  bank: "Nubank",
  date: today,
  amount: 50,
  status: "pending",
  ...patch,
});
const loan = (patch: Partial<LoanReceivable> = {}): LoanReceivable => ({
  id: "r",
  loanId: "l",
  contact: "Ana",
  amount: 80,
  status: "open",
  dueDate: today,
  createdAt: `${today}T12:00:00Z`,
  ...patch,
});
const alerts = () =>
  getHomeAlerts(
    data({ transactions: [transaction("a"), transaction("b")] }),
    today,
  );

test("home carousel includes overdue, today, next seven days and pending review messages in priority order", () => {
  const items = getHomeAlerts(
    data({
      transactions: [
        transaction("soon", { dueDate: "2026-10-27" }),
        transaction("today"),
        transaction("old", { dueDate: "2026-09-10" }),
        transaction("far", { dueDate: "2026-10-28" }),
      ],
      notifications: [message("review")],
    }),
    today,
  );
  assert.deepEqual(
    items.map((item) => item.tone),
    ["overdue", "today", "message", "upcoming"],
  );
  assert.equal(items[0].destination.state.transactionId, "old");
  assert.equal(items[2].destination.state.notificationId, "review");
});
test("paid transactions, completed loans and processed messages never return on a fresh app opening", () => {
  const items = getHomeAlerts(
    data({
      transactions: [transaction("paid", { paymentStatus: "paid" })],
      loanReceivables: [loan({ status: "paid" })],
      notifications: [
        message("approved", { status: "approved" }),
        message("ignored", { status: "ignored" }),
      ],
    }),
    today,
  );
  const session = registerHomeAlerts(createHomeAlertSession(), items, 0);
  assert.deepEqual(visibleHomeAlerts(items, session, 1), []);
});
test("opening a pending receipt or loan keeps the exact destination and receiving amount", () => {
  const items = getHomeAlerts(
    data({
      transactions: [transaction("income", { amount: 120 })],
      loanReceivables: [loan()],
    }),
    today,
  );
  assert.equal(
    items.find((item) => item.destination.state.transactionId === "income")
      ?.receiving,
    true,
  );
  const receipt = items.find(
    (item) => item.destination.state.receivableId === "r",
  )!;
  assert.equal(receipt.amount, 80);
  assert.equal(receipt.destination.pathname, "/dashboard/emprestimos");
  assert.equal(receipt.receiving, true);
});
test("card reminders link one invoice and disappear immediately when that invoice is paid", () => {
  const card = {
    id: "c",
    name: "Nubank",
    last4: "1234",
    color: "#820ad1",
    closingDay: 10,
    dueDay: 17,
  };
  const source = data({
    cards: [card],
    transactions: [
      transaction("purchase", {
        paymentMethod: "cartao",
        cardMode: "credito",
        cardId: "c",
        cardInvoiceMonth: "2026-10",
        date: "2026-10-02",
      }),
    ],
  });
  const items = getHomeAlerts(source, today);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].destination, {
    pathname: "/dashboard/compras-cartao",
    state: { cardId: "c", invoiceMonth: "2026-10" },
  });
  assert.deepEqual(
    getHomeAlerts(
      {
        ...source,
        cards: [{ ...card, invoicePaidByMonth: { "2026-10": true } }],
      },
      today,
    ),
    [],
  );
});
test("viewing or hiding one carousel item preserves every other reminder", () => {
  const items = alerts();
  const start = registerHomeAlerts(createHomeAlertSession(), items, 10);
  const hidden = hideHomeAlert(start, items[0].id);
  assert.deepEqual(visibleHomeAlerts(items, hidden, 20), [items[1]]);
  assert.deepEqual(start.hiddenIds, []);
  assert.strictEqual(hideHomeAlert(hidden, items[0].id), hidden);
});
test("route return within the same app opening does not redisplay viewed reminders or restart their timer", () => {
  const items = alerts();
  const session = hideHomeAlert(
    registerHomeAlerts(createHomeAlertSession(), items, 0),
    items[0].id,
  );
  const returned = registerHomeAlerts(
    session,
    items,
    HOME_ALERT_DISPLAY_MS - 1,
  );
  assert.strictEqual(returned, session);
  assert.deepEqual(
    visibleHomeAlerts(items, returned, HOME_ALERT_DISPLAY_MS - 1),
    [items[1]],
  );
  assert.deepEqual(
    visibleHomeAlerts(items, returned, HOME_ALERT_DISPLAY_MS),
    [],
  );
});
test("remaining pending reminders reappear in a new app opening after hide or expiry", () => {
  const items = alerts();
  const old = hideHomeAlert(
    registerHomeAlerts(createHomeAlertSession(), items, 0),
    items[0].id,
  );
  assert.deepEqual(visibleHomeAlerts(items, old, HOME_ALERT_DISPLAY_MS), []);
  const reopened = registerHomeAlerts(
    createHomeAlertSession(),
    items,
    HOME_ALERT_DISPLAY_MS + 1,
  );
  assert.deepEqual(
    visibleHomeAlerts(items, reopened, HOME_ALERT_DISPLAY_MS + 2),
    items,
  );
});
test("new arrivals get their own short visibility window without resurfacing expired reminders", () => {
  const items = alerts();
  const initial = registerHomeAlerts(createHomeAlertSession(), items, 0);
  const withNew = getHomeAlerts(
    data({
      transactions: [transaction("a"), transaction("b"), transaction("new")],
    }),
    today,
  );
  const now = HOME_ALERT_DISPLAY_MS + 100;
  const updated = registerHomeAlerts(initial, withNew, now);
  assert.deepEqual(
    visibleHomeAlerts(withNew, updated, now).map(
      (item) => item.destination.state.transactionId,
    ),
    ["new"],
  );
});
test("temporary carousel dismissal never writes inbox read state or changes saved finances", () => {
  const source = data({
    transactions: [transaction("unpaid")],
    notifications: [message("review")],
  });
  const before = structuredClone(source);
  const items = getHomeAlerts(source, today);
  hideHomeAlert(
    registerHomeAlerts(createHomeAlertSession(), items, 0),
    items[0].id,
  );
  assert.deepEqual(source, before);
  assert.equal(getPaymentNotifications(source, today).length, 1);
});
test("a still-unpaid reminder may reappear on Home without restoring a permanently read inbox message", () => {
  const source = data({ transactions: [transaction("unpaid")] });
  const readId = getPaymentNotifications(source, today)[0].id;
  const readSource = { ...source, readPaymentNotificationIds: [readId] };
  assert.deepEqual(getPaymentNotifications(readSource, today), []);
  assert.equal(getHomeAlerts(readSource, today).length, 1);
  assert.deepEqual(readSource.readPaymentNotificationIds, [readId]);
});
test("visibility for one profile does not hide the same reminder id in another profile", () => {
  const items = alerts();
  const first = hideHomeAlert(
    registerHomeAlerts(createHomeAlertSession(), items, 0),
    items[0].id,
  );
  const second = registerHomeAlerts(createHomeAlertSession(), items, 0);
  assert.equal(visibleHomeAlerts(items, first, 1).length, 1);
  assert.equal(visibleHomeAlerts(items, second, 1).length, 2);
});
test("completion while the carousel is open removes that reminder from the current session", () => {
  const source = data({ transactions: [transaction("a"), transaction("b")] });
  const session = registerHomeAlerts(
    createHomeAlertSession(),
    getHomeAlerts(source, today),
    0,
  );
  const updated = getHomeAlerts(
    {
      ...source,
      transactions: [
        transaction("a", { paymentStatus: "paid" }),
        transaction("b"),
      ],
    },
    today,
  );
  assert.deepEqual(
    visibleHomeAlerts(updated, session, 10).map(
      (item) => item.destination.state.transactionId,
    ),
    ["b"],
  );
});
test("a viewed reminder does not return merely because its deadline phase changes overnight", () => {
  const source = data({ transactions: [transaction("same-payment")] });
  const first = getHomeAlerts(source, today);
  const viewed = hideHomeAlert(
    registerHomeAlerts(createHomeAlertSession(), first, 0),
    first[0].id,
  );
  const overdue = getHomeAlerts(source, "2026-10-21");
  assert.equal(overdue[0].tone, "overdue");
  assert.equal(overdue[0].id, first[0].id);
  assert.deepEqual(visibleHomeAlerts(overdue, viewed, 1), []);
});
test("reading or opening an inbox payment notice hides its Home reminder for this opening only", () => {
  resetHomeAlertSessions();
  const source = data({ transactions: [transaction("a"), transaction("b")] });
  const items = getHomeAlerts(source, today);
  const notices = getPaymentNotifications(source, today);
  saveHomeAlertSession(
    "profile-a",
    registerHomeAlerts(loadHomeAlertSession("profile-a"), items, 0),
  );
  hideHomePaymentAlerts("profile-a", [notices[0]]);
  assert.equal(
    visibleHomeAlerts(items, loadHomeAlertSession("profile-a"), 1).length,
    1,
  );
  assert.equal(
    visibleHomeAlerts(items, loadHomeAlertSession("profile-b"), 1).length,
    2,
  );
  resetHomeAlertSessions();
  assert.equal(
    visibleHomeAlerts(items, loadHomeAlertSession("profile-a"), 1).length,
    2,
  );
  assert.equal(source.transactions[0].paymentStatus, "pending");
});
