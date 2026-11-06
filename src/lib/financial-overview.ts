import type { ProfileData } from "./app-store";
import { selectTransactionLedgers } from "./transaction-ledgers";
import { getTransactionPaymentStatus } from "./transaction-status";
import { isCreditCardExpense, getInvoiceDates } from "./card-billing";
import { getInvoiceSummary, getScopedCommittedAmount, getScopedInvoiceMonths, getScopedInvoiceMetrics } from "./card-invoice-summary";
import { getLoanOutstandingAmount } from "./loan-repayments";
import { financingSummary, goalPlan } from "./financing-plan";
import { fromCents, sumCents } from "./money";

/**
 * Finance totals are accumulated in integer cents, then converted to reais
 * only at the view boundary. Do not accumulate BRL floats with `+`: even
 * 0.1 + 0.2 can produce a different representation.
 *
 * sumCents throws for non-finite numbers and unsafe totals instead of
 * displaying a plausible but incorrect financial amount.
 */
const moneySum = (amounts: readonly number[]) => fromCents(sumCents(amounts));

export function financialOverview(data: ProfileData, month: string, today: string) {
  const ledgers = selectTransactionLedgers(data.transactions, data.loanReceivables);
  const regular = [
    ...ledgers.regularTransactions,
    ...ledgers.loanTransactions.filter((transaction) => transaction.operationType !== "card"),
  ].filter((transaction) => !transaction.id.startsWith("fin-") && !isCreditCardExpense(transaction));

  const period = regular.filter((transaction) => (transaction.dueDate ?? transaction.date).startsWith(month));
  const sumTransactions = (rows: typeof regular) =>
    moneySum(rows.map((transaction) => Math.abs(transaction.amount)));

  const incomes = period.filter((transaction) => transaction.amount > 0);
  const expenses = period.filter((transaction) => transaction.amount < 0);
  const paid = (transaction: typeof regular[number]) =>
    getTransactionPaymentStatus(transaction, data.cards, data.loanReceivables, today) === "paid";

  const invoices = getInvoiceSummary({
    cards: data.cards,
    transactions: data.transactions,
    receivables: data.loanReceivables,
    month,
    includeBorrowed: true,
    today,
  });
  const installments = data.financings.flatMap((financing) => financingSummary(financing, today).rows);
  const monthInstallments = installments.filter((installment) => installment.date.startsWith(month));
  const sumInstallments = (rows: typeof installments) =>
    moneySum(rows.map((installment) => installment.amount));

  const received = sumTransactions(incomes.filter(paid));
  const expected = sumTransactions(incomes.filter((transaction) => !paid(transaction)));
  const expense = moneySum([
    sumTransactions(expenses),
    invoices.invoiceTotal,
    sumInstallments(monthInstallments),
  ]);

  let overdueInvoices = 0;
  for (const card of data.cards.filter((card) => !card.archived)) {
    for (const invoiceMonth of getScopedInvoiceMonths([card], data.transactions, data.loanReceivables, true)) {
      const due = getInvoiceDates(card, invoiceMonth)?.dueDate;
      if (
        due && due < today &&
        getScopedInvoiceMetrics(card, data.transactions, data.loanReceivables, invoiceMonth, true, today).openAmount > 0
      ) {
        overdueInvoices++;
      }
    }
  }

  return {
    received,
    expected,
    expense,
    result: moneySum([received, expected, -expense]),
    paid: moneySum([
      sumTransactions(expenses.filter(paid)),
      invoices.paidAmount,
      sumInstallments(monthInstallments.filter((installment) => installment.paid)),
    ]),
    pending: moneySum([
      sumTransactions(expenses.filter((transaction) => !paid(transaction))),
      invoices.openAmount,
      sumInstallments(monthInstallments.filter((installment) => !installment.paid)),
    ]),
    overdue:
      regular.filter(
        (transaction) =>
          transaction.amount < 0 &&
          getTransactionPaymentStatus(transaction, data.cards, data.loanReceivables, today) === "overdue",
      ).length +
      installments.filter((installment) => !installment.paid && installment.date < today).length +
      overdueInvoices,
    invoiceTotal: invoices.invoiceTotal,
    invoiceOpen: invoices.openAmount,
    cardCommitted: moneySum(
      data.cards
        .filter((card) => !card.archived)
        .map((card) =>
          getScopedCommittedAmount(card, data.transactions, data.loanReceivables, true, today),
        ),
    ),
    financingPending: sumInstallments(installments.filter((installment) => !installment.paid)),
    financingMonth: sumInstallments(monthInstallments),
    loanOutstanding: moneySum(
      data.loanReceivables.map((receivable) => getLoanOutstandingAmount(receivable)),
    ),
    loanOverdue: data.loanReceivables.filter(
      (receivable) =>
        receivable.dueDate && receivable.dueDate < today &&
        getLoanOutstandingAmount(receivable) > 0,
    ).length,
    reserveTotal: moneySum(data.reserves.map((reserve) => reserve.amount)),
    goalTotal: moneySum(data.goals.map((goal) => goal.savedAmount)),
    goalMonthly: moneySum(data.goals.map((goal) => goalPlan(goal, today).monthly ?? 0)),
    goalsOverdue: data.goals.filter((goal) => goalPlan(goal, today).overdue).length,
    pendingNotifications: data.notifications.filter((notification) => notification.status === "pending").length,
    hasPeriodData: period.length > 0 || invoices.invoiceTotal > 0 || monthInstallments.length > 0,
  };
}
