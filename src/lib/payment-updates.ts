import type { InvoicePaymentRecord, ProfileData } from "./app-store";
import { getCurrentInvoiceMonth, getCurrentInstallment, getTransactionInvoiceSchedule, isCreditCardExpense, isInvoiceMarkedPaid, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
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
  const gross = invoiceItems.reduce((sum, item) => sum + (getTransactionInvoiceSchedule(item, card).find((part) => part.month === month)?.amount ?? 0), 0);
  const total = card.invoiceOverrideByMonth?.[month] ?? Math.max(gross, payment?.totalAmount ?? 0);
  const invoicePaymentsByMonth = { ...(card.invoicePaymentsByMonth ?? {}) };
  if (paid && total > 0) invoicePaymentsByMonth[month] = { totalAmount: total, paidAmount: total, paymentDate: today };
  else delete invoicePaymentsByMonth[month];
  return {
    ...data,
    cards: data.cards.map((item) => item.id !== cardId ? item : {
      ...item,
      invoicePaidByMonth: { ...(item.invoicePaidByMonth ?? {}), [month]: paid },
      invoicePaid: month === today.slice(0, 7) ? paid : item.invoicePaid,
      invoicePaymentsByMonth,
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
    ...card, invoicePaymentsByMonth: { ...(card.invoicePaymentsByMonth ?? {}), [month]: { ...payment, totalAmount, paidAmount } },
  }) };
}

export function setTransactionPaymentState(data: ProfileData, id: string, status: "paid" | "pending", today = localDateKey()): ProfileData {
  const transaction = data.transactions.find((item) => item.id === id);
  if (!transaction || selectTransactionLedgers([transaction], data.loanReceivables).loanTransactions.length) return data;
  const card = isCreditCardExpense(transaction) ? data.cards.find((item) => item.id === transaction.cardId) : undefined;
  if (card) return setInvoicePaymentStatus(data, card.id, getCurrentInvoiceMonth(transaction, card), status === "paid", today);
  return { ...data, transactions: data.transactions.map((item) => item.id === id ? { ...item, paymentStatus: status, paymentDate: status === "paid" ? today : undefined } : item) };
}
