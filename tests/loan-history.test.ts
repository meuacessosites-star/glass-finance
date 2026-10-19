import { test } from "node:test";
import assert from "node:assert/strict";
import type { LoanReceivable, ProfileData } from "../src/lib/app-store";
import {
  getLoanHistoryGroup,
  getLoanInstallmentHistory,
} from "../src/lib/loan-history";
import {
  getLoanOutstandingAmount,
  settleLoanReceivables,
} from "../src/lib/loan-repayments";
import { reopenLoanReceivable } from "../src/lib/loan-record-actions";
import { selectLoanView, type LoanViewFilters } from "../src/lib/loan-view";

const row = (
  id: string,
  patch: Partial<LoanReceivable> = {},
): LoanReceivable => ({
  id,
  loanId: "loan",
  contact: "Pessoa",
  amount: 100,
  collectionMode: "fixed",
  operationType: "loan",
  status: "scheduled",
  dueDate: "2026-10-20",
  startDate: "2026-09-01",
  createdAt: "2026-09-01",
  installment: 1,
  installments: 4,
  ...patch,
});

test("money installment history uses all saved months and distinguishes received, overdue, due today and scheduled", () => {
  const paid = row("paid", {
    status: "paid",
    paymentDate: "2026-09-20",
    dueDate: "2026-09-20",
  });
  const overdue = row("overdue", { installment: 2, dueDate: "2026-10-19" });
  const current = row("current", { installment: 3 });
  const future = row("future", { installment: 4, dueDate: "2026-11-20" });
  const rows = [
    future,
    current,
    paid,
    overdue,
    row("other", { loanId: "other" }),
    row("card", { operationType: "card" }),
  ];
  const snapshot = structuredClone(rows);
  const history = getLoanInstallmentHistory(overdue, rows, "2026-10-20");
  assert.deepEqual(
    history.map((part) => [part.id, part.status]),
    [
      ["paid", "paid"],
      ["overdue", "overdue"],
      ["current", "pending"],
      ["future", "scheduled"],
    ],
  );
  assert.deepEqual(
    history.filter((part) => part.isSelected).map((part) => part.id),
    ["overdue"],
  );
  assert.equal(history[0].paymentDate, "2026-09-20");
  assert.equal(history[0].remainingAmount, 0);
  assert.deepEqual(rows, snapshot);
});

test("the next unpaid installment remains pending while later future installments are scheduled even when selected", () => {
  const first = row("first", { status: "paid", paymentDate: "2026-10-20" });
  const next = row("next", { installment: 2, dueDate: "2026-11-20" });
  const later = row("later", { installment: 3, dueDate: "2026-12-20" });
  const rows = [first, next, later];
  assert.deepEqual(
    getLoanInstallmentHistory(later, rows, "2026-10-20").map(
      (part) => part.status,
    ),
    ["paid", "pending", "scheduled"],
  );
  const advanced = getLoanInstallmentHistory(later, rows, "2026-12-20");
  assert.equal(advanced[1].status, "overdue");
  assert.equal(advanced[2].status, "pending");
  assert.equal(advanced[2].isSelected, true);
});

test("borrowed-card history preserves chosen invoice dates and never fabricates missing card dates", () => {
  const first = row("card1", {
    operationType: "card",
    cardId: "card",
    cardInvoiceMonth: "2026-11",
    cardClosingDate: "2026-11-10",
    dueDate: "2026-11-17",
    installments: 2,
  });
  const second = {
    ...first,
    id: "card2",
    installment: 2,
    cardInvoiceMonth: "2026-12",
    cardClosingDate: "2026-12-10",
    dueDate: "2026-12-17",
  };
  const result = getLoanInstallmentHistory(
    first,
    [second, first],
    "2026-10-20",
  );
  assert.deepEqual(
    result.map((part) => [part.dueDate, part.status]),
    [
      ["2026-11-17", "pending"],
      ["2026-12-17", "scheduled"],
    ],
  );
  const legacy = row("legacy", { operationType: "card", dueDate: undefined });
  const missing = getLoanInstallmentHistory(legacy, [legacy], "2026-10-20")[0];
  assert.equal(missing.status, "invoice-needed");
  assert.equal(missing.dueDate, undefined);
  assert.equal(
    getLoanInstallmentHistory(
      { ...legacy, status: "paid" },
      [],
      "2026-10-20",
    )[0].status,
    "paid",
  );
});

test("partial receipts keep original installment values and show only the cent-exact remainder", () => {
  const item = row("partial", {
    amount: 100,
    receipts: [
      {
        id: "receipt",
        amount: 30.01,
        date: "2026-10-18",
        transactionId: "received",
      },
    ],
  });
  const part = getLoanInstallmentHistory(item, [item], "2026-10-20")[0];
  assert.equal(part.amount, 100);
  assert.equal(part.receivedAmount, 30.01);
  assert.equal(part.remainingAmount, 69.99);
  assert.equal(part.status, "pending");
});

test("free loans have actual receipts and a remaining balance without invented monthly installments", () => {
  for (const freePaymentMode of ["flexible", "installments"] as const) {
    const item = row("free", {
      amount: 500,
      collectionMode: "open",
      status: "open",
      dueDate: undefined,
      freePaymentMode,
      suggestedPaymentAmount: 100,
      receipts: [
        {
          id: "receipt",
          amount: 50,
          date: "2026-10-18",
          transactionId: "receipt",
        },
      ],
    });
    const snapshot = structuredClone(item);
    for (const today of ["2026-10-20", "2026-11-20", "2027-02-20"]) {
      assert.deepEqual(getLoanInstallmentHistory(item, [item], today), []);
      assert.equal(getLoanOutstandingAmount(item), 450);
    }
    assert.deepEqual(
      getLoanInstallmentHistory({ ...item, status: "paid" }, [], "2027-02-20"),
      [],
    );
    assert.deepEqual(item, snapshot);
  }
});

test("sparse old histories show only existing installments and retain an unavailable date explicitly", () => {
  const item = row("third", {
    installment: 3,
    installments: 6,
    dueDate: undefined,
  });
  const result = getLoanInstallmentHistory(
    item,
    [row("unrelated", { loanId: "other" })],
    "2026-10-20",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].number, 3);
  assert.equal(result[0].total, 6);
  assert.equal(result[0].dueDate, undefined);
  assert.equal(result[0].status, "pending");
  assert.deepEqual(getLoanHistoryGroup(item, []), [item]);
});

const progressProfile = (items: LoanReceivable[]): ProfileData => ({
  categories: [],
  cards: [],
  transactions: [],
  loanReceivables: items,
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

test("list progress retains received installments outside the selected month and updates after reopening, for money and card loans", () => {
  for (const operationType of ["loan", "card"] as const) {
    const items = ["2026-09", "2026-10", "2026-11"].map((month, index) =>
      row(`part-${index + 1}`, {
        operationType,
        installment: index + 1,
        installments: 3,
        dueDate: `${month}-20`,
        ...(operationType === "card"
          ? {
              cardId: "card",
              cardInvoiceMonth: month,
              cardClosingDate: `${month}-10`,
            }
          : {}),
      }),
    );
    const original = progressProfile(items);
    const snapshot = structuredClone(original);
    const paid = settleLoanReceivables(original, [items[0].id], "2026-09-20");
    const filters: LoanViewFilters = {
      selectedMonth: "2026-10",
      selectedMonths: [],
      scope: "period",
      tab: operationType === "card" ? "cartao" : "dinheiro",
      status: "all",
      mode: "all",
      query: "",
    };
    const visible = selectLoanView(paid.loanReceivables, filters, "2026-10-18");
    assert.deepEqual(
      visible.map((item) => item.id),
      ["part-2"],
    );
    const history = getLoanInstallmentHistory(
      visible[0],
      paid.loanReceivables,
      "2026-10-18",
    );
    assert.deepEqual(
      history.map((part) => part.status === "paid"),
      [true, false, false],
    );
    assert.deepEqual(
      history.map((part) => part.number),
      [1, 2, 3],
    );
    const reopened = reopenLoanReceivable(paid, items[0].id);
    assert.deepEqual(
      getLoanInstallmentHistory(
        visible[0],
        reopened.loanReceivables,
        "2026-10-18",
      ).map((part) => part.status === "paid"),
      [false, false, false],
    );
    assert.deepEqual(original, snapshot);
  }
});

test("installment progress marks partial payments as unpaid until fully settled and keeps the earlier partial after reopening", () => {
  const first = row("partial", {
    installments: 2,
    receipts: [
      {
        id: "partial",
        amount: 30.01,
        date: "2026-10-18",
        transactionId: "partial",
      },
    ],
  });
  const second = row("later", {
    installment: 2,
    installments: 2,
    dueDate: "2026-11-20",
  });
  const original = progressProfile([first, second]);
  const history = (data: ProfileData) =>
    getLoanInstallmentHistory(
      data.loanReceivables[0],
      data.loanReceivables,
      "2026-10-20",
    );
  assert.equal(history(original)[0].status, "pending");
  assert.equal(history(original)[0].remainingAmount, 69.99);
  const paid = settleLoanReceivables(original, [first.id], "2026-10-20");
  assert.equal(history(paid)[0].status, "paid");
  assert.equal(history(paid)[0].remainingAmount, 0);
  const reopened = reopenLoanReceivable(paid, first.id);
  assert.equal(history(reopened)[0].status, "pending");
  assert.equal(history(reopened)[0].remainingAmount, 69.99);
  assert.equal(history(reopened)[0].receivedAmount, 30.01);
  assert.deepEqual(reopened.loanReceivables[1], second);
});
