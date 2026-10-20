import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AppCard,
  AppNotification,
  LoanCreationInput,
  LoanReceivable,
  ProfileData,
} from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import {
  approveNotificationData,
  approveLoanNotificationData,
  restoreNotificationsData,
  ignoreNotificationsData,
  notificationRecord,
} from "../src/lib/notification-actions";
import { getHomeBalance } from "../src/lib/home-balance";
import {
  getCardCommittedAmount,
  getCardInvoiceMetrics,
} from "../src/lib/card-invoice-view";
import { getBorrowedCardInvoiceMetrics } from "../src/lib/card-invoice-summary";
import {
  recordInvoicePayment,
  setTransactionPaymentState,
} from "../src/lib/payment-updates";
import { recordFreeLoanReceipt } from "../src/lib/loan-repayments";
import {
  createDemoProfile,
  installDemoExamples,
  DEMO_PROFILE_ID,
  NOTIFICATION_EXAMPLE_TRANSACTION,
  NOTIFICATION_EXAMPLE_APPROVED,
  NOTIFICATION_EXAMPLE_PAYMENT,
  NOTIFICATION_EXAMPLE_RECEIPT,
} from "../src/lib/demo-examples";
import { getPaymentNotifications } from "../src/lib/payment-notifications";

const card: AppCard = {
  id: "c",
  name: "Nubank",
  color: "#820ad1",
  last4: "1234",
  closingDay: 10,
  dueDay: 17,
};
const notice = (id = "n"): AppNotification => ({
  id,
  bank: "Nubank",
  merchant: id,
  amount: 60,
  date: "2026-10-02",
  status: "pending",
});
const tx = (
  id: string,
  amount: number,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  amount,
  categoryId: "outros",
  date: "2026-10-02",
  paymentStatus: "paid",
  paymentMethod: "pix",
  ...patch,
});
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({
  cards: [card],
  categories: [
    { id: "outros", label: "Outros", color: "#888888", icon: "outros" },
  ],
  people: [],
  transactions: [tx("salary", 1000)],
  loanReceivables: [],
  notifications: [notice(), notice("n2"), notice("n3")],
  reserves: [],
  reservesInBalance: true,
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
  ...patch,
});
let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;
const input = (patch: Partial<Transaction> = {}): Omit<Transaction, "id"> => {
  const { id, ...row } = tx("draft", -60, patch);
  return row;
};
const loanInput = (
  patch: Partial<LoanCreationInput> = {},
): LoanCreationInput => ({
  contact: "Ana",
  amount: 100,
  date: "2026-10-02",
  categoryId: "outros",
  paymentMethod: "pix",
  operationType: "loan",
  collectionMode: "open",
  ...patch,
});
const balance = (data: ProfileData) =>
  getHomeBalance(data, "2026-10", "monthly").balance;

test("normal approval affects the saved balance and redo removes that entry before a revised reapproval", () => {
  const initial = profile();
  const saved = approveNotificationData(initial, "n", input(), uid);
  assert.equal(balance(initial), 1000);
  assert.equal(balance(saved), 940);
  const oldId = saved.notifications[0].transactionId;
  assert.equal(notificationRecord(saved, saved.notifications[0])?.id, oldId);
  const undone = restoreNotificationsData(saved, ["n"]);
  assert.equal(balance(undone), 1000);
  assert.equal(
    undone.transactions.some((row) => row.id === oldId),
    false,
  );
  assert.equal(undone.notifications[0].status, "pending");
  assert.equal(undone.notifications[0].approvedAt, undefined);
  const redone = approveNotificationData(
    undone,
    "n",
    input({ amount: -75 }),
    uid,
  );
  assert.equal(balance(redone), 925);
  assert.equal(redone.transactions.length, 2);
  assert.equal(approveNotificationData(redone, "n", input(), uid), redone);
});

test("income approvals and undo follow the same ordinary transaction balance rules", () => {
  const saved = approveNotificationData(
    profile(),
    "n",
    input({ amount: 150 }),
    uid,
  );
  assert.equal(balance(saved), 1150);
  assert.equal(balance(restoreNotificationsData(saved, ["n"])), 1000);
});

test("undoing an individually paid credit entry removes its payment share and preserves other cards and invoices", () => {
  const otherCard = { ...card, id: "other" };
  const purchase = tx("keep", -100, {
    paymentMethod: "cartao",
    cardMode: "credito",
    cardId: "c",
    cardInvoiceMonth: "2026-10",
    paymentStatus: "pending",
  });
  const initial = profile({
    cards: [card, otherCard],
    transactions: [
      purchase,
      tx("other", -80, {
        paymentMethod: "cartao",
        cardMode: "credito",
        cardId: "other",
        cardInvoiceMonth: "2026-10",
        paymentStatus: "pending",
      }),
    ],
  });
  let saved = approveNotificationData(
    initial,
    "n",
    input({
      paymentMethod: "cartao",
      cardMode: "credito",
      cardId: "c",
      cardInvoiceMonth: "2026-10",
      paymentStatus: "pending",
    }),
    uid,
  );
  saved = setTransactionPaymentState(
    saved,
    saved.notifications[0].transactionId!,
    "paid",
    "2026-10-20",
  );
  const undone = restoreNotificationsData(saved, ["n"]);
  const metrics = getCardInvoiceMetrics(
    undone.cards[0],
    undone.transactions,
    "2026-10",
    "2026-10-20",
  );
  assert.equal(metrics.invoiceTotal, 100);
  assert.equal(metrics.paidAmount, 0);
  assert.equal(metrics.openAmount, 100);
  assert.equal(undone.cards[1], otherCard);
  assert.equal(
    undone.transactions.find((t) => t.id === "keep")?.paymentStatus,
    "pending",
  );
});

test("redo removes future credit installments and does not leave stale invoice totals or committed limit", () => {
  let saved = approveNotificationData(
    profile({ transactions: [] }),
    "n",
    input({
      amount: -90,
      paymentMethod: "cartao",
      cardMode: "credito",
      cardId: "c",
      cardInvoiceMonth: "2026-10",
      paymentStatus: "pending",
      recurrence: "parcelada",
      installments: 3,
    }),
    uid,
  );
  saved = recordInvoicePayment(saved, "c", "2026-10", {
    totalAmount: 30,
    paidAmount: 30,
    paymentDate: "2026-10-20",
  });
  const undone = restoreNotificationsData(saved, ["n"]);
  assert.equal(
    getCardCommittedAmount(undone.cards[0], undone.transactions, "2026-10-20"),
    0,
  );
  for (const month of ["2026-10", "2026-11", "2026-12"])
    assert.equal(
      getCardInvoiceMetrics(
        undone.cards[0],
        undone.transactions,
        month,
        "2026-10-20",
      ).invoiceTotal,
      0,
    );
});

test("undo preserves unallocated partial invoice payments for the remaining purchases", () => {
  const initial = profile({
    transactions: [
      tx("keep", -100, {
        paymentMethod: "cartao",
        cardMode: "credito",
        cardId: "c",
        cardInvoiceMonth: "2026-10",
        paymentStatus: "pending",
      }),
    ],
  });
  let saved = approveNotificationData(
    initial,
    "n",
    input({
      paymentMethod: "cartao",
      cardMode: "credito",
      cardId: "c",
      cardInvoiceMonth: "2026-10",
      paymentStatus: "pending",
    }),
    uid,
  );
  saved = recordInvoicePayment(saved, "c", "2026-10", {
    totalAmount: 160,
    paidAmount: 40,
    paymentDate: "2026-10-20",
  });
  const undone = restoreNotificationsData(saved, ["n"]);
  assert.equal(
    getCardInvoiceMetrics(
      undone.cards[0],
      undone.transactions,
      "2026-10",
      "2026-10-20",
    ).paidAmount,
    40,
  );
});

test("redo removes a money loan, its repayments and receipt transactions using exact links", () => {
  const initial = profile();
  let saved = approveLoanNotificationData(initial, "n", loanInput(), uid);
  const receivable = saved.loanReceivables[0];
  saved = recordFreeLoanReceipt(
    saved,
    receivable.id,
    20,
    "2026-10-10",
    "receipt",
  );
  const unrelated = tx("prefix-other", -10, {
    source: "loan",
    note: `Referência: ${receivable.loanId}-other`,
  });
  saved = { ...saved, transactions: [...saved.transactions, unrelated] };
  const undone = restoreNotificationsData(saved, ["n"]);
  assert.equal(undone.loanReceivables.length, 0);
  assert.deepEqual(
    undone.transactions.map((row) => row.id),
    ["salary", "prefix-other"],
  );
  assert.equal(undone.notifications[0].loanId, undefined);
  assert.equal(saved.loanReceivables[0].receipts?.length, 1);
});

test("borrowed-card undo removes only the chosen loan family and keeps other bank debt and person receipts", () => {
  const keep: LoanReceivable = {
    id: "keep",
    loanId: "keep",
    contact: "Bia",
    amount: 50,
    dueDate: "2026-10-17",
    cardId: "c",
    cardInvoiceMonth: "2026-10",
    cardClosingDate: "2026-10-10",
    operationType: "card",
    collectionMode: "fixed",
    status: "paid",
    createdAt: "2026-10-01",
  };
  let saved = approveLoanNotificationData(
    profile({ loanReceivables: [keep] }),
    "n",
    loanInput({
      operationType: "card",
      cardId: "c",
      paymentMethod: "cartao",
      collectionMode: "fixed",
      installments: 1,
      cardInvoiceMonth: "2026-10",
    }),
    uid,
  );
  saved = {
    ...saved,
    cards: [
      {
        ...saved.cards[0],
        borrowedInvoicePaymentsByMonth: {
          "2026-10": {
            totalAmount: 150,
            paidAmount: 40,
            paymentDate: "2026-10-20",
          },
        },
      },
    ],
  };
  const undone = restoreNotificationsData(saved, ["n"]);
  assert.deepEqual(undone.loanReceivables, [keep]);
  assert.deepEqual(
    getBorrowedCardInvoiceMetrics(
      undone.cards[0],
      undone.loanReceivables,
      "2026-10",
    ),
    { invoiceTotal: 50, paidAmount: 40, openAmount: 10 },
  );
});

test("batch redo and ignore affect only selected messages and leave unrelated saved entries intact", () => {
  let saved = approveNotificationData(profile(), "n", input(), uid);
  saved = approveNotificationData(saved, "n2", input({ amount: -80 }), uid);
  const undone = restoreNotificationsData(saved, ["n", "n", "missing"]);
  assert.equal(undone.notifications[1].status, "approved");
  assert.equal(undone.transactions.length, 2);
  const ignored = ignoreNotificationsData(undone, ["n", "n3"]);
  assert.deepEqual(
    ignored.notifications.map((n) => n.id),
    ["n2"],
  );
  assert.equal(ignored.ignoredNotificationCount, 2);
  assert.equal(ignored.transactions, undone.transactions);
});

test("demo migration adds actual linked examples once and preserves personal data and active profile", () => {
  const now = new Date("2026-10-20T13:00:00Z");
  const base = profile();
  const personal = {
    ...createDemoProfile(base, now),
    id: "personal",
    data: base,
  };
  const demo = createDemoProfile(base, now);
  demo.data.readPaymentNotificationIds = ["already-read"];
  const state = {
    profiles: [personal, demo],
    activeProfileId: "personal",
    exampleDataVersion: 2,
  };
  const migrated = installDemoExamples(state, base, now);
  assert.equal(migrated.profiles[0], personal);
  assert.equal(migrated.activeProfileId, "personal");
  const data = migrated.profiles.find((p) => p.id === DEMO_PROFILE_ID)!.data;
  const approved = data.notifications.find(
    (n) => n.id === NOTIFICATION_EXAMPLE_APPROVED,
  )!;
  assert.equal(approved.status, "approved");
  assert.equal(
    notificationRecord(data, approved)?.id,
    NOTIFICATION_EXAMPLE_TRANSACTION,
  );
  const reminders = getPaymentNotifications(data, "2026-10-20");
  assert.ok(
    reminders.some((n) => n.transactionId === NOTIFICATION_EXAMPLE_PAYMENT),
  );
  assert.ok(
    reminders.some(
      (n) => n.transactionId === NOTIFICATION_EXAMPLE_RECEIPT && n.receiving,
    ),
  );
  assert.equal(installDemoExamples(migrated, base, now), migrated);
  const edited = {
    ...migrated,
    profiles: migrated.profiles.map((p) =>
      p.id === DEMO_PROFILE_ID
        ? {
            ...p,
            data: restoreNotificationsData(p.data, [
              NOTIFICATION_EXAMPLE_APPROVED,
            ]),
          }
        : p,
    ),
  };
  assert.equal(installDemoExamples(edited, base, now), edited);
});
