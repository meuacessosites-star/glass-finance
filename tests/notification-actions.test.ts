import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AppNotification,
  LoanCreationInput,
  ProfileData,
} from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import {
  approveNotificationData,
  approveLoanNotificationData,
  ignoreNotificationsData,
  restoreNotificationsData,
  readPaymentNotificationsData,
  notificationRecord,
  sanitizeReadNotificationIds,
} from "../src/lib/notification-actions";
import { createLoanRecordData } from "../src/lib/loan-creation";

const notification = (
  id = "n1",
  patch: Partial<AppNotification> = {},
): AppNotification => ({
  id,
  bank: "Nubank",
  merchant: "Mercado",
  amount: 100,
  date: "2020-01-02",
  categoryId: "compras",
  status: "pending",
  ...patch,
});
const profile = (patch: Partial<ProfileData> = {}): ProfileData => ({
  cards: [
    {
      id: "c",
      name: "Nubank",
      last4: "1234",
      color: "#820AD1",
      closingDay: 10,
      dueDay: 17,
    },
  ],
  transactions: [],
  loanReceivables: [],
  categories: [
    {
      id: "compras",
      label: "Compras",
      color: "#FF3366",
      icon: "compras",
      budget: 0,
    },
  ],
  people: [],
  reserves: [],
  reservesInBalance: true,
  notifications: [notification(), notification("n2")],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
  ...patch,
});
let sequence = 0;
const uid = (prefix: string) => `${prefix}-${++sequence}`;
const transaction = (
  patch: Partial<Transaction> = {},
): Omit<Transaction, "id"> => ({
  title: "Nome revisado",
  categoryId: "compras",
  amount: -119.9,
  date: "2020-01-03",
  dueDate: "2020-01-20",
  paymentMethod: "pix",
  paymentStatus: "pending",
  note: "Observação revisada",
  attachments: ["data:image/png;base64,AA"],
  ...patch,
});
const loan = (patch: Partial<LoanCreationInput> = {}): LoanCreationInput => ({
  contact: "Ana",
  description: "Compra para Ana",
  amount: 100,
  date: "2020-01-02",
  categoryId: "compras",
  paymentMethod: "pix",
  operationType: "loan",
  collectionMode: "fixed",
  receivables: [
    { amount: 50, dueDate: "2020-02-10", installment: 1, installments: 2 },
    { amount: 50, dueDate: "2020-03-10", installment: 2, installments: 2 },
  ],
  ...patch,
});

test("review does not approve or create a transaction until a valid completed form is supplied", () => {
  const data = profile();
  assert.equal(approveNotificationData(data, "n1", undefined, uid), data);
  for (const input of [
    transaction({ title: " " }),
    transaction({ amount: NaN }),
    transaction({ amount: 0 }),
    transaction({ date: "2020-02-31" }),
    transaction({ categoryId: "missing" }),
    transaction({ cardId: "missing" }),
  ])
    assert.equal(approveNotificationData(data, "n1", input, uid), data);
  assert.equal(data.notifications[0].status, "pending");
  assert.equal(data.transactions.length, 0);
});

test("approval saves the reviewed fields, links only that message and is idempotent", () => {
  const data = profile();
  const snapshot = structuredClone(data);
  const input = transaction();
  const next = approveNotificationData(data, "n1", input, uid);
  assert.equal(next.transactions.length, 1);
  assert.deepEqual(
    { ...next.transactions[0], id: undefined },
    {
      ...input,
      id: undefined,
      paymentDate: undefined,
      showPaymentDateOnCard: true,
      cardDisplayMode: "last4",
    },
  );
  assert.deepEqual(notificationRecord(next, next.notifications[0]), {
    kind: "transaction",
    id: next.transactions[0].id,
  });
  assert.equal(next.notifications[1].status, "pending");
  assert.equal(approveNotificationData(next, "n1", input, uid), next);
  assert.deepEqual(data, snapshot);
});

test("credit approval retains the selected invoice and opens only its unpaid invoice", () => {
  const data = profile({
    cards: [
      {
        ...profile().cards[0],
        invoicePaidByMonth: { "2020-01": true, "2020-02": true },
      },
    ],
  });
  const input = transaction({
    paymentMethod: "cartao",
    cardMode: "credito",
    cardId: "c",
    cardInvoiceMonth: "2020-01",
  });
  const next = approveNotificationData(data, "n1", input, uid);
  assert.equal(next.transactions[0].cardInvoiceMonth, "2020-01");
  assert.equal(next.cards[0].invoicePaidByMonth?.["2020-01"], false);
  assert.equal(next.cards[0].invoicePaidByMonth?.["2020-02"], true);
  assert.equal(
    approveNotificationData(
      data,
      "n1",
      { ...input, cardInvoiceMonth: "bad" },
      uid,
    ),
    data,
  );
});

test("loan approval uses the shared schedule and never creates a separate personal expense", () => {
  const data = profile();
  const next = approveLoanNotificationData(data, "n1", loan(), uid);
  assert.equal(next.loanReceivables.length, 2);
  assert.equal(next.transactions.length, 3);
  assert.ok(next.transactions.every((row) => row.source === "loan"));
  assert.deepEqual(
    next.loanReceivables.map((row) => [row.amount, row.dueDate]),
    [
      [50, "2020-02-10"],
      [50, "2020-03-10"],
    ],
  );
  assert.equal(next.notifications[0].loanId, next.loanReceivables[0].loanId);
  assert.equal(approveLoanNotificationData(next, "n1", loan(), uid), next);
});

test("card loan approval uses exact installments and the selected invoice", () => {
  const data = profile();
  const input = loan({
    amount: 100,
    operationType: "card",
    cardId: "c",
    paymentMethod: "cartao",
    installments: 3,
    cardInvoiceMonth: "2020-01",
    receivables: undefined,
  });
  const next = approveLoanNotificationData(data, "n1", input, uid);
  assert.deepEqual(
    next.loanReceivables.map((row) => [row.amount, row.cardInvoiceMonth]),
    [
      [33.34, "2020-01"],
      [33.33, "2020-02"],
      [33.33, "2020-03"],
    ],
  );
  assert.ok(
    next.loanReceivables.every(
      (row) => row.cardId === "c" && row.status === "scheduled",
    ),
  );
  assert.equal(next.notifications[0].recordKind, "loan");
});

test("open loan approval keeps the existing flexible collection behavior", () => {
  const data = profile();
  const input = loan({
    collectionMode: "open",
    receivables: undefined,
    freePaymentMode: "installments",
    suggestedPaymentAmount: 25,
  });
  const next = approveLoanNotificationData(data, "n1", input, uid);
  assert.equal(next.loanReceivables.length, 1);
  assert.equal(next.transactions.length, 1);
  assert.equal(next.loanReceivables[0].suggestedPaymentAmount, 25);
  assert.equal(next.loanReceivables[0].dueDate, undefined);
  const normal = createLoanRecordData(data, input, uid);
  assert.equal(
    normal.loanReceivables[0].collectionMode,
    next.loanReceivables[0].collectionMode,
  );
});

test("invalid loan schedules, dates, totals and archived cards preserve pending messages", () => {
  const data = profile();
  for (const input of [
    loan({ contact: " " }),
    loan({ amount: -1 }),
    loan({ date: "bad" }),
    loan({ categoryId: "missing" }),
    loan({ receivables: [] }),
    loan({ amount: 99 }),
    loan({
      receivables: [
        { amount: 100, dueDate: "2020-02-31", installment: 1, installments: 1 },
      ],
    }),
    loan({ operationType: "card", cardId: "missing" }),
  ])
    assert.equal(approveLoanNotificationData(data, "n1", input, uid), data);
  const archived = profile({ cards: [{ ...data.cards[0], archived: true }] });
  assert.equal(
    approveLoanNotificationData(
      archived,
      "n1",
      loan({ operationType: "card", cardId: "c" }),
      uid,
    ),
    archived,
  );
});

test("redo removes only the chosen registration and reapproval saves the revised form once", () => {
  let data = approveNotificationData(profile(), "n1", transaction(), uid);
  data = approveNotificationData(data, "n2", transaction(), uid);
  const restored = restoreNotificationsData(data, ["n1", "missing"]);
  assert.equal(restored.notifications[0].status, "pending");
  assert.equal(restored.notifications[1].status, "approved");
  assert.equal(restored.transactions.length, 1);
  assert.equal(restored.notifications[0].transactionId, undefined);
  assert.equal(restored.notifications[0].approvedAt, undefined);
  const reloaded = JSON.parse(JSON.stringify(restored));
  const next = approveNotificationData(
    reloaded,
    "n1",
    transaction({ amount: -999 }),
    uid,
  );
  assert.equal(next.transactions.length, 2);
  assert.equal(next.transactions[0].amount, -999);
  assert.equal(next.notifications[0].status, "approved");
});

test("redo removes a saved loan and reapproval creates a single new loan family", () => {
  const saved = approveLoanNotificationData(profile(), "n1", loan(), uid);
  const restored = restoreNotificationsData(saved, ["n1"]);
  assert.equal(restored.transactions.length, 0);
  assert.equal(restored.loanReceivables.length, 0);
  const next = approveLoanNotificationData(restored, "n1", loan(), uid);
  assert.equal(next.transactions.length, 3);
  assert.equal(next.loanReceivables.length, 2);
  assert.notEqual(next.notifications[0].loanId, saved.notifications[0].loanId);
  assert.equal(next.notifications[0].status, "approved");
});

test("a deleted linked record cannot be recreated accidentally by reapproval", () => {
  const data = profile({
    notifications: [
      notification("n1", {
        recordKind: "transaction",
        transactionId: "deleted",
      }),
    ],
  });
  const next = approveNotificationData(data, "n1", transaction(), uid);
  assert.equal(next.transactions.length, 0);
  assert.equal(next.notifications[0].status, "approved");
});

test("legacy approved messages recover their record before restore and remain duplicate-free", () => {
  const input = transaction({
    title: "Mercado",
    amount: -100,
    date: "2020-01-02",
    note: "Aprovado da notificação do Nubank",
  });
  const data = profile({
    notifications: [notification("n1", { status: "approved" })],
    transactions: [{ ...input, id: "old" }],
  });
  assert.deepEqual(notificationRecord(data, data.notifications[0]), {
    kind: "transaction",
    id: "old",
  });
  const restored = restoreNotificationsData(data, ["n1"]);
  assert.equal(restored.notifications[0].transactionId, undefined);
  assert.equal(restored.transactions.length, 0);
  assert.equal(
    approveNotificationData(restored, "n1", undefined, uid).transactions.length,
    0,
  );
});

test("ignore permanently deletes selected content once, retains saved money records and cannot restore", () => {
  const data = approveNotificationData(profile(), "n1", transaction(), uid);
  const next = ignoreNotificationsData(data, ["n1", "n1", "missing"]);
  assert.deepEqual(
    next.notifications.map((row) => row.id),
    ["n2"],
  );
  assert.equal(next.ignoredNotificationCount, 1);
  assert.equal(next.transactions, data.transactions);
  assert.equal(ignoreNotificationsData(next, ["n1"]), next);
  assert.deepEqual(
    restoreNotificationsData(JSON.parse(JSON.stringify(next)), [
      "n1",
    ]).notifications.map((row) => row.id),
    ["n2"],
  );
});

test("reading notices persists selected IDs without changing any payment or financial record", () => {
  const data = profile();
  const next = readPaymentNotificationsData(data, ["one", "one", "two"]);
  assert.deepEqual(next.readPaymentNotificationIds, ["one", "two"]);
  assert.equal(next.transactions, data.transactions);
  assert.equal(next.loanReceivables, data.loanReceivables);
  assert.equal(next.cards, data.cards);
  assert.deepEqual(
    JSON.parse(JSON.stringify(next)).readPaymentNotificationIds,
    ["one", "two"],
  );
  assert.deepEqual(sanitizeReadNotificationIds(["", 1, null, "x", "x", "y"]), [
    "x",
    "y",
  ]);
  assert.equal(data.readPaymentNotificationIds, undefined);
});

test("credit review before closing saves its automatic cycle; after closing still needs an explicit choice", () => {
  const data = profile();
  const input = transaction({
    paymentMethod: "cartao",
    cardMode: "credito",
    cardId: "c",
    date: "2020-01-03",
  });
  const next = approveNotificationData(data, "n1", input, uid);
  assert.equal(next.notifications[0].status, "approved");
  assert.equal(next.transactions[0].cardInvoiceMonth, "2020-01");
  assert.equal(
    approveNotificationData(data, "n1", { ...input, date: "2020-01-12" }, uid),
    data,
  );
  assert.equal(
    approveNotificationData(data, "n1", { ...input, cardId: undefined }, uid),
    data,
  );
});
