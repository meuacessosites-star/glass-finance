import { test } from "node:test";
import assert from "node:assert/strict";
import type { LoanReceivable } from "../src/lib/app-store";
import {
  getLoanMonthOptions,
  getLoanAttachments,
  getLoanViewSummary,
  selectLoanView,
  type LoanViewFilters,
} from "../src/lib/loan-view";
import { getLoanOutstandingAmount } from "../src/lib/loan-repayments";
import type { Transaction } from "../src/lib/mock-data";

const today = "2026-10-20";
const row = (
  id: string,
  patch: Partial<LoanReceivable> = {},
): LoanReceivable => ({
  id,
  loanId: id,
  contact: "Pessoa",
  amount: 300,
  status: "scheduled",
  collectionMode: "fixed",
  startDate: "2026-10-01",
  createdAt: "2026-10-01",
  dueDate: "2026-10-20",
  operationType: "loan",
  ...patch,
});
const free = (id: string, patch: Partial<LoanReceivable> = {}) =>
  row(id, {
    collectionMode: "open",
    dueDate: undefined,
    status: "open",
    ...patch,
  });
const filters = (patch: Partial<LoanViewFilters> = {}): LoanViewFilters => ({
  selectedMonth: "2026-10",
  selectedMonths: [],
  scope: "period",
  tab: "dinheiro",
  status: "all",
  mode: "all",
  query: "",
  ...patch,
});
const ids = (rows: LoanReceivable[]) => rows.map((item) => item.id).sort();

test("selecting several loan months deduplicates carried balances and includes the right installments", () => {
  const rows = [
    free("open"),
    row("october"),
    row("november", { dueDate: "2026-11-20" }),
    row("december", { dueDate: "2026-12-20" }),
  ];
  assert.deepEqual(ids(selectLoanView(rows, filters(), today)), [
    "october",
    "open",
  ]);
  assert.deepEqual(
    ids(
      selectLoanView(
        rows,
        filters({ selectedMonths: ["2026-10", "2026-11", "2026-11"] }),
        today,
      ),
    ),
    ["november", "october", "open"],
  );
  assert.equal(
    selectLoanView(
      rows,
      filters({ selectedMonths: ["2026-10", "2026-11"] }),
      today,
    ).filter((item) => item.id === "open").length,
    1,
  );
});

test("a single-day filter uses actual fixed dates and keeps undated open loans visible", () => {
  const rows = [
    row("day20"),
    row("day21", { dueDate: "2026-10-21" }),
    row("old-due", { dueDate: "2026-10-19" }),
    free("open"),
    free("later", { startDate: "2026-10-21" }),
  ];
  assert.deepEqual(
    ids(
      selectLoanView(
        rows,
        filters({ fromDate: "2026-10-20", untilDate: "2026-10-20" }),
        today,
      ),
    ),
    ["day20", "open"],
  );
});

test("date ranges include actual receipt dates, with inclusive boundaries across years", () => {
  const rows = [
    row("received", {
      status: "paid",
      dueDate: "2026-10-20",
      paymentDate: "2026-12-31",
    }),
    row("first", { dueDate: "2027-01-01" }),
    row("outside", { dueDate: "2027-01-02" }),
  ];
  assert.deepEqual(
    ids(
      selectLoanView(
        rows,
        filters({ fromDate: "2026-12-31", untilDate: "2027-01-01" }),
        today,
      ),
    ),
    ["first", "received"],
  );
});

test("search matches people, descriptions and observations without depending on accents or case", () => {
  const rows = [
    row("person", { contact: "João" }),
    row("description", { description: "Devolução do cartão" }),
    row("note", { note: "Observação combinada", draftDisplay: "hidden" }),
  ];
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ query: " JOAO " }), today)),
    ["person"],
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ query: "devolucao" }), today)),
    ["description"],
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ query: "OBSERVACAO" }), today)),
    ["note"],
  );
});

test("the mode filter distinguishes fixed, free installments and indefinite loans", () => {
  const rows = [
    row("fixed"),
    free("installments", {
      freePaymentMode: "installments",
      suggestedPaymentAmount: 100,
    }),
    free("flexible", { freePaymentMode: "flexible" }),
    free("legacy"),
  ];
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ mode: "fixed" }), today)),
    ["fixed"],
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ mode: "free-installments" }), today)),
    ["installments"],
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ mode: "free-flexible" }), today)),
    ["flexible", "legacy"],
  );
});

test("status, mode, text and borrowed-card filters all narrow the same visible rows", () => {
  const rows = [
    row("overdue", { contact: "João", dueDate: "2026-10-19" }),
    row("current", { contact: "João" }),
    free("free", { contact: "João" }),
    row("card", {
      contact: "João",
      dueDate: "2026-10-19",
      operationType: "card",
      cardId: "selected-card",
      cardInvoiceMonth: "2026-10",
      cardClosingDate: "2026-10-10",
    }),
    row("paid", { contact: "João", status: "paid", paymentDate: today }),
  ];
  assert.deepEqual(
    ids(
      selectLoanView(
        rows,
        filters({ status: "overdue", mode: "fixed", query: "joao" }),
        today,
      ),
    ),
    ["overdue"],
  );
  assert.deepEqual(
    ids(
      selectLoanView(
        rows,
        filters({ status: "overdue", tab: "cartao" }),
        today,
      ),
    ),
    ["card"],
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ status: "paid" }), today)),
    ["paid"],
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ status: "pending" }), today)),
    ["current", "free", "overdue"],
  );
});

test("all-history search can locate concluded loans outside the chosen month", () => {
  const rows = [
    row("old", {
      contact: "João",
      status: "paid",
      dueDate: "2026-08-20",
      paymentDate: "2026-08-20",
    }),
  ];
  assert.equal(
    selectLoanView(rows, filters({ query: "joao" }), today).length,
    0,
  );
  assert.deepEqual(
    ids(selectLoanView(rows, filters({ query: "joao", scope: "all" }), today)),
    ["old"],
  );
});

test("a concluded undated loan disappears from day ranges after its completion", () => {
  const rows = [free("paid", { status: "paid", paymentDate: "2026-10-10" })];
  assert.equal(
    selectLoanView(
      rows,
      filters({ fromDate: "2026-10-10", untilDate: "2026-10-10" }),
      today,
    ).length,
    1,
  );
  assert.equal(
    selectLoanView(
      rows,
      filters({ fromDate: "2026-10-11", untilDate: "2026-10-11" }),
      today,
    ).length,
    0,
  );
});

test("month options fill gaps for free loans and span calendar years without changing records", () => {
  const rows = [
    free("open", { startDate: "2026-08-19", createdAt: "2026-08-19" }),
    row("future", { dueDate: "2027-01-20" }),
  ];
  const before = structuredClone(rows);
  assert.deepEqual(getLoanMonthOptions(rows, "2026-10", "2026-10"), [
    "2027-01",
    "2026-12",
    "2026-11",
    "2026-10",
    "2026-09",
    "2026-08",
  ]);
  assert.deepEqual(getLoanMonthOptions([], "2026-10", "2026-10"), ["2026-10"]);
  assert.deepEqual(rows, before);
});

test("combined filters keep the remaining balance once and reject invalid date ranges", () => {
  const rows = [
    free("partial", {
      amount: 1000,
      freePaymentMode: "installments",
      suggestedPaymentAmount: 200,
      receipts: [
        {
          id: "payment",
          amount: 200,
          date: "2026-10-15",
          transactionId: "receipt",
        },
      ],
    }),
  ];
  const visible = selectLoanView(
    rows,
    filters({
      selectedMonths: ["2026-10", "2026-11"],
      mode: "free-installments",
      status: "pending",
    }),
    today,
  );
  assert.equal(visible.length, 1);
  assert.equal(
    visible.reduce((total, item) => total + getLoanOutstandingAmount(item), 0),
    800,
  );
  assert.equal(rows[0].amount, 1000);
  assert.equal(
    selectLoanView(
      rows,
      filters({ fromDate: "2026-10-20", untilDate: "2026-10-19" }),
      today,
    ).length,
    0,
  );
  assert.equal(
    selectLoanView(
      rows,
      filters({ fromDate: "2026-99-20", untilDate: "2026-99-20" }),
      today,
    ).length,
    0,
  );
});

const statement = (
  id: string,
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: "Empréstimo",
  categoryId: "outros",
  amount: -300,
  date: "2026-10-01",
  source: "loan",
  ...patch,
});

test("loan attachment indicators count saved images and documents independently of observation visibility", () => {
  const attachments = [
    "data:image/jpeg;base64,photo",
    "data:application/pdf;base64,file",
  ];
  const item = row("loan", { attachments, draftDisplay: "hidden" });
  const transactions = [
    statement("original", { note: "Referência: loan", attachments: ["old"] }),
  ];
  assert.equal(getLoanAttachments(item, transactions), attachments);
  assert.equal(getLoanAttachments(item, transactions).length, 2);
});

test("legacy loan attachments fall back from the linked statement to the exact original loan", () => {
  const item = row("loan", { transactionId: "scheduled" });
  const attachments = ["photo", "file"];
  const transactions = [
    statement("wrong", {
      note: "Referência: loan-other",
      attachments: ["unrelated"],
    }),
    statement("scheduled", { amount: 300 }),
    statement("original", {
      note: "Observação\nReferência: loan",
      attachments,
    }),
  ];
  const snapshot = structuredClone(transactions);
  assert.equal(getLoanAttachments(item, transactions), attachments);
  assert.deepEqual(transactions, snapshot);
  assert.deepEqual(getLoanAttachments(item, [transactions[0]]), []);
});

test("explicitly removed attachments remain removed and linked receipt files are preserved", () => {
  const transactions = [
    statement("linked", { amount: 300, attachments: ["receipt"] }),
    statement("original", { note: "Referência: loan", attachments: ["old"] }),
  ];
  assert.deepEqual(
    getLoanAttachments(
      row("loan", { transactionId: "linked", attachments: [] }),
      transactions,
    ),
    [],
  );
  assert.deepEqual(
    getLoanAttachments(row("loan", { transactionId: "linked" }), transactions),
    ["receipt"],
  );
});

test("loan summaries split the actual remainder from partial receipts in the selected month", () => {
  const items = [
    free("partial", {
      amount: 1000,
      startDate: "2026-09-01",
      receipts: [
        { id: "sep", amount: 100, date: "2026-09-30", transactionId: "sep" },
        { id: "oct", amount: 200, date: "2026-10-15", transactionId: "oct" },
      ],
    }),
    row("paid", { status: "paid", paymentDate: "2026-10-19" }),
  ];
  const before = structuredClone(items);
  assert.deepEqual(
    getLoanViewSummary(selectLoanView(items, filters(), today), filters()),
    {
      outstanding: 700,
      received: 500,
    },
  );
  assert.deepEqual(
    getLoanViewSummary(
      selectLoanView(items, filters({ selectedMonth: "2026-11" }), today),
      filters({ selectedMonth: "2026-11" }),
    ),
    {
      outstanding: 700,
      received: 0,
    },
  );
  assert.deepEqual(items, before);
});

test("received totals use actual payment dates rather than invoice due dates", () => {
  const item = row("card", {
    operationType: "card",
    cardId: "card",
    cardInvoiceMonth: "2026-10",
    cardClosingDate: "2026-10-10",
    dueDate: "2026-10-17",
    status: "paid",
    paymentDate: "2026-11-02",
  });
  const october = filters({ tab: "cartao" });
  const november = filters({ tab: "cartao", selectedMonth: "2026-11" });
  assert.deepEqual(
    getLoanViewSummary(selectLoanView([item], october, today), october),
    { outstanding: 0, received: 0 },
  );
  assert.deepEqual(
    getLoanViewSummary(selectLoanView([item], november, today), november),
    { outstanding: 0, received: 300 },
  );
});

test("receipt totals respect exact day ranges, multiple months and all-history scope", () => {
  const item = free("partial", {
    amount: 0.3,
    startDate: "2026-09-01",
    receipts: [
      { id: "a", amount: 0.1, date: "2026-09-30", transactionId: "a" },
      { id: "b", amount: 0.05, date: "2026-10-01", transactionId: "b" },
      { id: "c", amount: 0.05, date: "2026-10-02", transactionId: "c" },
    ],
  });
  assert.deepEqual(
    getLoanViewSummary(
      [item],
      filters({ fromDate: "2026-09-30", untilDate: "2026-10-01" }),
    ),
    { outstanding: 0.1, received: 0.15 },
  );
  assert.equal(
    getLoanViewSummary([item], filters({ fromDate: "2026-10-02" })).received,
    0.05,
  );
  assert.equal(
    getLoanViewSummary(
      [item],
      filters({ selectedMonths: ["2026-09", "2026-10", "2026-10"] }),
    ).received,
    0.2,
  );
  assert.equal(
    getLoanViewSummary(
      [item],
      filters({ scope: "all", selectedMonth: "2027-01" }),
    ).received,
    0.2,
  );
});

test("loan summaries follow the same person, status and operation filters as the list", () => {
  const items = [
    free("joao", {
      contact: "João",
      receipts: [{ id: "a", amount: 25, date: today, transactionId: "a" }],
    }),
    row("paid", { contact: "João", status: "paid", paymentDate: today }),
    row("other", { contact: "Maria" }),
    row("card", {
      contact: "João",
      operationType: "card",
      cardId: "card",
      cardInvoiceMonth: "2026-10",
      cardClosingDate: "2026-10-10",
    }),
  ];
  const selected = filters({ query: "joao", status: "pending" });
  assert.deepEqual(
    getLoanViewSummary(selectLoanView(items, selected, today), selected),
    { outstanding: 275, received: 25 },
  );
  const paid = filters({ query: "joao", status: "paid" });
  assert.deepEqual(
    getLoanViewSummary(selectLoanView(items, paid, today), paid),
    { outstanding: 0, received: 300 },
  );
  assert.deepEqual(getLoanViewSummary([], filters()), {
    outstanding: 0,
    received: 0,
  });
});

test("legacy completion totals never invent dates or double count partial receipts", () => {
  const items = [
    row("unknown-date", { status: "paid" }),
    free("completed", {
      amount: 500,
      startDate: "2026-09-01",
      status: "paid",
      paymentDate: today,
      receipts: [
        { id: "old", amount: 100, date: "2026-09-30", transactionId: "old" },
        { id: "new", amount: 400, date: today, transactionId: "new" },
      ],
    }),
  ];
  assert.equal(getLoanViewSummary(items, filters()).received, 400);
  assert.equal(
    getLoanViewSummary(items, filters({ scope: "all" })).received,
    800,
  );
  const reopened = {
    ...items[1],
    status: "open" as const,
    paymentDate: undefined,
    receipts: items[1].receipts!.slice(0, 1),
  };
  assert.deepEqual(getLoanViewSummary([reopened], filters()), {
    outstanding: 400,
    received: 0,
  });
});
