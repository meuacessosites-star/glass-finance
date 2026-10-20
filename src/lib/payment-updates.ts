import type { InvoicePaymentRecord, ProfileData } from "./app-store";
import { getCurrentInvoiceMonth, getCurrentInstallment, getTransactionInvoiceSchedule, isCreditCardExpense, isInvoiceMarkedPaid, isInvoicePartPaid, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
import { getCardInvoiceMetrics } from "./card-invoice-view";
import { getBorrowedCardTransactions } from "./card-loan-purchases";
import { selectTransactionLedgers } from "./transaction-ledgers";

export function openUnpaidPurchaseInvoices(data: ProfileData, transaction: ProfileData["transactions"][number], today = localDateKey()): ProfileData {
  if (!isCreditCardExpense(transaction) || selectTransactionLedgers([transaction], data.loanReceivables).loanTransactions.length) return data;
  const card = data.cards.find((item) => item.id === transaction.cardId);
  if (!card) return data;
  const months = getTransactionInvoiceSchedule(transaction, card)
    .filter((part) => !(part.number === getCurrentInstallment(transaction) && transaction.paymentStatus === "paid"))
    .map((part) => part.month);
  if (!months.length) return data;
  return { ...data, cards: data.cards.map((item) => item.id !== card.id ? item : {
    ...item,
    invoicePaidByMonth: { ...(item.invoicePaidByMonth ?? {}), ...Object.fromEntries(months.map((month) => [month, false])) },
    invoicePaid: months.includes(today.slice(0, 7)) ? false : item.invoicePaid,
  }) };
}

export function setInvoicePaymentStatus(data: ProfileData, cardId: string, month: string, paid: boolean, today = localDateKey()): ProfileData {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card || !sanitizeInvoiceMonth(month)) return data;
  const belongsToInvoice = (transaction: ProfileData["transactions"][number]) => isCreditCardExpense(transaction) && transaction.cardId === cardId && getTransactionInvoiceSchedule(transaction, card).some((part) => part.month === month);
  const invoiceItems = selectTransactionLedgers(data.transactions, data.loanReceivables).regularTransactions.filter(belongsToInvoice);
  const ids = new Set(invoiceItems.filter((item) => getTransactionInvoiceSchedule(item, card).some((part) => part.month === month && part.number === getCurrentInstallment(item))).map((item) => item.id));
  const payment = card.invoicePaymentsByMonth?.[month];
  const borrowed = data.includeBorrowedCardPurchases ? getBorrowedCardTransactions(data.loanReceivables).filter(belongsToInvoice) : [];
  const gross = [...invoiceItems, ...borrowed].reduce((sum, item) => sum + (getTransactionInvoiceSchedule(item, card).find((part) => part.month === month)?.amount ?? 0), 0);
  const total = card.invoiceOverrideByMonth?.[month] ?? Math.max(gross, payment?.totalAmount ?? 0);
  const invoicePaymentsByMonth = { ...(card.invoicePaymentsByMonth ?? {}) };
  if (paid && total > 0) invoicePaymentsByMonth[month] = { totalAmount: total, paidAmount: total, paymentDate: today };
  else delete invoicePaymentsByMonth[month];
  const invoicePaidPurchaseIdsByMonth = { ...card.invoicePaidPurchaseIdsByMonth };
  if (paid) invoicePaidPurchaseIdsByMonth[month] = invoiceItems.map((item) => item.id);
  else delete invoicePaidPurchaseIdsByMonth[month];
  return {
    ...data,
    cards: data.cards.map((item) => item.id !== cardId ? item : {
      ...item,
      invoicePaidByMonth: { ...(item.invoicePaidByMonth ?? {}), [month]: paid },
      invoicePaid: month === today.slice(0, 7) ? paid : item.invoicePaid,
      invoicePaymentsByMonth,
      invoicePaidPurchaseIdsByMonth,
    }),
    transactions: data.transactions.map((item) => ids.has(item.id) ? { ...item, paymentStatus: paid ? "paid" : "pending", paymentDate: paid ? today : undefined } : item),
  };
}

export function recordInvoicePayment(data: ProfileData, cardId: string, month: string, payment: InvoicePaymentRecord): ProfileData {
  if (!data.cards.some((card) => card.id === cardId) || !sanitizeInvoiceMonth(month) ||
    !Number.isFinite(payment.totalAmount) || !Number.isFinite(payment.paidAmount)) return data;
  const totalAmount = Math.max(0, payment.totalAmount);
  const paidAmount = Math.min(totalAmount, Math.max(0, payment.paidAmount));
  const paid = paidAmount >= totalAmount && totalAmount > 0;
  const card = data.cards.find((item) => item.id === cardId)!;
  const previousPayment = card.invoicePaymentsByMonth?.[month];
  const wasPaid = isInvoiceMarkedPaid(card, month, payment.paymentDate.slice(0, 7)) ||
    Boolean(previousPayment && previousPayment.totalAmount > 0 && previousPayment.paidAmount >= previousPayment.totalAmount);
  const next = setInvoicePaymentStatus(data, cardId, month, paid, payment.paymentDate);
  return { ...next, transactions: paid || wasPaid ? next.transactions : data.transactions, cards: next.cards.map((card) => card.id !== cardId ? card : {
    ...card,
    invoicePaidPurchaseIdsByMonth: !paid && !wasPaid ? data.cards.find((item) => item.id === cardId)?.invoicePaidPurchaseIdsByMonth : card.invoicePaidPurchaseIdsByMonth,
    invoicePaymentsByMonth: { ...(card.invoicePaymentsByMonth ?? {}), [month]: { ...payment, totalAmount, paidAmount } },
  }) };
}

export function setTransactionPaymentState(data: ProfileData, id: string, status: "paid" | "pending", today = localDateKey()): ProfileData {
  const transaction = data.transactions.find((item) => item.id === id);
  if (!transaction || selectTransactionLedgers([transaction], data.loanReceivables).loanTransactions.length) return data;
  const card = isCreditCardExpense(transaction) ? data.cards.find((item) => item.id === transaction.cardId) : undefined;
  if (card) {
    const month = getCurrentInvoiceMonth(transaction, card);
    const purchases = selectTransactionLedgers(data.transactions, data.loanReceivables).regularTransactions;
    const entries = purchases.filter((item) => isCreditCardExpense(item) && item.cardId === card.id)
      .flatMap((item) => getTransactionInvoiceSchedule(item, card).filter((part) => part.month === month).map((part) => ({ item, part })));
    const selected = entries.find(({ item }) => item.id === id);
    if (!selected) return data;
    const wasPaid = isInvoicePartPaid(transaction, card, selected.part, today);
    if (wasPaid === (status === "paid")) return data;
    const ids = new Set(entries.filter(({ item, part }) => isInvoicePartPaid(item, card, part, today)).map(({ item }) => item.id));
    if (status === "paid") ids.add(id); else ids.delete(id);
    const current = getCardInvoiceMetrics(card, purchases, month, today);
    const cents = (value: number) => Math.max(0, Math.round(value * 100));
    const individuallyPaid = entries.reduce((sum, { item, part }) => sum + (ids.has(item.id) ? cents(part.amount) : 0), 0);
    // Both sources are cumulative. Reopening releases only this purchase's share.
    const previousPaid = Math.max(0, cents(current.paidAmount) - (status === "pending" && wasPaid ? cents(selected.part.amount) : 0));
    const paidCents = Math.min(cents(current.invoiceTotal), Math.max(individuallyPaid, previousPaid));
    const paid = current.invoiceTotal > 0 && paidCents >= cents(current.invoiceTotal) && entries.every(({ item }) => ids.has(item.id));
    const previousPayment = card.invoicePaymentsByMonth?.[month];
    const invoicePaymentsByMonth = { ...card.invoicePaymentsByMonth };
    if (paidCents > 0) invoicePaymentsByMonth[month] = {
      ...previousPayment, totalAmount: current.invoiceTotal, paidAmount: paidCents / 100,
      paymentDate: status === "paid" ? today : previousPayment?.paymentDate ?? today,
    };
    else delete invoicePaymentsByMonth[month];
    return {
      ...data,
      transactions: data.transactions.map((item) => item.id === id ? { ...item, paymentStatus: status, paymentDate: status === "paid" ? today : undefined } : item),
      cards: data.cards.map((item) => item.id !== card.id ? item : {
        ...item, invoicePaymentsByMonth,
        invoicePaidPurchaseIdsByMonth: { ...item.invoicePaidPurchaseIdsByMonth, [month]: [...ids] },
        invoicePaidByMonth: { ...item.invoicePaidByMonth, [month]: paid },
        invoicePaid: month === today.slice(0, 7) ? paid : item.invoicePaid,
      }),
    };
  }
  return { ...data, transactions: data.transactions.map((item) => item.id === id ? { ...item, paymentStatus: status, paymentDate: status === "paid" ? today : undefined } : item) };
}
