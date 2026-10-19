import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeLoanReceivables,
  type LoanReceivable,
  type ProfileData,
} from "../src/lib/app-store";
import {
  getLoanReopenAmount,
  reopenLoanReceivable,
  updateLoanRecord,
  validateLoanRecordEdit,
} from "../src/lib/loan-record-actions";
import {
  getLoanOutstandingAmount,
  getLoanRepaymentStatus,
  recordFreeLoanReceipt,
  selectLoanReceivablesForMonth,
  settleLoanReceivables,
} from "../src/lib/loan-repayments";
import { getHomeBalance } from "../src/lib/home-balance";

const row = (patch: Partial<LoanReceivable> = {}): LoanReceivable => ({
  id: "r",
  loanId: "loan",
  contact: "Pessoa",
  amount: 300,
  collectionMode: "fixed",
  dueDate: "2026-10-17",
  startDate: "2026-10-01",
  status: "scheduled",
  createdAt: "2026-10-01",
  installment: 1,
  installments: 2,
  operationType: "loan",
  transactionId: "scheduled",
  ...patch,
});
const profile = (loanReceivables = [row()]): ProfileData => ({
  categories: [],
  cards: [],
  transactions: [
    {
      id: "salary",
      title: "Salário",
      amount: 1000,
      date: "2026-10-01",
      categoryId: "outros",
    },
    {
      id: "original",
      title: "Emprestei para Pessoa",
      amount: -600,
      date: "2026-10-01",
      categoryId: "outros",
      source: "loan",
      note: "Observação original\nReferência: loan",
    },
    {
      id: "scheduled",
      title: "Devolução",
      amount: 300,
      date: "2026-10-17",
      categoryId: "outros",
      source: "loan",
      paymentStatus: "pending",
    },
  ],
  loanReceivables,
  people: [],
  reserves: [],
  reservesInBalance: false,
  notifications: [],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
});
const free = (patch: Partial<LoanReceivable> = {}) =>
  row({
    collectionMode: "open",
    dueDate: undefined,
    status: "open",
    transactionId: undefined,
    amount: 500,
    ...patch,
  });

test("reopening a fixed installment reverses only its receipt and restores its original due date", () => {
  const sibling = row({
    id: "other",
    installment: 2,
    dueDate: "2026-11-17",
    transactionId: undefined,
  });
  const paid = settleLoanReceivables(
    profile([row(), sibling]),
    ["r"],
    "2026-10-18",
  );
  const snapshot = structuredClone(paid);
  const reopened = reopenLoanReceivable(paid, "r");
  assert.equal(getLoanReopenAmount(paid.loanReceivables[0]), 300);
  assert.equal(reopened.loanReceivables[0].status, "scheduled");
  assert.equal(reopened.loanReceivables[0].paymentDate, undefined);
  assert.equal(reopened.loanReceivables[0].dueDate, "2026-10-17");
  assert.equal(
    getLoanRepaymentStatus(reopened.loanReceivables[0], "2026-10-18"),
    "overdue",
  );
  assert.equal(reopened.loanReceivables[1], sibling);
  const transaction = reopened.transactions.find(
    (item) => item.id === "scheduled",
  )!;
  assert.equal(transaction.paymentStatus, "pending");
  assert.equal(transaction.paymentDate, undefined);
  assert.equal(transaction.date, "2026-10-17");
  assert.equal(getHomeBalance(reopened, "2026-10", "monthly").balance, 1000);
  assert.deepEqual(paid, snapshot);
  assert.equal(reopenLoanReceivable(reopened, "r"), reopened);
  const loaded = sanitizeLoanReceivables(
    JSON.parse(JSON.stringify(reopened.loanReceivables)),
  );
  assert.equal(loaded[0].status, "scheduled");
});

test("reopening a completed free loan keeps prior partial receipts and only restores the remaining balance", () => {
  let data = profile([free()]);
  data.transactions = data.transactions.filter(
    (item) => item.id !== "scheduled",
  );
  data = recordFreeLoanReceipt(data, "r", 100, "2026-10-10", "partial");
  data = recordFreeLoanReceipt(data, "r", 400, "2026-11-10", "complete");
  const reopened = reopenLoanReceivable(data, "r");
  assert.equal(getLoanReopenAmount(data.loanReceivables[0]), 400);
  assert.equal(getLoanOutstandingAmount(reopened.loanReceivables[0]), 400);
  assert.equal(reopened.loanReceivables[0].amount, 500);
  assert.equal(reopened.loanReceivables[0].status, "open");
  assert.deepEqual(
    reopened.loanReceivables[0].receipts?.map((item) => item.id),
    ["partial"],
  );
  assert.equal(
    reopened.transactions
      .filter((item) => item.paymentStatus === "paid")
      .reduce((sum, item) => sum + item.amount, 0),
    100,
  );
  assert.equal(
    selectLoanReceivablesForMonth(reopened.loanReceivables, "2027-01").length,
    1,
  );
  let repaid = recordFreeLoanReceipt(reopened, "r", 200, "2026-12-10", "next");
  repaid = settleLoanReceivables(repaid, ["r"], "2027-01-10");
  assert.equal(repaid.loanReceivables[0].status, "paid");
  assert.equal(
    repaid.transactions
      .filter((item) => item.paymentStatus === "paid")
      .reduce((sum, item) => sum + item.amount, 0),
    500,
  );
});

test("a backdated completion reopens the last saved receipt rather than the latest calendar date", () => {
  let data = profile([free()]);
  data = recordFreeLoanReceipt(data, "r", 300, "2026-12-10", "first");
  data = recordFreeLoanReceipt(data, "r", 200, "2026-11-10", "last-action");
  const reopened = reopenLoanReceivable(data, "r");
  assert.equal(getLoanOutstandingAmount(reopened.loanReceivables[0]), 200);
  assert.equal(reopened.loanReceivables[0].receipts?.[0].id, "first");
  assert.ok(
    !reopened.transactions.some((item) => item.id.endsWith("last-action")),
  );
});

test("legacy completed entries reopen without inventing a receipt or changing unrelated data", () => {
  const data = profile([row({ status: "paid", transactionId: undefined })]);
  data.transactions = data.transactions.filter(
    (item) => item.id !== "scheduled",
  );
  const reopened = reopenLoanReceivable(data, "r");
  assert.equal(getLoanOutstandingAmount(reopened.loanReceivables[0]), 300);
  assert.deepEqual(reopened.transactions, data.transactions);
  assert.equal(reopenLoanReceivable(data, "missing"), data);
  assert.equal(
    reopenLoanReceivable(profile(), "r").loanReceivables[0].status,
    "scheduled",
  );
});

test("reopening a card installment preserves card dates and all earlier partial receipts", () => {
  const card = row({
    operationType: "card",
    cardId: "card",
    cardInvoiceMonth: "2026-10",
    cardClosingDate: "2026-10-10",
    receipts: [
      {
        id: "first",
        amount: 100,
        date: "2026-10-12",
        transactionId: "first-receipt",
      },
    ],
  });
  let data = profile([card]);
  data.transactions.push({
    id: "first-receipt",
    title: "Parcial",
    amount: 100,
    date: "2026-10-12",
    categoryId: "outros",
    source: "loan",
    operationType: "card",
    paymentStatus: "paid",
  });
  data = settleLoanReceivables(data, ["r"], "2026-10-18");
  const reopened = reopenLoanReceivable(data, "r");
  const item = reopened.loanReceivables[0];
  assert.equal(item.cardId, "card");
  assert.equal(item.cardClosingDate, "2026-10-10");
  assert.equal(item.dueDate, "2026-10-17");
  assert.equal(item.collectionMode, "fixed");
  assert.equal(getLoanOutstandingAmount(item), 200);
  assert.equal(
    reopened.transactions.find((row) => row.id === "first-receipt"),
    data.transactions.find((row) => row.id === "first-receipt"),
  );
});

test("editing common fields keeps paid history intact and only changes the selected installment amount and due date", () => {
  const paidSibling = row({
    id: "paid",
    status: "paid",
    amount: 200,
    installment: 2,
    transactionId: "actual",
    dueDate: "2026-11-17",
    paymentDate: "2026-10-15",
    note: "Outra observação",
  });
  const unrelated = row({
    id: "foreign",
    loanId: "foreign",
    contact: "Outra pessoa",
  });
  const data = profile([row(), paidSibling, unrelated]);
  data.transactions.push({
    id: "actual",
    title: "Recebido",
    amount: 200,
    date: "2026-10-15",
    categoryId: "outros",
    source: "loan",
    paymentStatus: "paid",
  });
  const snapshot = structuredClone(data);
  const updated = updateLoanRecord(
    data,
    "r",
    {
      contact: "Novo nome",
      description: "Descrição",
      amount: 350,
      dueDate: "2026-10-20",
      note: "Nova observação",
    },
    "2026-10-18",
  );
  assert.equal(updated.loanReceivables[0].amount, 350);
  assert.equal(updated.loanReceivables[0].dueDate, "2026-10-20");
  assert.equal(updated.loanReceivables[1].amount, 200);
  assert.equal(updated.loanReceivables[1].dueDate, "2026-11-17");
  assert.equal(updated.loanReceivables[1].contact, "Novo nome");
  assert.equal(updated.loanReceivables[1].status, "paid");
  assert.equal(updated.loanReceivables[2], unrelated);
  assert.equal(
    updated.transactions.find((row) => row.id === "original")?.amount,
    -550,
  );
  assert.equal(
    updated.transactions.find((row) => row.id === "scheduled")?.amount,
    350,
  );
  assert.equal(
    updated.transactions.find((row) => row.id === "actual"),
    data.transactions.find((row) => row.id === "actual"),
  );
  assert.equal(getHomeBalance(updated, "2026-10", "monthly").balance, 1000);
  assert.deepEqual(data, snapshot);
});

test("invalid edits never reduce prior receipts, change paid values or detach card invoice dates", () => {
  let data = profile([free()]);
  data = recordFreeLoanReceipt(data, "r", 100, "2026-10-10", "partial");
  for (const patch of [
    { amount: 99 },
    { amount: NaN },
    { amount: 0 },
    { startDate: "2026-02-30" },
    { startDate: "2026-10-12" },
    { dueDate: "2026-11-01" },
  ]) {
    assert.ok(validateLoanRecordEdit(data, "r", patch, "2026-10-18"));
    assert.equal(updateLoanRecord(data, "r", patch, "2026-10-18"), data);
  }
  const paid = settleLoanReceivables(profile(), ["r"], "2026-10-18");
  assert.equal(updateLoanRecord(paid, "r", { amount: 500 }), paid);
  const card = profile([row({ operationType: "card" })]);
  assert.equal(updateLoanRecord(card, "r", { dueDate: "2026-10-21" }), card);
  assert.equal(
    updateLoanRecord(card, "r", { freePaymentMode: "flexible" }),
    card,
  );
});

test("free-loan edits change the remaining principal without adding monthly obligations", () => {
  let data = profile([free()]);
  data = recordFreeLoanReceipt(data, "r", 100, "2026-10-10", "partial");
  const history = data.loanReceivables[0].receipts;
  const updated = updateLoanRecord(
    data,
    "r",
    {
      amount: 600,
      freePaymentMode: "installments",
      suggestedPaymentAmount: 150,
    },
    "2026-10-18",
  );
  assert.equal(getLoanOutstandingAmount(updated.loanReceivables[0]), 500);
  assert.equal(updated.loanReceivables[0].receipts, history);
  assert.equal(updated.loanReceivables[0].dueDate, undefined);
  assert.equal(
    selectLoanReceivablesForMonth(updated.loanReceivables, "2027-02").length,
    1,
  );
  assert.equal(updated.transactions.length, data.transactions.length);
});

test("correcting principal to actual receipts completes the debt without turning a scheduled amount into a fake receipt", () => {
  const item = row({
    receipts: [
      {
        id: "partial",
        amount: 100,
        date: "2026-10-12",
        transactionId: "receipt",
      },
    ],
  });
  const data = profile([item]);
  data.transactions.push({
    id: "receipt",
    title: "Parcial",
    amount: 100,
    date: "2026-10-12",
    categoryId: "outros",
    source: "loan",
    paymentStatus: "paid",
  });
  const updated = updateLoanRecord(data, "r", { amount: 100 }, "2026-10-18");
  assert.equal(updated.loanReceivables[0].status, "paid");
  assert.equal(updated.loanReceivables[0].paymentDate, "2026-10-12");
  assert.ok(!updated.transactions.some((row) => row.id === "scheduled"));
  assert.equal(
    updated.transactions
      .filter((row) => row.paymentStatus === "paid")
      .reduce((sum, row) => sum + row.amount, 0),
    100,
  );
});

test("card edits retain the explicitly chosen current invoice even when its due date precedes the purchase", () => {
  const item = row({
    operationType: "card",
    startDate: "2026-10-20",
    cardId: "card",
    cardInvoiceMonth: "2026-10",
    cardClosingDate: "2026-10-10",
  });
  const data = profile([item]);
  const updated = updateLoanRecord(
    data,
    "r",
    { description: "Correção", amount: 350 },
    "2026-10-21",
  );
  assert.equal(updated.loanReceivables[0].amount, 350);
  assert.equal(updated.loanReceivables[0].dueDate, "2026-10-17");
  assert.equal(updated.loanReceivables[0].cardInvoiceMonth, "2026-10");
  assert.equal(updated.loanReceivables[0].cardClosingDate, "2026-10-10");
});

test("editing an amount preserves unedited notes and attachments, while explicit clearing applies to the loan", () => {
  const first = row({ note: "Primeira", attachments: ["image-one"] });
  const second = row({
    id: "second",
    note: "Segunda",
    attachments: ["image-two"],
    installment: 2,
  });
  const data = profile([first, second]);
  const amountOnly = updateLoanRecord(data, "r", { amount: 350 }, "2026-10-18");
  assert.equal(amountOnly.loanReceivables[1].note, "Segunda");
  assert.equal(amountOnly.loanReceivables[1].attachments, second.attachments);
  const cleared = updateLoanRecord(
    data,
    "r",
    { note: "", attachments: [] },
    "2026-10-18",
  );
  assert.equal(cleared.loanReceivables[0].note, undefined);
  assert.equal(cleared.loanReceivables[1].note, undefined);
  assert.deepEqual(cleared.loanReceivables[1].attachments, []);
});
