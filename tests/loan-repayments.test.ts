import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeLoanReceivables,
  type LoanReceivable,
  type ProfileData,
} from "../src/lib/app-store";
import {
  getLoanOutstandingAmount,
  getLoanReceivedAmount,
  getSuggestedLoanReceiptAmount,
  recordFreeLoanReceipt,
  sanitizeLoanReceipts,
  getLoanRepaymentStatus,
  isFreeLoan,
  scheduledLoanDueDates,
  selectLoanReceivablesForMonth,
  settleLoanReceivables,
} from "../src/lib/loan-repayments";
import { selectTransactionLedgers } from "../src/lib/transaction-ledgers";
import { getDueTodayAlerts } from "../src/lib/due-today";

const receipt = (patch: Partial<LoanReceivable> = {}): LoanReceivable => ({
  id: "r1",
  loanId: "l1",
  contact: "Pessoa",
  amount: 100,
  collectionMode: "fixed",
  startDate: "2026-10-10",
  createdAt: "2026-10-10",
  dueDate: "2026-10-19",
  status: "scheduled",
  operationType: "loan",
  ...patch,
});
const free = (patch: Partial<LoanReceivable> = {}) =>
  receipt({
    collectionMode: "open",
    dueDate: undefined,
    status: "open",
    ...patch,
  });
const profile = (loanReceivables: LoanReceivable[] = []): ProfileData => ({
  categories: [],
  cards: [],
  transactions: [],
  loanReceivables,
  people: [],
  reserves: [],
  reservesInBalance: true,
  notifications: [],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
});

test("fixed receipts use the chosen monthly day and start no earlier than the loan", () => {
  assert.deepEqual(scheduledLoanDueDates("2026-10-10", 19, 3), [
    "2026-10-19",
    "2026-11-19",
    "2026-12-19",
  ]);
  assert.deepEqual(scheduledLoanDueDates("2026-10-20", 19, 2), [
    "2026-11-19",
    "2026-12-19",
  ]);
  assert.deepEqual(scheduledLoanDueDates("2026-10-19", 19, 1), ["2026-10-19"]);
});

test("day 31 survives short months, leap years and year changes", () => {
  assert.deepEqual(scheduledLoanDueDates("2027-01-01", 31, 3), [
    "2027-01-31",
    "2027-02-28",
    "2027-03-31",
  ]);
  assert.deepEqual(scheduledLoanDueDates("2028-01-01", 31, 3), [
    "2028-01-31",
    "2028-02-29",
    "2028-03-31",
  ]);
  assert.deepEqual(scheduledLoanDueDates("2026-12-20", 19, 2), [
    "2027-01-19",
    "2027-02-19",
  ]);
  for (const [date, day, count] of [
    ["2026-99-01", 19, 2],
    ["2026-02-30", 19, 2],
    ["", 19, 2],
    ["2026-10-10", 0, 2],
    ["2026-10-10", 19, 0],
    ["2026-10-10", 19, 1.5],
    ["2026-10-10", 19, 49],
  ] as const)
    assert.deepEqual(scheduledLoanDueDates(date, day, count), []);
});

test("free loans carry through every following month once without acquiring a due date", () => {
  const item = free();
  const before = structuredClone(item);
  assert.deepEqual(selectLoanReceivablesForMonth([item], "2026-09"), []);
  for (const month of ["2026-10", "2026-11", "2026-12", "2027-01", "2028-10"]) {
    assert.deepEqual(selectLoanReceivablesForMonth([item], month), [item]);
    assert.equal(getLoanRepaymentStatus(item, `${month}-28`), "open");
  }
  assert.deepEqual(item, before);
  assert.equal(item.dueDate, undefined);
});

test("fixed overdue receipts carry their original dates while future installments stay in their own months", () => {
  const items = [
    receipt(),
    receipt({ id: "r2", dueDate: "2026-11-19", installment: 2 }),
    receipt({ id: "r3", dueDate: "2026-12-19", installment: 3 }),
  ];
  assert.deepEqual(
    selectLoanReceivablesForMonth(items, "2026-10").map((item) => item.id),
    ["r1"],
  );
  assert.deepEqual(
    selectLoanReceivablesForMonth(items, "2026-11").map((item) => item.id),
    ["r1", "r2"],
  );
  assert.equal(getLoanRepaymentStatus(items[0], "2026-10-19"), "pending");
  assert.equal(getLoanRepaymentStatus(items[0], "2026-10-20"), "overdue");
  assert.equal(items[0].dueDate, "2026-10-19");
});

test("receiving a free loan closes it, stores the payment date and removes future pending months", () => {
  const data = profile([free()]);
  const paid = settleLoanReceivables(data, ["r1"], "2026-12-03");
  assert.equal(paid.loanReceivables[0].status, "paid");
  assert.equal(paid.loanReceivables[0].dueDate, undefined);
  assert.equal(paid.loanReceivables[0].paymentDate, "2026-12-03");
  assert.equal(getLoanRepaymentStatus(paid.loanReceivables[0]), "paid");
  assert.equal(
    selectLoanReceivablesForMonth(paid.loanReceivables, "2026-12").length,
    1,
  );
  assert.equal(
    selectLoanReceivablesForMonth(paid.loanReceivables, "2027-01").length,
    0,
  );
  assert.equal(paid.transactions.length, 1);
  assert.equal(paid.transactions[0].paymentDate, "2026-12-03");
  assert.equal(
    selectTransactionLedgers(paid.transactions, paid.loanReceivables)
      .regularTransactions.length,
    0,
  );
  assert.equal(settleLoanReceivables(paid, ["r1"], "2026-12-04"), paid);
  assert.equal(data.loanReceivables[0].status, "open");
});

test("receiving one fixed installment updates its saved statement only and preserves the remaining loan", () => {
  const data = profile([
    receipt({ transactionId: "t1", installments: 3, installment: 1 }),
    receipt({
      id: "r2",
      dueDate: "2026-11-19",
      installments: 3,
      installment: 2,
    }),
    receipt({
      id: "r3",
      dueDate: "2026-12-19",
      installments: 3,
      installment: 3,
    }),
  ]);
  data.transactions = [
    {
      id: "t1",
      title: "Parcela 1/3",
      categoryId: "outros",
      amount: 100,
      date: "2026-10-19",
      source: "loan",
      paymentStatus: "pending",
      note: "Minha observação",
      attachments: ["anexo"],
    },
    {
      id: "normal",
      title: "Salário",
      categoryId: "salario",
      amount: 2000,
      date: "2026-10-10",
    },
  ];
  const paid = settleLoanReceivables(data, ["r1"], "2026-10-19");
  assert.equal(paid.transactions.length, 2);
  assert.equal(paid.transactions[0].paymentStatus, "paid");
  assert.equal(paid.transactions[0].note, "Minha observação");
  assert.deepEqual(paid.transactions[0].attachments, ["anexo"]);
  assert.equal(paid.transactions[1], data.transactions[1]);
  assert.deepEqual(
    paid.loanReceivables.map((item) => item.status),
    ["paid", "scheduled", "scheduled"],
  );
  assert.deepEqual(
    selectLoanReceivablesForMonth(paid.loanReceivables, "2026-11").map(
      (item) => item.id,
    ),
    ["r2"],
  );
  assert.equal(paid.loanReceivables[2], data.loanReceivables[2]);
});

test("all fixed installments can be concluded without recreating monthly receipts", () => {
  const items = [
    receipt(),
    receipt({ id: "r2", dueDate: "2026-11-19" }),
    receipt({ id: "r3", dueDate: "2026-12-19" }),
  ];
  let data = profile(items);
  for (const item of items)
    data = settleLoanReceivables(data, [item.id], item.dueDate);
  assert.ok(data.loanReceivables.every((item) => item.status === "paid"));
  assert.equal(data.transactions.length, 3);
  assert.deepEqual(
    selectLoanReceivablesForMonth(data.loanReceivables, "2027-01"),
    [],
  );
  assert.equal(
    settleLoanReceivables(
      data,
      items.map((item) => item.id),
    ),
    data,
  );
});

test("early and late receipts remain available in the month they were actually received", () => {
  const early = settleLoanReceivables(
    profile([receipt({ dueDate: "2026-11-19" })]),
    ["r1"],
    "2026-10-19",
  );
  assert.equal(
    selectLoanReceivablesForMonth(early.loanReceivables, "2026-10").length,
    1,
  );
  const late = settleLoanReceivables(
    profile([receipt()]),
    ["r1"],
    "2027-01-02",
  );
  assert.equal(
    selectLoanReceivablesForMonth(late.loanReceivables, "2027-01").length,
    1,
  );
  assert.equal(
    selectLoanReceivablesForMonth(late.loanReceivables, "2027-02").length,
    0,
  );
});

test("loan mode and actual loan/payment dates survive saving and reload, including legacy free loans", () => {
  const paid = settleLoanReceivables(
    profile([free({ startDate: "2026-08-19", createdAt: "2026-10-17" })]),
    ["r1"],
    "2026-11-20",
  );
  const loaded = sanitizeLoanReceivables(
    JSON.parse(JSON.stringify(paid.loanReceivables)),
  );
  assert.equal(loaded[0].collectionMode, "open");
  assert.equal(loaded[0].startDate, "2026-08-19");
  assert.equal(loaded[0].paymentDate, "2026-11-20");
  assert.equal(isFreeLoan(loaded[0]), true);
  assert.equal(selectLoanReceivablesForMonth(loaded, "2026-08").length, 1);
  const legacy = free({ collectionMode: undefined, startDate: undefined });
  assert.equal(isFreeLoan(sanitizeLoanReceivables([legacy])[0]), true);
  assert.equal(selectLoanReceivablesForMonth([legacy], "2026-11").length, 1);
});

test("only unpaid fixed due dates create reminders; free and settled loans never become overdue", () => {
  const items = [
    receipt(),
    free({ id: "free" }),
    receipt({ id: "paid", status: "paid" }),
  ];
  const now = new Date(2026, 9, 20, 12);
  assert.deepEqual(
    getDueTodayAlerts([], [], items, now).map((item) => item.id),
    ["loan-r1"],
  );
  assert.deepEqual(
    getDueTodayAlerts(
      [],
      [],
      settleLoanReceivables(profile(items), ["r1"], "2026-10-20")
        .loanReceivables,
      now,
    ),
    [],
  );
});

test("invalid or missing receipt selections never alter saved data", () => {
  const data = profile([free()]);
  assert.equal(settleLoanReceivables(data, ["missing"]), data);
  assert.equal(settleLoanReceivables(data, ["r1"], "2026-99-01"), data);
  assert.deepEqual(
    selectLoanReceivablesForMonth(data.loanReceivables, "2026-99"),
    [],
  );
});

test("free installments reduce one principal only when received and skipped months add no charges", () => {
  const data = profile([
    free({
      amount: 1000,
      freePaymentMode: "installments",
      suggestedPaymentAmount: 200,
    }),
  ]);
  const paid = recordFreeLoanReceipt(data, "r1", 200, "2026-10-19", "first");
  const before = structuredClone(paid);
  assert.equal(getLoanReceivedAmount(paid.loanReceivables[0]), 200);
  assert.equal(getLoanOutstandingAmount(paid.loanReceivables[0]), 800);
  for (const month of ["2026-11", "2026-12", "2027-01", "2028-02"]) {
    const rows = selectLoanReceivablesForMonth(paid.loanReceivables, month);
    assert.equal(rows.length, 1);
    assert.equal(getLoanOutstandingAmount(rows[0]), 800);
    assert.equal(getLoanRepaymentStatus(rows[0], `${month}-28`), "open");
  }
  assert.deepEqual(paid, before);
  assert.equal(paid.transactions.length, 1);
  assert.equal(paid.loanReceivables[0].amount, 1000);
  assert.equal(paid.loanReceivables[0].dueDate, undefined);
  const next = recordFreeLoanReceipt(paid, "r1", 200, "2027-02-10", "second");
  assert.equal(getLoanOutstandingAmount(next.loanReceivables[0]), 600);
  assert.equal(next.loanReceivables.length, 1);
  assert.equal(next.transactions.length, 2);
  assert.equal(data.loanReceivables[0].receipts, undefined);
});

test("indefinite loans accept arbitrary partial amounts and complete only after the full balance is received", () => {
  let data = profile([free({ amount: 500, freePaymentMode: "flexible" })]);
  data = recordFreeLoanReceipt(data, "r1", 125.35, "2026-10-20", "a");
  assert.equal(getLoanOutstandingAmount(data.loanReceivables[0]), 374.65);
  assert.equal(data.loanReceivables[0].status, "open");
  data = recordFreeLoanReceipt(data, "r1", 100.1, "2026-12-01", "b");
  assert.equal(getLoanOutstandingAmount(data.loanReceivables[0]), 274.55);
  data = recordFreeLoanReceipt(data, "r1", 274.55, "2027-01-03", "c");
  assert.equal(data.loanReceivables[0].status, "paid");
  assert.equal(getLoanOutstandingAmount(data.loanReceivables[0]), 0);
  assert.equal(getLoanReceivedAmount(data.loanReceivables[0]), 500);
  assert.equal(data.loanReceivables[0].paymentDate, "2027-01-03");
  assert.deepEqual(
    data.loanReceivables[0].receipts?.map((item) => item.amount),
    [125.35, 100.1, 274.55],
  );
  assert.equal(
    selectLoanReceivablesForMonth(data.loanReceivables, "2027-02").length,
    0,
  );
});

test("the final free installment is limited to the remaining cents and can also be paid in smaller pieces", () => {
  let data = profile([
    free({
      amount: 100.01,
      freePaymentMode: "installments",
      suggestedPaymentAmount: 33.34,
    }),
  ]);
  for (const [id, date] of [
    ["first", "2026-10-19"],
    ["second", "2026-12-19"],
  ]) {
    const value = getSuggestedLoanReceiptAmount(data.loanReceivables[0]);
    assert.equal(value, 33.34);
    data = recordFreeLoanReceipt(data, "r1", value, date, id);
  }
  assert.equal(getSuggestedLoanReceiptAmount(data.loanReceivables[0]), 33.33);
  data = recordFreeLoanReceipt(data, "r1", 10, "2027-01-05", "small");
  assert.equal(getSuggestedLoanReceiptAmount(data.loanReceivables[0]), 23.33);
  data = recordFreeLoanReceipt(data, "r1", 23.33, "2027-03-01", "last");
  assert.equal(getLoanOutstandingAmount(data.loanReceivables[0]), 0);
  assert.equal(
    data.transactions.reduce(
      (sum, item) => sum + Math.round(item.amount * 100),
      0,
    ),
    10001,
  );
});

test("receipt retries never charge or deduct the same payment twice", () => {
  const first = recordFreeLoanReceipt(
    profile([free({ amount: 1000 })]),
    "r1",
    200,
    "2026-10-20",
    "same-request",
  );
  assert.equal(
    recordFreeLoanReceipt(first, "r1", 200, "2026-10-20", "same-request"),
    first,
  );
  assert.equal(
    recordFreeLoanReceipt(first, "r1", 100, "2026-10-21", "same-request"),
    first,
  );
  assert.equal(getLoanOutstandingAmount(first.loanReceivables[0]), 800);
  assert.equal(first.transactions.length, 1);
});

test("partial amounts, modes and receipt dates survive a save and reload", () => {
  const paid = recordFreeLoanReceipt(
    profile([
      free({
        amount: 1000,
        freePaymentMode: "installments",
        suggestedPaymentAmount: 200,
      }),
    ]),
    "r1",
    150,
    "2026-10-20",
    "saved",
  );
  const loaded = sanitizeLoanReceivables(
    JSON.parse(JSON.stringify(paid.loanReceivables)),
  );
  assert.equal(loaded[0].amount, 1000);
  assert.equal(loaded[0].freePaymentMode, "installments");
  assert.equal(loaded[0].suggestedPaymentAmount, 200);
  assert.equal(loaded[0].receipts?.[0].date, "2026-10-20");
  assert.equal(getLoanReceivedAmount(loaded[0]), 150);
  assert.equal(getLoanOutstandingAmount(loaded[0]), 850);
  assert.equal(selectLoanReceivablesForMonth(loaded, "2027-01").length, 1);
  assert.equal(loaded[0].dueDate, undefined);
});

test("free money receipts stay inside the loan statement", () => {
  for (const operationType of ["loan"] as const) {
    const unrelated = receipt({
      id: "other",
      loanId: "other-loan",
      amount: 300,
    });
    let data = profile([free({ amount: 500, operationType }), unrelated]);
    data.transactions = [
      {
        id: "salary",
        title: "Salário",
        amount: 2000,
        categoryId: "salario",
        date: "2026-10-01",
      },
    ];
    data = recordFreeLoanReceipt(data, "r1", 100, "2026-10-20", "a");
    data = recordFreeLoanReceipt(data, "r1", 100, "2026-11-20", "b");
    const ledgers = selectTransactionLedgers(
      data.transactions,
      data.loanReceivables,
    );
    assert.deepEqual(
      ledgers.regularTransactions.map((item) => item.id),
      ["salary"],
    );
    assert.equal(ledgers.loanTransactions.length, 2);
    assert.ok(
      ledgers.loanTransactions.every(
        (item) =>
          item.operationType === operationType && item.paymentStatus === "paid",
      ),
    );
    assert.equal(data.loanReceivables[1], unrelated);
    assert.equal(getLoanOutstandingAmount(data.loanReceivables[1]), 300);
    assert.equal(
      getDueTodayAlerts(
        [],
        data.transactions,
        [data.loanReceivables[0]],
        new Date(2027, 0, 1, 12),
      ).length,
      0,
    );
  }
});

test("receiving the remaining total after partial payments records only that remainder", () => {
  let data = recordFreeLoanReceipt(
    profile([free({ amount: 1000 })]),
    "r1",
    200,
    "2026-10-20",
    "part",
  );
  data = settleLoanReceivables(data, ["r1"], "2026-12-20");
  assert.deepEqual(
    data.loanReceivables[0].receipts?.map((item) => item.amount),
    [200, 800],
  );
  assert.equal(
    data.transactions.reduce((sum, item) => sum + item.amount, 0),
    1000,
  );
  assert.equal(getLoanOutstandingAmount(data.loanReceivables[0]), 0);
  assert.equal(settleLoanReceivables(data, ["r1"], "2027-01-20"), data);
});

test("invalid partial payments cannot change balances or create transactions", () => {
  const data = profile([free({ amount: 500 })]);
  for (const amount of [0, -1, 500.01, NaN, Infinity])
    assert.equal(
      recordFreeLoanReceipt(data, "r1", amount, "2026-10-20", "invalid"),
      data,
    );
  assert.equal(
    recordFreeLoanReceipt(data, "r1", 10, "2026-02-30", "invalid"),
    data,
  );
  assert.equal(
    recordFreeLoanReceipt(data, "r1", 10, "2026-10-01", "before-loan"),
    data,
  );
  assert.equal(recordFreeLoanReceipt(data, "r1", 10, "2026-10-20", ""), data);
  assert.equal(
    recordFreeLoanReceipt(data, "missing", 10, "2026-10-20", "invalid"),
    data,
  );
  const fixed = profile([receipt()]);
  assert.equal(
    recordFreeLoanReceipt(fixed, "r1", 10, "2026-10-20", "fixed"),
    fixed,
  );
});

test("old concluded free loans stay concluded without invented payments", () => {
  const old = free({ status: "paid", amount: 500, paymentDate: "2026-10-20" });
  const data = profile([old]);
  assert.equal(getLoanReceivedAmount(old), 500);
  assert.equal(getLoanOutstandingAmount(old), 0);
  assert.equal(
    recordFreeLoanReceipt(data, "r1", 50, "2026-10-20", "new"),
    data,
  );
  assert.equal(old.receipts, undefined);
});

test("receipt imports ignore duplicate and invalid payment entries", () => {
  const valid = {
    id: "a",
    amount: 100,
    date: "2026-10-20",
    transactionId: "t-a",
  };
  assert.deepEqual(
    sanitizeLoanReceipts([
      valid,
      valid,
      { ...valid, id: "duplicate-transaction" },
      { ...valid, id: "negative", amount: -50, transactionId: "negative" },
      {
        ...valid,
        id: "invalid-date",
        date: "2026-99-20",
        transactionId: "invalid-date",
      },
    ]),
    [valid],
  );
});

test("a backdated final receipt uses the latest actual receipt date for completion history", () => {
  let data = recordFreeLoanReceipt(
    profile([free({ amount: 1000 })]),
    "r1",
    200,
    "2026-12-20",
    "later",
  );
  data = recordFreeLoanReceipt(data, "r1", 800, "2026-10-20", "earlier");
  assert.equal(data.loanReceivables[0].paymentDate, "2026-12-20");
  assert.equal(
    selectLoanReceivablesForMonth(data.loanReceivables, "2026-12").length,
    1,
  );
  assert.equal(data.loanReceivables[0].receipts?.[1].date, "2026-10-20");
});
