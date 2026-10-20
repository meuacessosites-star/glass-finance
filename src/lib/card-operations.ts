import type { AppCard, LoanReceivable, ProfileData } from "./app-store";
import type { Transaction } from "./mock-data";
import { getTransactionInvoiceMonth, isCreditCardExpense, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
import { selectTransactionLedgers } from "./transaction-ledgers";
import { getCardInvoiceMetrics, getCardStatementTotal } from "./card-invoice-view";
import { getBorrowedCardTransactions } from "./card-loan-purchases";

/** Reorder active cards without moving archived slots or losing newly added cards. */
export function reorderActiveCards(data: ProfileData, ids: string[]): ProfileData {
  const active = data.cards.filter((card) => !card.archived);
  const byId = new Map(active.map((card) => [card.id, card]));
  const uniqueIds = [...new Set(ids)].filter((id) => byId.has(id));
  const included = new Set(uniqueIds);
  const ordered = [...uniqueIds.map((id) => byId.get(id)!), ...active.filter((card) => !included.has(card.id))];
  let index = 0;
  const cards = data.cards.map((card) => card.archived ? card : ordered[index++]);
  return cards.every((card, i) => card === data.cards[i]) ? data : { ...data, cards };
}

export function cardHasHistory(card: AppCard, transactions: Transaction[], receivables: LoanReceivable[] = []): boolean {
  return card.invoicePaid === true || transactions.some((row) => row.cardId === card.id) ||
    receivables.some((row) => row.cardId === card.id) ||
    Object.values(card.invoicePaidByMonth ?? {}).some(Boolean) ||
    Object.values(card.invoiceOverrideByMonth ?? {}).some((amount) => amount > 0) ||
    Object.values(card.invoicePaymentsByMonth ?? {}).some((payment) => payment.totalAmount > 0 || payment.paidAmount > 0);
}

/** Existing purchases retain their original invoice month when billing days change. */
export function updateCardPreservingHistory(data: ProfileData, id: string, patch: Partial<Omit<AppCard, "id">>): ProfileData {
  const previous = data.cards.find((card) => card.id === id);
  if (!previous) return data;
  const cycleChanged = ("closingDay" in patch && patch.closingDay !== previous.closingDay) ||
    ("dueDay" in patch && patch.dueDay !== previous.dueDay);
  const regularIds = new Set(selectTransactionLedgers(data.transactions, data.loanReceivables).regularTransactions.map((row) => row.id));
  return {
    ...data,
    cards: data.cards.map((card) => card.id === id ? { ...card, ...patch } : card),
    transactions: cycleChanged ? data.transactions.map((row) =>
      regularIds.has(row.id) && row.cardId === id && isCreditCardExpense(row) && !sanitizeInvoiceMonth(row.cardInvoiceMonth)
        ? { ...row, cardInvoiceMonth: getTransactionInvoiceMonth(row, previous) } : row) : data.transactions,
  };
}

/** Cards with history are archived instead of leaving orphaned purchases/loans. */
export function removeUnusedCard(data: ProfileData, id: string): ProfileData {
  const card = data.cards.find((item) => item.id === id);
  if (!card || cardHasHistory(card, data.transactions, data.loanReceivables)) return data;
  return { ...data, cards: data.cards.filter((item) => item.id !== id) };
}

/** An adjustment changes only the selected invoice, retaining the amount paid. */
export function adjustCardInvoice(data: ProfileData, id: string, month: string, amount: number | undefined, today = localDateKey()): ProfileData {
  const card = data.cards.find((item) => item.id === id);
  if (!card || !sanitizeInvoiceMonth(month) || (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))))) return data;
  const regular = selectTransactionLedgers(data.transactions, data.loanReceivables).regularTransactions;
  const borrowed = data.includeBorrowedCardPurchases ? getBorrowedCardTransactions(data.loanReceivables) : [];
  const purchases = [...regular, ...borrowed];
  const current = getCardInvoiceMetrics(card, purchases, month, today);
  const automatic = getCardStatementTotal(card, purchases, month, "month");
  const total = amount === undefined ? automatic : Math.round(amount * 100) / 100;
  const previousPayment = card.invoicePaymentsByMonth?.[month];
  const recordedPaid = previousPayment && Number.isFinite(previousPayment.paidAmount) ? Math.max(0, Math.round(previousPayment.paidAmount * 100) / 100) : 0;
  const alreadyPaid = Math.max(current.paidAmount, recordedPaid);
  if (total < alreadyPaid) return data;
  const invoiceOverrideByMonth = { ...card.invoiceOverrideByMonth };
  if (amount === undefined) delete invoiceOverrideByMonth[month];
  else invoiceOverrideByMonth[month] = total;
  const invoicePaymentsByMonth = { ...card.invoicePaymentsByMonth };
  if (previousPayment || alreadyPaid > 0) invoicePaymentsByMonth[month] = {
    ...previousPayment,
    totalAmount: total,
    paidAmount: alreadyPaid,
    paymentDate: previousPayment?.paymentDate ?? today,
  };
  const paid = total > 0 && alreadyPaid >= total;
  return { ...data, cards: data.cards.map((item) => item.id !== id ? item : {
    ...item, invoiceOverrideByMonth, invoicePaymentsByMonth,
    invoicePaidByMonth: { ...item.invoicePaidByMonth, [month]: paid },
    invoicePaid: month === today.slice(0, 7) ? paid : item.invoicePaid,
  }) };
}
