import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AppNotification,
  AppStoreState,
  ProfileData,
} from "../src/lib/app-store";
import {
  ignoredCountToday,
  isNotificationExpired,
  maintainAllNotificationHistory,
  maintainNotificationHistory,
  notificationExpiry,
  sanitizeNotificationRetention,
  setNotificationRetention,
} from "../src/lib/notification-history";
import {
  approveNotificationData,
  ignoreNotificationsData,
  restoreNotificationsData,
} from "../src/lib/notification-actions";

const now = new Date("2026-10-20T13:00:00Z");
const message = (patch: Partial<AppNotification> = {}): AppNotification => ({
  id: "n",
  bank: "Nubank",
  merchant: "Mercado",
  amount: 50,
  date: "2026-01-01",
  status: "approved",
  approvedAt: "2026-10-13T13:00:00Z",
  ...patch,
});
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({
  cards: [],
  transactions: [
    {
      id: "t",
      title: "Registro salvo",
      amount: -50,
      date: "2026-01-01",
      categoryId: "compras",
      paymentStatus: "paid",
    },
  ],
  loanReceivables: [],
  categories: [],
  people: [],
  reserves: [],
  reservesInBalance: true,
  notifications: [message()],
  ignoredNotificationCount: 3,
  ignoredNotificationDate: "2026-10-20",
  notificationRetentionDays: 7,
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
  ...patch,
});

test("ignored counter resets at local midnight including when the app returns from the background", () => {
  const data = profile({
    ignoredNotificationDate: "2026-10-19",
    ignoredNotificationCount: 8,
    notifications: [],
  });
  const before = maintainNotificationHistory(
    data,
    new Date("2026-10-20T02:59:00Z"),
  );
  assert.equal(before.ignoredNotificationCount, 8);
  const after = maintainNotificationHistory(
    before,
    new Date("2026-10-20T03:00:00Z"),
  );
  assert.equal(after.ignoredNotificationCount, 0);
  assert.equal(after.ignoredNotificationDate, "2026-10-20");
  assert.equal(after.transactions, data.transactions);
  assert.equal(after.notifications.length, 0);
});

test("ignoring on a new day counts only today's selected messages without resurrecting yesterday's", () => {
  const data = profile({
    notifications: [
      message({ status: "pending", approvedAt: undefined }),
      message({ id: "second", status: "pending", approvedAt: undefined }),
    ],
    ignoredNotificationCount: 100,
    ignoredNotificationDate: "2026-10-19",
  });
  const one = ignoreNotificationsData(data, ["n", "n"], "2026-10-20");
  assert.equal(one.ignoredNotificationCount, 1);
  const two = ignoreNotificationsData(one, ["second"], "2026-10-20");
  assert.equal(two.ignoredNotificationCount, 2);
  assert.equal(two.notifications.length, 0);
  assert.equal(ignoredCountToday(two, "2026-10-21"), 0);
});

test("seven day expiry uses first approval time, not the purchase date, and expires exactly at the deadline", () => {
  const n = message();
  assert.equal(notificationExpiry(n, 7), now.getTime());
  assert.equal(isNotificationExpired(n, 7, now.getTime() - 1), false);
  assert.equal(isNotificationExpired(n, 7, now.getTime()), true);
  assert.equal(
    maintainNotificationHistory(profile(), now).notifications.length,
    0,
  );
});

test("expiry removes message content but retains financial records, balances and read markers", () => {
  const data = profile({
    readPaymentNotificationIds: ["one"],
    notifications: [message({ transactionId: "t", recordKind: "transaction" })],
  });
  const snapshot = structuredClone(data);
  const next = maintainNotificationHistory(data, now);
  assert.equal(next.notifications.length, 0);
  assert.equal(next.transactions, data.transactions);
  assert.equal(next.cards, data.cards);
  assert.equal(next.loanReceivables, data.loanReceivables);
  assert.equal(
    next.readPaymentNotificationIds,
    data.readPaymentNotificationIds,
  );
  assert.deepEqual(data, snapshot);
});

test("retention supports short, long and unlimited choices; invalid settings safely use seven days", () => {
  for (const days of [1, 3, 7, 15, 30, 90, 180, 365, 0])
    assert.equal(sanitizeNotificationRetention(days), days);
  for (const invalid of [-1, 8, 366, "7", null, NaN])
    assert.equal(sanitizeNotificationRetention(invalid), 7);
  assert.equal(
    setNotificationRetention(profile(), 0, now).notifications.length,
    1,
  );
  assert.equal(
    setNotificationRetention(profile(), 365, now).notifications.length,
    1,
  );
});

test("shortening retention removes eligible old messages immediately, leaving new pending messages intact", () => {
  const data = profile({
    notificationRetentionDays: 30,
    notifications: [
      message(),
      message({ id: "new-pending", status: "pending", approvedAt: undefined }),
      message({ id: "recent", approvedAt: "2026-10-19T13:00:00Z" }),
    ],
  });
  const next = setNotificationRetention(data, 3, now);
  assert.deepEqual(
    next.notifications.map((n) => n.id),
    ["new-pending", "recent"],
  );
  assert.equal(
    setNotificationRetention(next, 365, now).notifications.some(
      (n) => n.id === "n",
    ),
    false,
  );
});

test("legacy approvals receive a migration timestamp once and pending messages do not expire by purchase date", () => {
  const data = profile({
    notifications: [
      message({ approvedAt: undefined }),
      message({ id: "pending", status: "pending", approvedAt: undefined }),
    ],
    ignoredNotificationDate: undefined,
  });
  const migrated = maintainNotificationHistory(data, now);
  assert.equal(migrated.notifications[0].approvedAt, now.toISOString());
  assert.equal(migrated.notifications[1].approvedAt, undefined);
  assert.equal(
    maintainNotificationHistory(migrated, new Date("2026-10-21T13:00:00Z"))
      .notifications[0].approvedAt,
    now.toISOString(),
  );
});

test("expired messages cannot be redone or reapproved after the retention deadline", () => {
  const old = message({
    approvedAt: "2020-01-01T13:00:00Z",
    recordKind: "transaction",
    transactionId: "t",
  });
  const data = profile({ notifications: [old] });
  assert.equal(
    restoreNotificationsData(data, ["n"]).notifications[0].status,
    "approved",
  );
  const restored = {
    ...data,
    notifications: [{ ...old, status: "pending" as const }],
  };
  assert.equal(
    approveNotificationData(restored, "n", undefined, () => "unused"),
    restored,
  );
  assert.equal(
    maintainNotificationHistory(restored, now).notifications.length,
    0,
  );
});

test("changing profiles keeps independent daily counts and retention choices", () => {
  const first = profile();
  const second = profile({
    ignoredNotificationDate: "2026-10-19",
    ignoredNotificationCount: 10,
    notificationRetentionDays: 0,
  });
  const state: AppStoreState = {
    activeProfileId: "a",
    pinUsage: "open",
    profiles: [
      { id: "a", name: "A", avatar: {} as never, data: first },
      { id: "b", name: "B", avatar: {} as never, data: second },
    ],
  };
  const next = maintainAllNotificationHistory(state, now);
  assert.equal(next.profiles[0].data.notifications.length, 0);
  assert.equal(next.profiles[1].data.notifications.length, 1);
  assert.equal(next.profiles[0].data.ignoredNotificationCount, 3);
  assert.equal(next.profiles[1].data.ignoredNotificationCount, 0);
  assert.equal(next.activeProfileId, "a");
});

test("persisted expiry and daily date survive reload and maintenance is stable without changes", () => {
  const data = profile({
    notifications: [message({ approvedAt: now.toISOString() })],
  });
  const reloaded = JSON.parse(JSON.stringify(data));
  const next = maintainNotificationHistory(reloaded, now);
  assert.equal(next, reloaded);
  assert.equal(
    notificationExpiry(next.notifications[0], 7),
    now.getTime() + 7 * 86400000,
  );
});
