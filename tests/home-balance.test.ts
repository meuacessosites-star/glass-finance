import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProfileData } from "../src/lib/app-store";
import type { Transaction } from "../src/lib/mock-data";
import {
  getHomeBalance,
  sanitizeHomeBalanceMode,
  shiftBalanceMonth,
} from "../src/lib/home-balance";

const row = (
  id: string,
  amount: number,
  date = "2026-10-17",
  patch: Partial<Transaction> = {},
): Transaction => ({
  id,
  title: id,
  categoryId: "outros",
  amount,
  date,
  ...patch,
});
const data = (
  transactions: Transaction[],
  patch: Partial<ProfileData> = {},
): ProfileData => ({
  transactions,
  categories: [],
  cards: [],
  loanReceivables: [],
  people: [],
  reserves: [],
  reservesInBalance: true,
  notifications: [],
  financings: [],
  financingsInFlow: false,
  showCategoryNameOnCard: true,
  goals: [],
  pin: null,
  ...patch,
});

test("monthly balance is income minus expenses while accumulated balance carries all prior results", () => {
  const saved = data([
    row("prior-income", 2000, "2026-09-01"),
    row("prior-expense", -1500, "2026-09-10"),
    row("income", 1000),
    row("expense", -250),
  ]);
  const monthly = getHomeBalance(saved, "2026-10", "monthly");
  const accumulated = getHomeBalance(saved, "2026-10", "accumulated");
  assert.equal(monthly.income, 1000);
  assert.equal(monthly.expense, 250);
  assert.equal(monthly.balance, 750);
  assert.equal(accumulated.previousBalance, 500);
  assert.equal(accumulated.monthBalance, 750);
  assert.equal(accumulated.balance, 1250);
  assert.equal(accumulated.income, monthly.income);
  assert.equal(accumulated.expense, monthly.expense);
});

test("empty months have no invented opening balance and preserve only actual prior transactions when accumulated", () => {
  assert.equal(getHomeBalance(data([]), "2026-10", "monthly").balance, 0);
  assert.equal(getHomeBalance(data([]), "2026-10", "accumulated").balance, 0);
  const saved = data([row("prior", 500, "2026-09-01")]);
  assert.equal(getHomeBalance(saved, "2026-10", "monthly").balance, 0);
  assert.equal(getHomeBalance(saved, "2026-10", "accumulated").balance, 500);
});

test("negative results and year boundaries carry correctly without being clamped to zero", () => {
  const saved = data([
    row("expense", -900, "2026-12-01"),
    row("income", 1000, "2027-01-01"),
    row("bill", -200, "2027-01-02"),
  ]);
  assert.equal(getHomeBalance(saved, "2026-12", "monthly").balance, -900);
  assert.equal(getHomeBalance(saved, "2027-01", "monthly").balance, 800);
  assert.equal(getHomeBalance(saved, "2027-01", "accumulated").balance, -100);
  assert.equal(shiftBalanceMonth("2027-01", -1), "2026-12");
  assert.equal(shiftBalanceMonth("2026-12", 1), "2027-01");
});

test("loans, receipts, borrowed cards, financing, reserves and goals never affect Home balance", () => {
  const saved = data(
    [
      row("salary", 1000),
      row("bill", -200),
      row("advance", -500, undefined, { source: "loan" }),
      row("receipt", 100, undefined, { source: "loan", paymentStatus: "paid" }),
      row("borrowed-card", -300, undefined, { operationType: "card" }),
      row("linked", 100),
      row("legacy-loan", -400, undefined, { note: "Referência: old-loan" }),
      row("loan-receivable-legacy", 200),
      row("fin-financing-1", -9000),
    ],
    {
      loanReceivables: [
        {
          id: "r",
          loanId: "old-loan",
          contact: "Pessoa",
          amount: 100,
          status: "open",
          transactionId: "linked",
          createdAt: "2026-10-01",
        },
      ],
      reserves: [
        {
          id: "reserve",
          name: "Reserva",
          amount: 9000,
          color: "#000",
          createdAt: "2026-10-01",
        },
      ],
      goals: [
        {
          id: "goal",
          name: "Meta",
          targetAmount: 9000,
          savedAmount: 8000,
          color: "#000",
          createdAt: "2026-10-01",
        },
      ],
      financingsInFlow: true,
      reservesInBalance: false,
    },
  );
  for (const mode of ["monthly", "accumulated"] as const) {
    const balance = getHomeBalance(saved, "2026-10", mode);
    assert.equal(balance.income, 1000);
    assert.equal(balance.expense, 200);
    assert.equal(balance.balance, 800);
    assert.equal(
      getHomeBalance(
        { ...saved, reservesInBalance: true, financingsInFlow: false },
        "2026-10",
        mode,
      ).balance,
      800,
    );
  }
});

test("future months do not leak into either balance mode and cents remain exact", () => {
  const saved = data([
    row("prior", 0.1, "2026-09-01"),
    row("income-a", 0.1),
    row("income-b", 0.2),
    row("expense", -0.05),
    row("future", 9999, "2026-11-01"),
  ]);
  assert.equal(getHomeBalance(saved, "2026-10", "monthly").balance, 0.25);
  assert.equal(getHomeBalance(saved, "2026-10", "accumulated").balance, 0.35);
  assert.equal(getHomeBalance(saved, "2026-09", "monthly").income, 0.1);
});

test("expense comparisons use actual transactions from the immediately preceding month", () => {
  const saved = data([row("prior", -500, "2026-09-01"), row("bill", -250)]);
  assert.equal(
    getHomeBalance(saved, "2026-10", "monthly").expenseChangePercent,
    -50,
  );
  assert.equal(
    getHomeBalance(saved, "2026-10", "monthly").previousMonth,
    "2026-09",
  );
  assert.equal(
    getHomeBalance(saved, "2026-11", "monthly").expenseChangePercent,
    -100,
  );
  assert.equal(
    getHomeBalance(data([]), "2026-10", "monthly").expenseChangePercent,
    null,
  );
});

test("the saved balance preference defaults to month only and can remain different per profile", () => {
  assert.equal(sanitizeHomeBalanceMode(undefined), "monthly");
  assert.equal(sanitizeHomeBalanceMode("invalid"), "monthly");
  const profiles = JSON.parse(
    JSON.stringify([
      { homeBalanceMode: "monthly" },
      { homeBalanceMode: "accumulated" },
    ]),
  );
  assert.deepEqual(
    profiles.map((item: ProfileData) =>
      sanitizeHomeBalanceMode(item.homeBalanceMode),
    ),
    ["monthly", "accumulated"],
  );
});

test("invalid dates and amounts are ignored without changing saved data", () => {
  const saved = data([
    row("valid", -10),
    row("bad-date", 5000, "2026-02-30"),
    row("nan", NaN),
    row("infinite", Infinity),
  ]);
  const snapshot = structuredClone(saved);
  assert.equal(getHomeBalance(saved, "2026-10", "accumulated").balance, -10);
  assert.equal(getHomeBalance(saved, "2026-99", "monthly").balance, 0);
  assert.deepEqual(saved, snapshot);
});

test("accumulated details include empty months and carry signed balances from the first transaction", () => {
  const saved = data([
    row("first-expense", -500, "2026-08-15"),
    row("income", 1000, "2026-10-01"),
    row("bill", -200, "2026-10-02"),
    row("future", 9000, "2026-11-01"),
  ]);
  const result = getHomeBalance(saved, "2026-10", "accumulated");
  assert.equal(result.firstMonth, "2026-08");
  assert.deepEqual(result.months, [
    {
      month: "2026-08",
      income: 0,
      expense: 500,
      result: -500,
      opening: 0,
      closing: -500,
      transactionCount: 1,
    },
    {
      month: "2026-09",
      income: 0,
      expense: 0,
      result: 0,
      opening: -500,
      closing: -500,
      transactionCount: 0,
    },
    {
      month: "2026-10",
      income: 1000,
      expense: 200,
      result: 800,
      opening: -500,
      closing: 300,
      transactionCount: 2,
    },
  ]);
  assert.equal(result.totalIncome, 1000);
  assert.equal(result.totalExpense, 700);
  assert.equal(result.balance, result.months.at(-1)?.closing);
  assert.equal(
    getHomeBalance(saved, "2026-07", "accumulated").months.length,
    0,
  );
});

test("month-by-month calculations match the hero to the cent and exclude all loan and financing entries", () => {
  const saved = data([
    row("a", 0.1, "2026-12-01"),
    row("b", -0.2, "2026-12-02"),
    row("c", 0.3, "2027-01-01"),
    row("d", -0.01, "2027-01-02"),
    row("loan", 10000, "2026-01-01", { source: "loan" }),
    row("card", -1000, "2026-01-01", { operationType: "card" }),
    row("fin-extra", -999, "2026-12-01"),
  ]);
  const result = getHomeBalance(saved, "2027-01", "accumulated");
  assert.equal(result.firstMonth, "2026-12");
  assert.equal(result.totalIncome, 0.4);
  assert.equal(result.totalExpense, 0.21);
  assert.equal(result.balance, 0.19);
  for (const part of result.months) {
    assert.equal(
      Math.round(part.income * 100) - Math.round(part.expense * 100),
      Math.round(part.result * 100),
    );
    assert.equal(
      Math.round(part.opening * 100) + Math.round(part.result * 100),
      Math.round(part.closing * 100),
    );
  }
  assert.equal(result.balance, result.months.at(-1)?.closing);
});
