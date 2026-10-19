import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeLoanReceivables,
  type AppCard,
  type LoanReceivable,
  type ProfileData,
} from "../src/lib/app-store";
import {
  getCardLoanCycle,
  getCardLoanSchedule,
  linkCardLoanInvoice,
  needsCardLoanInvoice,
} from "../src/lib/card-loans";
import {
  getLoanOutstandingAmount,
  isFreeLoan,
  recordFreeLoanReceipt,
  settleLoanReceivables,
} from "../src/lib/loan-repayments";
import { selectTransactionLedgers } from "../src/lib/transaction-ledgers";
import {
  getLoanViewAfterInvoiceLink,
  selectLoanView,
  type LoanViewFilters,
} from "../src/lib/loan-view";
import { getDueTodayAlerts } from "../src/lib/due-today";
import { createDemoProfile } from "../src/lib/demo-examples";

const card: AppCard = {
  id: "card",
  name: "Meu cartão",
  last4: "1234",
  color: "#AF52DE",
  closingDay: 10,
  dueDay: 17,
};
const legacy: LoanReceivable = {
  id: "r",
  loanId: "loan",
  contact: "Pessoa",
  amount: 450,
  operationType: "card",
  collectionMode: "open",
  status: "open",
  createdAt: "2026-10-09",
};
const profile = (rows: LoanReceivable[] = [legacy]): ProfileData => ({
  categories: [],
  cards: [card],
  transactions: [],
  loanReceivables: rows,
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

test("borrowed cards have invoice dates and cent-exact installments", () => {
  const parts = getCardLoanSchedule(card, "2026-10-09", 100, 3);
  assert.deepEqual(
    parts.map((part) => [
      part.closingDate,
      part.dueDate,
      part.invoiceMonth,
      part.amount,
    ]),
    [
      ["2026-10-10", "2026-10-17", "2026-10", 33.34],
      ["2026-11-10", "2026-11-17", "2026-11", 33.33],
      ["2026-12-10", "2026-12-17", "2026-12", 33.33],
    ],
  );
  assert.deepEqual(
    parts.map((part) => part.installment),
    [1, 2, 3],
  );
});

test("a purchase after closing requires an explicit current or next invoice choice", () => {
  assert.equal(getCardLoanCycle(card, "2026-10-11"), null);
  assert.deepEqual(getCardLoanSchedule(card, "2026-10-11", 100, 1), []);
  assert.equal(
    getCardLoanSchedule(card, "2026-10-11", 100, 1, "2026-10")[0].dueDate,
    "2026-10-17",
  );
  assert.equal(
    getCardLoanSchedule(card, "2026-10-11", 100, 1, "2026-11")[0].dueDate,
    "2026-11-17",
  );
  assert.deepEqual(
    getCardLoanSchedule(card, "2026-10-11", 100, 1, "2027-01"),
    [],
  );
  assert.equal(getCardLoanCycle(card, "2026-10-10")?.month, "2026-10");
});

test("the explicitly chosen first invoice starts the entire installment sequence in that month", () => {
  for (const [firstMonth, dueDates] of [
    ["2026-10", ["2026-10-17", "2026-11-17", "2026-12-17"]],
    ["2026-11", ["2026-11-17", "2026-12-17", "2027-01-17"]],
  ] as const) {
    const parts = getCardLoanSchedule(card, "2026-10-18", 100, 3, firstMonth);
    assert.equal(parts[0].invoiceMonth, firstMonth);
    assert.deepEqual(
      parts.map((part) => part.dueDate),
      [...dueDates],
    );
    assert.deepEqual(
      parts.map((part) => part.installment),
      [1, 2, 3],
    );
    assert.equal(
      parts.reduce((sum, part) => sum + Math.round(part.amount * 100), 0),
      10000,
    );
  }
  assert.deepEqual(getCardLoanSchedule(card, "2026-10-18", 100, 3), []);
});

test("card installments handle due dates across years and short months", () => {
  const parts = getCardLoanSchedule(
    { ...card, closingDay: 25, dueDay: 5 },
    "2026-12-24",
    10,
    3,
  );
  assert.deepEqual(
    parts.map((part) => part.dueDate),
    ["2027-01-05", "2027-02-05", "2027-03-05"],
  );
  const short = getCardLoanSchedule(
    { ...card, closingDay: 20, dueDay: 31 },
    "2027-01-19",
    2,
    2,
  );
  assert.deepEqual(
    short.map((part) => part.dueDate),
    ["2027-01-31", "2027-02-28"],
  );
});

test("missing card settings, archived cards and invalid schedules cannot create card debts", () => {
  for (const selected of [
    undefined,
    { ...card, dueDay: undefined },
    { ...card, closingDay: 0 },
    { ...card, archived: true },
  ])
    assert.deepEqual(getCardLoanSchedule(selected, "2026-10-09", 10, 1), []);
  for (const count of [0, 49, 1.5])
    assert.deepEqual(getCardLoanSchedule(card, "2026-10-09", 10, count), []);
  for (const amount of [0, -10, NaN, Infinity, 0.01])
    assert.deepEqual(getCardLoanSchedule(card, "2026-10-09", amount, 2), []);
  assert.deepEqual(getCardLoanSchedule(card, "2026-02-30", 10, 1), []);
});

test("legacy card records cannot be classified or received as free loans", () => {
  const data = profile();
  assert.equal(isFreeLoan(legacy), false);
  assert.equal(needsCardLoanInvoice(legacy), true);
  assert.equal(
    recordFreeLoanReceipt(data, "r", 100, "2026-10-20", "receipt"),
    data,
  );
  assert.equal(settleLoanReceivables(data, ["r"], "2026-10-20"), data);
  const filters = {
    selectedMonth: "2026-10",
    selectedMonths: [],
    scope: "period" as const,
    tab: "cartao" as const,
    status: "all" as const,
    query: "",
  };
  assert.equal(
    selectLoanView([legacy], { ...filters, mode: "fixed" }, "2026-10-20")
      .length,
    1,
  );
  assert.equal(
    selectLoanView(
      [legacy],
      { ...filters, mode: "free-flexible" },
      "2026-10-20",
    ).length,
    0,
  );
  assert.equal(isFreeLoan({ ...legacy, operationType: "loan" }), true);
});

test("linking a legacy purchase preserves original amounts, attachments and receipt history", () => {
  const previous = {
    id: "part",
    amount: 100,
    date: "2026-10-12",
    transactionId: "receipt",
  };
  const item = {
    ...legacy,
    receipts: [previous],
    note: "Observação",
    attachments: ["anexo"],
  };
  const unrelated = {
    ...legacy,
    id: "other",
    loanId: "other",
    operationType: "loan" as const,
  };
  const data = profile([item, unrelated]);
  data.transactions = [
    {
      id: "receipt",
      title: "Recebido",
      categoryId: "outros",
      amount: 100,
      date: "2026-10-12",
      source: "loan",
      operationType: "card",
      paymentStatus: "paid",
    },
  ];
  const snapshot = structuredClone(data);
  const result = linkCardLoanInvoice(data, "r", "card", "2026-10-09");
  const linked = result.loanReceivables[0];
  assert.equal(linked.amount, 450);
  assert.equal(getLoanOutstandingAmount(linked), 350);
  assert.equal(linked.dueDate, "2026-10-17");
  assert.equal(linked.cardClosingDate, "2026-10-10");
  assert.equal(linked.collectionMode, "fixed");
  assert.equal(needsCardLoanInvoice(linked), false);
  assert.deepEqual(linked.receipts, [previous]);
  assert.equal(linked.attachments, item.attachments);
  assert.equal(linked.note, item.note);
  assert.equal(result.loanReceivables[1], unrelated);
  assert.deepEqual(result.transactions, data.transactions);
  assert.deepEqual(data, snapshot);
  const paid = settleLoanReceivables(result, ["r"], "2026-10-20");
  assert.equal(
    paid.transactions.reduce((sum, row) => sum + row.amount, 0),
    450,
  );
  assert.equal(paid.transactions[0].amount, 350);
  assert.equal(paid.loanReceivables[0].status, "paid");
  assert.equal(paid.loanReceivables[0].receipts?.length, 2);
  assert.equal(
    selectTransactionLedgers(paid.transactions, paid.loanReceivables)
      .regularTransactions.length,
    0,
  );
  assert.equal(settleLoanReceivables(paid, ["r"], "2026-10-21"), paid);
});

test("linking a multi-installment purchase updates each invoice without changing paid receipts", () => {
  const first = {
    ...legacy,
    amount: 200,
    installment: 1,
    installments: 2,
    status: "paid" as const,
    paymentDate: "2026-10-17",
    transactionId: "paid",
  };
  const second = {
    ...legacy,
    id: "r2",
    amount: 250,
    installment: 2,
    installments: 2,
    transactionId: "scheduled",
  };
  const data = profile([first, second]);
  data.transactions = [
    {
      id: "paid",
      title: "Recebido",
      categoryId: "outros",
      amount: 200,
      date: "2026-10-17",
      paymentStatus: "paid",
    },
    {
      id: "scheduled",
      title: "A receber",
      categoryId: "outros",
      amount: 250,
      date: "2026-10-17",
      paymentStatus: "pending",
    },
  ];
  const result = linkCardLoanInvoice(data, "r2", "card", "2026-10-09");
  assert.deepEqual(
    result.loanReceivables.map((row) => [row.amount, row.dueDate]),
    [
      [200, "2026-10-17"],
      [250, "2026-11-17"],
    ],
  );
  assert.equal(result.transactions[0], data.transactions[0]);
  assert.equal(result.transactions[1].date, "2026-11-17");
  assert.equal(result.loanReceivables[0].status, "paid");
});

test("invalid legacy linking never guesses a card or alters existing data", () => {
  const data = profile();
  assert.equal(linkCardLoanInvoice(data, "r", "missing", "2026-10-09"), data);
  assert.equal(linkCardLoanInvoice(data, "r", "card", "2026-10-11"), data);
  assert.equal(
    linkCardLoanInvoice(data, "missing", "card", "2026-10-09"),
    data,
  );
  const withReceipt = profile([
    {
      ...legacy,
      receipts: [
        { id: "a", amount: 10, date: "2026-10-09", transactionId: "a" },
      ],
    },
  ]);
  assert.equal(
    linkCardLoanInvoice(withReceipt, "r", "card", "2026-10-10"),
    withReceipt,
  );
});

test("card dates and money-only free rules survive reload and create real due reminders", () => {
  const data = linkCardLoanInvoice(profile(), "r", "card", "2026-10-09");
  const loaded = sanitizeLoanReceivables(
    JSON.parse(JSON.stringify(data.loanReceivables)),
  );
  assert.equal(loaded[0].cardId, "card");
  assert.equal(loaded[0].cardInvoiceMonth, "2026-10");
  assert.equal(loaded[0].cardClosingDate, "2026-10-10");
  assert.equal(loaded[0].dueDate, "2026-10-17");
  assert.equal(isFreeLoan(loaded[0]), false);
  assert.equal(
    getDueTodayAlerts([], [], loaded, new Date(2026, 9, 17, 12)).length,
    1,
  );
  const old = sanitizeLoanReceivables([legacy])[0];
  assert.equal(old.collectionMode, "fixed");
  assert.equal(old.dueDate, undefined);
  assert.equal(needsCardLoanInvoice(old), true);
});

test("new card demonstration entries have a selected card and invoice dates", () => {
  const demo = createDemoProfile(profile([]), new Date(2026, 9, 18, 12));
  const item = demo.data.loanReceivables.find(
    (row) => row.operationType === "card",
  )!;
  assert.equal(needsCardLoanInvoice(item), false);
  assert.equal(isFreeLoan(item), false);
  assert.equal(item.dueDate, "2026-10-26");
});

const cardView = (patch: Partial<LoanViewFilters> = {}): LoanViewFilters => ({
  selectedMonth: "2026-10",
  selectedMonths: [],
  scope: "period",
  tab: "cartao",
  status: "all",
  mode: "all",
  query: "",
  ...patch,
});

test("linking the next invoice follows its month and keeps the same borrowed-card record visible", () => {
  const before = profile();
  const filters = cardView();
  assert.equal(
    selectLoanView(before.loanReceivables, filters, "2026-10-18").length,
    1,
  );
  const linked = linkCardLoanInvoice(
    before,
    "r",
    "card",
    "2026-10-18",
    "2026-11",
  );
  const item = linked.loanReceivables[0];
  assert.equal(
    selectLoanView(linked.loanReceivables, filters, "2026-10-18").length,
    0,
  );
  const next = getLoanViewAfterInvoiceLink(item, filters, "2026-10-18");
  assert.equal(next.selectedMonth, "2026-11");
  const reloaded = sanitizeLoanReceivables(
    JSON.parse(JSON.stringify(linked.loanReceivables)),
  );
  const visible = selectLoanView(reloaded, next, "2026-10-18");
  assert.deepEqual(
    visible.map((row) => [row.id, row.loanId, row.amount, row.operationType]),
    [["r", "loan", 450, "card"]],
  );
  assert.equal(visible[0].dueDate, "2026-11-17");
  assert.equal(
    selectLoanView(reloaded, { ...next, tab: "dinheiro" }, "2026-10-18").length,
    0,
  );
  assert.equal(linked.loanReceivables.length, before.loanReceivables.length);
  assert.deepEqual(linked.transactions, before.transactions);
  assert.equal(before.loanReceivables[0], legacy);
});

test("linking a later installment follows that installment's invoice across the year", () => {
  const data = profile([
    { ...legacy, installment: 1, installments: 2 },
    { ...legacy, id: "second", installment: 2, installments: 2, amount: 200 },
  ]);
  const linked = linkCardLoanInvoice(
    data,
    "second",
    "card",
    "2026-11-18",
    "2026-12",
  );
  const selected = linked.loanReceivables[1];
  const next = getLoanViewAfterInvoiceLink(
    selected,
    cardView({ selectedMonth: "2026-11" }),
    "2026-11-18",
  );
  assert.equal(next.selectedMonth, "2027-01");
  assert.equal(selected.dueDate, "2027-01-17");
  assert.ok(
    selectLoanView(linked.loanReceivables, next, "2026-11-18").some(
      (item) => item.id === "second",
    ),
  );
  assert.deepEqual(
    linked.loanReceivables.map((item) => item.amount),
    [450, 200],
  );
});

test("invoice linking keeps a compatible month, date range or history filter unchanged", () => {
  const item = linkCardLoanInvoice(
    profile(),
    "r",
    "card",
    "2026-10-18",
    "2026-10",
  ).loanReceivables[0];
  for (const filters of [
    cardView({ status: "pending", mode: "fixed", query: "Pessoa" }),
    cardView({ selectedMonths: ["2026-10", "2026-11"] }),
    cardView({ fromDate: "2026-10-17", untilDate: "2026-10-17" }),
    cardView({ scope: "all" }),
  ]) {
    assert.equal(
      getLoanViewAfterInvoiceLink(item, filters, "2026-10-18"),
      filters,
    );
    assert.equal(selectLoanView([item], filters, "2026-10-18").length, 1);
  }
});

test("a linked invoice clears only an incompatible view and remains recoverable in all history", () => {
  const item = linkCardLoanInvoice(
    profile(),
    "r",
    "card",
    "2026-10-18",
    "2026-11",
  ).loanReceivables[0];
  const filters = cardView({
    selectedMonths: ["2026-09", "2026-10"],
    fromDate: "2026-10-09",
    untilDate: "2026-10-09",
    query: "Pessoa",
  });
  const snapshot = structuredClone(filters);
  const next = getLoanViewAfterInvoiceLink(item, filters, "2026-10-18");
  assert.equal(next.selectedMonth, "2026-11");
  assert.deepEqual(next.selectedMonths, []);
  assert.equal(next.fromDate, null);
  assert.equal(next.untilDate, null);
  assert.equal(selectLoanView([item], next, "2026-10-18").length, 1);
  assert.equal(
    selectLoanView([item], cardView({ scope: "all" }), "2026-10-18").length,
    1,
  );
  assert.deepEqual(filters, snapshot);
  assert.equal(
    getLoanViewAfterInvoiceLink(legacy, filters, "2026-10-18"),
    filters,
  );
});
