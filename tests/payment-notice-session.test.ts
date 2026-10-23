import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppStoreState, ProfileData } from "../src/lib/app-store";
import { startPaymentNoticeSession } from "../src/lib/payment-notice-session";
import { getPaymentNotifications } from "../src/lib/payment-notifications";
import { readPaymentNotificationsData } from "../src/lib/notification-actions";

const today = "2026-10-20";
const data = (): ProfileData => ({
  categories: [],
  cards: [],
  people: [],
  reserves: [],
  reservesInBalance: true,
  transactions: [
    {
      id: "overdue",
      title: "Conta antiga",
      amount: -40,
      categoryId: "outros",
      date: "2026-10-01",
      dueDate: "2026-10-19",
      paymentStatus: "pending",
    },
    {
      id: "soon",
      title: "A receber",
      amount: 60,
      categoryId: "outros",
      date: "2026-10-01",
      dueDate: "2026-10-27",
      paymentStatus: "pending",
    },
    {
      id: "far",
      title: "Futura",
      amount: -80,
      categoryId: "outros",
      date: "2026-10-01",
      dueDate: "2026-10-28",
      paymentStatus: "pending",
    },
  ],
  loanReceivables: [],
  notifications: [],
  readPaymentNotificationIds: [],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: "1234",
});
const state = (first: ProfileData, second = data()): AppStoreState => ({
  profiles: [
    { id: "a", name: "A", avatar: {} as never, data: first },
    { id: "b", name: "B", avatar: {} as never, data: second },
  ],
  activeProfileId: "a",
  pinUsage: "open",
});

test("read payment and receipt notices stay hidden now and return on the next opening if unpaid", () => {
  const source = data();
  const notices = getPaymentNotifications(source, today);
  assert.equal(notices.length, 2);
  const read = readPaymentNotificationsData(
    source,
    notices.map((item) => item.id),
  );
  assert.deepEqual(getPaymentNotifications(read, today), []);
  const reopened = startPaymentNoticeSession(
    JSON.parse(JSON.stringify(state(read))),
  );
  assert.deepEqual(
    getPaymentNotifications(reopened.profiles[0].data, today).map(
      (item) => item.transactionId,
    ),
    ["overdue", "soon"],
  );
  assert.equal(reopened.activeProfileId, "a");
  assert.equal(reopened.profiles[0].data.pin, "1234");
});
test("paid entries do not return after clearing read markers, and distant dates remain excluded", () => {
  const source = data();
  const read = readPaymentNotificationsData(
    source,
    getPaymentNotifications(source, today).map((item) => item.id),
  );
  read.transactions = read.transactions.map((item) => ({
    ...item,
    paymentStatus: "paid",
  }));
  const reopened = startPaymentNoticeSession(state(read));
  assert.deepEqual(
    getPaymentNotifications(reopened.profiles[0].data, today),
    [],
  );
});
test("starting an opening clears only payment-notice read ids, preserving financial and message data", () => {
  const first = { ...data(), readPaymentNotificationIds: ["read-a"] };
  const second = { ...data(), readPaymentNotificationIds: ["read-b"] };
  const original = state(first, second);
  const before = structuredClone(original);
  const reopened = startPaymentNoticeSession(original);
  assert.deepEqual(original, before);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(reopened.profiles[i].data.readPaymentNotificationIds, []);
    assert.strictEqual(
      reopened.profiles[i].data.transactions,
      original.profiles[i].data.transactions,
    );
    assert.strictEqual(
      reopened.profiles[i].data.cards,
      original.profiles[i].data.cards,
    );
    assert.strictEqual(
      reopened.profiles[i].data.notifications,
      original.profiles[i].data.notifications,
    );
  }
  assert.strictEqual(startPaymentNoticeSession(reopened), reopened);
});
