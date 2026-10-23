import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppCard, LoanReceivable } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import { getPaymentNotifications } from "../src/lib/payment-notifications";

const today = "2026-10-20";
const card: AppCard = {
  id: "c",
  name: "Nubank",
  last4: "1234",
  color: "#820AD1",
  closingDay: 10,
  dueDay: 17,
};
const transaction = (
  id: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  categoryId: "compras",
  amount: -50,
  date: "2026-10-01",
  dueDate: "2026-10-20",
  paymentMethod: "pix",
  paymentStatus: "pending",
  ...patch,
});
const purchase = (id: string, patch: Partial<Transaction> = {}) =>
  transaction(id, {
    paymentMethod: "cartao",
    cardMode: "credito",
    cardId: "c",
    cardInvoiceMonth: "2026-10",
    ...patch,
  });
const loan = (
  id: string,
  patch: Partial<LoanReceivable> = {},
): LoanReceivable => ({
  id,
  loanId: "loan",
  contact: "Ana",
  amount: 60,
  status: "scheduled",
  collectionMode: "fixed",
  startDate: "2026-10-01",
  dueDate: "2026-10-20",
  createdAt: "2026-10-01",
  ...patch,
});
const notices = (
  patch: Partial<Parameters<typeof getPaymentNotifications>[0]> = {},
  date = today,
) =>
  getPaymentNotifications(
    { cards: [card], transactions: [], loanReceivables: [], ...patch },
    date,
  );

test("payment notices include overdue, today and seven days ahead but skip paid and distant entries", () => {
  const rows = [
    transaction("overdue", { dueDate: "2026-10-19" }),
    transaction("today"),
    transaction("seven", { dueDate: "2026-10-27" }),
    transaction("far", { dueDate: "2026-10-28" }),
    transaction("paid", { paymentStatus: "paid" }),
  ];
  assert.deepEqual(
    notices({ transactions: rows }).map((n) => [n.transactionId, n.phase]),
    [
      ["overdue", "overdue"],
      ["today", "today"],
      ["seven", "upcoming"],
    ],
  );
});

test("credit expenses generate one invoice reminder rather than a duplicate transaction reminder", () => {
  const result = notices({
    transactions: [purchase("a"), purchase("b", { amount: -70 })],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "invoice");
  assert.equal(result[0].phase, "overdue");
  assert.equal(result[0].amount, 120);
  assert.equal(result[0].invoiceMonth, "2026-10");
  assert.equal(result[0].date, "2026-10-17");
});

test("invoice reminders respect complete payment, partial payment and archived cards", () => {
  assert.equal(
    notices({ transactions: [purchase("a", { paymentStatus: "paid" })] })
      .length,
    0,
  );
  assert.equal(
    notices({
      cards: [{ ...card, archived: true }],
      transactions: [purchase("a")],
    }).length,
    0,
  );
  const result = notices({
    cards: [
      {
        ...card,
        invoicePaymentsByMonth: {
          "2026-10": { totalAmount: 50, paidAmount: 20, paymentDate: today },
        },
      },
    ],
    transactions: [purchase("a")],
  });
  assert.equal(result[0].amount, 30);
});

test("closing today uses the closing date, even when the due date is within the same horizon", () => {
  const result = notices({
    cards: [{ ...card, closingDay: 20, dueDay: 25 }],
    transactions: [purchase("a")],
  });
  assert.equal(result[0].phase, "closing");
  assert.equal(result[0].event, "closing");
  assert.equal(result[0].date, today);
});

test("upcoming closing is distinguished from upcoming due date and closing does not repeat after it passes", () => {
  const input = {
    cards: [{ ...card, closingDay: 22, dueDay: 29 }],
    transactions: [purchase("a")],
  };
  const before = notices(input);
  assert.equal(before[0].date, "2026-10-22");
  assert.equal(before[0].event, "closing");
  const after = notices(input, "2026-10-23");
  assert.equal(after[0].date, "2026-10-29");
  assert.equal(after[0].event, "due");
  assert.equal(notices(input, "2026-10-29")[0].phase, "today");
});

test("read one or all hides messages in the current opening while leaving underlying debts unpaid", () => {
  const data = {
    transactions: [transaction("a"), transaction("b")],
    loanReceivables: [loan("loan")],
  };
  const initial = notices(data);
  const snapshot = structuredClone(data);
  const read = [initial[0].id];
  assert.equal(
    notices({
      ...data,
      readPaymentNotificationIds: JSON.parse(JSON.stringify(read)),
    }).length,
    2,
  );
  assert.equal(
    notices({ ...data, readPaymentNotificationIds: initial.map((n) => n.id) })
      .length,
    0,
  );
  assert.deepEqual(data, snapshot);
  assert.ok(
    notices(
      { ...data, readPaymentNotificationIds: initial.map((n) => n.id) },
      "2026-10-21",
    ).length > 0,
  );
});

test("loan receipts reduce only the amount to receive and paid or undated loans are omitted", () => {
  const result = notices({
    loanReceivables: [
      loan("partial", {
        receipts: [
          {
            id: "receipt",
            transactionId: "receipt-t",
            amount: 20,
            date: today,
          },
        ],
      }),
      loan("paid", { status: "paid" }),
      loan("free", { collectionMode: "open", dueDate: undefined }),
      loan("far", { dueDate: "2026-11-01" }),
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].receivableId, "partial");
  assert.equal(result[0].amount, 40);
});

test("loan advances and scheduled return transactions do not duplicate loan notices", () => {
  const row = loan("r", { transactionId: "return" });
  const result = notices({
    transactions: [
      transaction("advance", { source: "loan", amount: -60 }),
      transaction("return", { source: "loan", amount: 60 }),
    ],
    loanReceivables: [row],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "loan");
});

test("borrowed-card invoice notices are optional and independent of the person's repayment", () => {
  const row = loan("r", {
    operationType: "card",
    cardId: "c",
    cardInvoiceMonth: "2026-10",
    cardClosingDate: "2026-10-10",
    dueDate: "2026-10-17",
    status: "paid",
    paymentDate: today,
  });
  assert.equal(notices({ loanReceivables: [row] }).length, 0);
  const result = notices({
    loanReceivables: [row],
    includeBorrowedCardInvoices: true,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, "invoice");
  assert.equal(result[0].amount, 60);
});

test("installment reminders use only the months in range and their exact amount", () => {
  const result = notices(
    {
      transactions: [
        purchase("parts", {
          amount: -100,
          recurrence: "parcelada",
          installments: 3,
        }),
      ],
    },
    "2026-10-17",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].invoiceMonth, "2026-10");
  assert.equal(result[0].amount, 33.34);
});

test("reading reminders does not leak between profiles or mutate input arrays", () => {
  const input = {
    cards: [card],
    transactions: [purchase("a")],
    loanReceivables: [],
  };
  const snapshot = structuredClone(input);
  const first = getPaymentNotifications(input, today);
  assert.equal(
    getPaymentNotifications(
      { ...input, readPaymentNotificationIds: first.map((n) => n.id) },
      today,
    ).length,
    0,
  );
  assert.equal(getPaymentNotifications(input, today).length, 1);
  assert.deepEqual(input, snapshot);
});
