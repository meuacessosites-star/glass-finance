import type { ProfileData } from "./app-store";
import { selectTransactionLedgers } from "./transaction-ledgers";
import { sanitizeDueDate } from "./transaction-status";

export type HomeBalanceMode = "monthly" | "accumulated";
export const sanitizeHomeBalanceMode = (value: unknown): HomeBalanceMode =>
  value === "accumulated" ? "accumulated" : "monthly";

export type HomeBalanceMonth = {
  month: string;
  income: number;
  expense: number;
  result: number;
  opening: number;
  closing: number;
  transactionCount: number;
};

export function shiftBalanceMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Home uses only saved ordinary transactions, without opening examples or other balances. */
export function getHomeBalance(
  data: Pick<ProfileData, "transactions" | "loanReceivables">,
  month: string,
  mode: HomeBalanceMode,
) {
  let income = 0;
  let expense = 0;
  let previousBalance = 0;
  let previousExpense = 0;
  const byMonth = new Map<
    string,
    { income: number; expense: number; count: number }
  >();
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const previousMonth = validMonth ? shiftBalanceMonth(month, -1) : month;
  const rows = selectTransactionLedgers(
    data.transactions,
    data.loanReceivables,
  ).regularTransactions;
  for (const item of rows) {
    if (
      !validMonth ||
      !Number.isFinite(item.amount) ||
      item.id.startsWith("fin-") ||
      !sanitizeDueDate(item.date)
    )
      continue;
    const itemMonth = item.date.slice(0, 7);
    const amount = Math.round(item.amount * 100);
    if (itemMonth <= month) {
      const part = byMonth.get(itemMonth) ?? {
        income: 0,
        expense: 0,
        count: 0,
      };
      if (amount > 0) part.income += amount;
      else part.expense -= amount;
      part.count += 1;
      byMonth.set(itemMonth, part);
    }
    if (itemMonth < month) previousBalance += amount;
    if (itemMonth === previousMonth && amount < 0) previousExpense -= amount;
    if (itemMonth !== month) continue;
    if (amount > 0) income += amount;
    else expense -= amount;
  }
  const months: HomeBalanceMonth[] = [];
  const firstMonth = [...byMonth.keys()].sort()[0];
  let running = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  if (firstMonth) {
    const indexFor = (key: string) =>
      Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
    for (
      let index = indexFor(firstMonth);
      index <= indexFor(month);
      index += 1
    ) {
      const key = `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
      const part = byMonth.get(key) ?? { income: 0, expense: 0, count: 0 };
      const result = part.income - part.expense;
      const opening = running;
      running += result;
      totalIncome += part.income;
      totalExpense += part.expense;
      months.push({
        month: key,
        income: part.income / 100,
        expense: part.expense / 100,
        result: result / 100,
        opening: opening / 100,
        closing: running / 100,
        transactionCount: part.count,
      });
    }
  }
  const monthBalance = income - expense;
  return {
    months,
    firstMonth,
    totalIncome: totalIncome / 100,
    totalExpense: totalExpense / 100,
    income: income / 100,
    expense: expense / 100,
    monthBalance: monthBalance / 100,
    previousBalance: previousBalance / 100,
    balance:
      (monthBalance + (mode === "accumulated" ? previousBalance : 0)) / 100,
    previousExpense: previousExpense / 100,
    previousMonth,
    expenseChangePercent:
      previousExpense > 0
        ? Math.round(((expense - previousExpense) / previousExpense) * 100)
        : null,
  };
}
