import type { AppCard, InvoicePaymentRecord, LoanReceivable, ProfileData } from "./app-store";
import type { Transaction } from "./mock-data";
import { getInvoiceDates, getTransactionInvoiceSchedule, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
import { getCardCommittedAmount, getCardInvoiceMetrics, selectCardPurchases } from "./card-invoice-view";
import { needsCardLoanInvoice } from "./card-loans";
import { recordInvoicePayment, setInvoicePaymentStatus } from "./payment-updates";
import { sanitizeDueDate } from "./transaction-status";

const cents = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
export type InvoiceStatusFilter = "all" | "open" | "paid";

/** A receivable is one saved installment, never the original advance plus its repayments. */
export function getBorrowedCardParts(card: AppCard, receivables: LoanReceivable[]): LoanReceivable[] {
  const seen = new Set<string>();
  return receivables.filter((item) => {
    if (seen.has(item.id) || item.operationType !== "card" || item.cardId !== card.id ||
      needsCardLoanInvoice(item) || !Number.isFinite(item.amount) || item.amount <= 0) return false;
    seen.add(item.id);
    return true;
  });
}

/** Read-only chart projections; never inserted in Transactions or used to collect a repayment. */
export function getBorrowedCardAnalyticsTransactions(card: AppCard, receivables: LoanReceivable[], loanTransactions: Transaction[]): Transaction[] {
  return getBorrowedCardParts(card, receivables).map((item) => ({
    id: `borrowed-bank-${item.id}`, title: `Cartão emprestado · ${item.contact}`,
    categoryId: loanTransactions.find((row) => row.id === item.transactionId)?.categoryId ??
      loanTransactions.find((row) => row.amount < 0 && row.note?.split("\n").some((line) => line.trim() === `Referência: ${item.loanId}`))?.categoryId ?? "outros",
    amount: -item.amount, date: item.startDate ?? item.dueDate!, cardId: card.id,
    cardInvoiceMonth: item.cardInvoiceMonth, cardMode: "credito", paymentMethod: "cartao",
  }));
}

/** Receiving a person's repayment does not settle the bank's invoice. */
export function getBorrowedCardInvoiceMetrics(card: AppCard, receivables: LoanReceivable[], month: string) {
  const gross = getBorrowedCardParts(card, receivables)
    .filter((item) => item.cardInvoiceMonth === month).reduce((sum, item) => sum + cents(item.amount), 0);
  const payment = card.borrowedInvoicePaymentsByMonth?.[month];
  const total = Math.max(gross, cents(payment?.totalAmount ?? 0));
  const paid = Math.min(total, cents(payment?.paidAmount ?? 0));
  return { invoiceTotal: total / 100, paidAmount: paid / 100, openAmount: (total - paid) / 100 };
}

export function getScopedInvoiceMetrics(card: AppCard, transactions: Transaction[], receivables: LoanReceivable[], month: string, includeBorrowed: boolean, today = localDateKey()) {
  const personal = getCardInvoiceMetrics(card, transactions, month, today);
  const borrowed = includeBorrowed ? getBorrowedCardInvoiceMetrics(card, receivables, month) : { invoiceTotal: 0, paidAmount: 0, openAmount: 0 };
  const total = cents(personal.invoiceTotal) + cents(borrowed.invoiceTotal);
  const paid = cents(personal.paidAmount) + cents(borrowed.paidAmount);
  return { invoiceTotal: total / 100, paidAmount: paid / 100, openAmount: (total - paid) / 100,
    invoicePaid: total > 0 ? paid === total : personal.invoicePaid, personal, borrowed };
}

export function getScopedCommittedAmount(card: AppCard, transactions: Transaction[], receivables: LoanReceivable[], includeBorrowed: boolean, today = localDateKey()) {
  const personal = cents(getCardCommittedAmount(card, transactions, today));
  if (!includeBorrowed) return personal / 100;
  const months = new Set([...getBorrowedCardParts(card, receivables).map((item) => item.cardInvoiceMonth!), ...Object.keys(card.borrowedInvoicePaymentsByMonth ?? {})]);
  return (personal + [...months].reduce((sum, month) => sum + cents(getBorrowedCardInvoiceMetrics(card, receivables, month).openAmount), 0)) / 100;
}

export function getScopedInvoiceMonths(cards: AppCard[], transactions: Transaction[], receivables: LoanReceivable[], includeBorrowed = false): string[] {
  const months = new Set<string>();
  const add = (value: unknown) => { const key = sanitizeInvoiceMonth(value); if (key) months.add(key); };
  const purchases = selectCardPurchases(transactions);
  for (const card of cards) {
    purchases.filter((item) => item.cardId === card.id).forEach((item) => getTransactionInvoiceSchedule(item, card).forEach((part) => add(part.month)));
    [...Object.keys(card.invoicePaidByMonth ?? {}), ...Object.keys(card.invoicePaymentsByMonth ?? {}), ...Object.keys(card.invoiceOverrideByMonth ?? {})].forEach(add);
    if (includeBorrowed) {
      getBorrowedCardParts(card, receivables).forEach((item) => add(item.cardInvoiceMonth));
      Object.keys(card.borrowedInvoicePaymentsByMonth ?? {}).forEach(add);
    }
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

export function invoiceMatchesStatus(metrics: { invoicePaid: boolean; openAmount: number }, status: InvoiceStatusFilter) {
  return status === "all" || (status === "paid" ? metrics.invoicePaid : !metrics.invoicePaid && metrics.openAmount > 0);
}

export type MonthlyInvoiceSummary = { month: string; invoiceTotal: number; paidAmount: number; openAmount: number; borrowedTotal: number; cardCount: number };

/** Global month/due-date, status and card filters affect the summary, never a payment's scope. */
export function getInvoiceSummary({ cards, transactions, receivables, month, months: selectedMonths, includeBorrowed = false, status = "all", cardId, fromDate, untilDate, today = localDateKey() }: {
  cards: AppCard[]; transactions: Transaction[]; receivables: LoanReceivable[]; month: string;
  months?: string[];
  includeBorrowed?: boolean; status?: InvoiceStatusFilter; cardId?: string; fromDate?: string | null; untilDate?: string | null; today?: string;
}) {
  const start = sanitizeDueDate(fromDate), end = sanitizeDueDate(untilDate);
  const hasRange = Boolean(start && end && start <= end);
  const rows = new Map<string, { total: number; paid: number; open: number; borrowed: number; cards: Set<string> }>();
  const selectedCards = new Set<string>();
  for (const card of cards) {
    if (card.archived || (cardId && card.id !== cardId)) continue;
    const months = hasRange ? new Set([
      month,
      ...selectCardPurchases(transactions).filter((item) => item.cardId === card.id).flatMap((item) => getTransactionInvoiceSchedule(item, card).map((part) => part.month)),
      ...Object.keys(card.invoicePaymentsByMonth ?? {}), ...Object.keys(card.invoiceOverrideByMonth ?? {}),
      ...(includeBorrowed ? [...getBorrowedCardParts(card, receivables).map((item) => item.cardInvoiceMonth!), ...Object.keys(card.borrowedInvoicePaymentsByMonth ?? {})] : []),
    ]) : new Set(selectedMonths?.length ? selectedMonths : [month]);
    for (const key of months) {
      if (!sanitizeInvoiceMonth(key)) continue;
      const due = getInvoiceDates(card, key)?.dueDate;
      if (hasRange && (!due || due < start! || due > end!)) continue;
      const metrics = getScopedInvoiceMetrics(card, transactions, receivables, key, includeBorrowed, today);
      if (metrics.invoiceTotal <= 0 || !invoiceMatchesStatus(metrics, status)) continue;
      const row = rows.get(key) ?? { total: 0, paid: 0, open: 0, borrowed: 0, cards: new Set<string>() };
      row.total += cents(metrics.invoiceTotal); row.paid += cents(metrics.paidAmount); row.open += cents(metrics.openAmount); row.borrowed += cents(metrics.borrowed.invoiceTotal);
      row.cards.add(card.id); selectedCards.add(card.id); rows.set(key, row);
    }
  }
  const monthly: MonthlyInvoiceSummary[] = [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => ({ month: key,
    invoiceTotal: row.total / 100, paidAmount: row.paid / 100, openAmount: row.open / 100, borrowedTotal: row.borrowed / 100, cardCount: row.cards.size }));
  const sum = (field: "invoiceTotal" | "paidAmount" | "openAmount" | "borrowedTotal") => monthly.reduce((total, row) => total + cents(row[field]), 0) / 100;
  return { monthly, invoiceTotal: sum("invoiceTotal"), paidAmount: sum("paidAmount"), openAmount: sum("openAmount"), borrowedTotal: sum("borrowedTotal"), cardCount: selectedCards.size };
}

/** Personal purchases and the bank cost of borrowed cards have independent payment records. */
export function recordScopedInvoicePayment(data: ProfileData, cardId: string, month: string, payment: InvoicePaymentRecord, includeBorrowed = false): ProfileData {
  if (!includeBorrowed) return recordInvoicePayment(data, cardId, month, payment);
  const card = data.cards.find((item) => item.id === cardId);
  if (!card || !sanitizeInvoiceMonth(month) || !sanitizeDueDate(payment.paymentDate) || !Number.isFinite(payment.paidAmount) || !Number.isFinite(payment.totalAmount) || payment.paidAmount < 0 || payment.totalAmount < 0) return data;
  const current = getScopedInvoiceMetrics(card, data.transactions, data.loanReceivables, month, true, payment.paymentDate);
  const target = Math.min(cents(current.invoiceTotal), cents(payment.paidAmount));
  const increase = target - cents(current.paidAmount);
  if (increase <= 0) return data;
  const personalIncrease = Math.min(increase, cents(current.personal.openAmount));
  const next = personalIncrease > 0 ? recordInvoicePayment(data, cardId, month, { ...payment,
    totalAmount: current.personal.invoiceTotal, paidAmount: (cents(current.personal.paidAmount) + personalIncrease) / 100 }) : data;
  const borrowedIncrease = increase - personalIncrease;
  if (!borrowedIncrease) return next;
  return { ...next, cards: next.cards.map((item) => item.id !== cardId ? item : { ...item,
    borrowedInvoicePaymentsByMonth: { ...item.borrowedInvoicePaymentsByMonth, [month]: { ...payment,
      totalAmount: current.borrowed.invoiceTotal, paidAmount: (cents(current.borrowed.paidAmount) + borrowedIncrease) / 100 } },
  }) };
}

export function setScopedInvoiceStatus(data: ProfileData, cardId: string, month: string, paid: boolean, includeBorrowed = false, today = localDateKey()): ProfileData {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card || !sanitizeInvoiceMonth(month)) return data;
  if (!includeBorrowed) return setInvoicePaymentStatus(data, cardId, month, paid, today);
  if (paid) {
    const total = getScopedInvoiceMetrics(card, data.transactions, data.loanReceivables, month, true, today).invoiceTotal;
    return recordScopedInvoicePayment(data, cardId, month, { totalAmount: total, paidAmount: total, paymentDate: today }, true);
  }
  const next = setInvoicePaymentStatus(data, cardId, month, false, today);
  return { ...next, cards: next.cards.map((item) => {
    if (item.id !== cardId) return item;
    const payments = { ...item.borrowedInvoicePaymentsByMonth }; delete payments[month];
    return { ...item, borrowedInvoicePaymentsByMonth: payments };
  }) };
}
