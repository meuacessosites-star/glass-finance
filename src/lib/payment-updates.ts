import type { ProfileData } from "./app-store";
import { getTransactionInvoiceMonth, isCreditCardExpense, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
import { selectTransactionLedgers } from "./transaction-ledgers";

export function setInvoicePaymentStatus(data: ProfileData, cardId: string, month: string, paid: boolean, today = localDateKey()): ProfileData {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card || !sanitizeInvoiceMonth(month)) return data;
  const belongsToInvoice = (transaction: ProfileData["transactions"][number]) => isCreditCardExpense(transaction) && transaction.cardId === cardId && getTransactionInvoiceMonth(transaction, card) === month;
  const invoiceItems = selectTransactionLedgers(data.transactions, data.loanReceivables).regularTransactions.filter(belongsToInvoice);
  const ids = new Set(invoiceItems.map((item) => item.id));
  const payment = card.invoicePaymentsByMonth?.[month];
  const gross = invoiceItems.reduce((sum, item) => sum + Math.abs(item.amount), 0);
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

export function setTransactionPaymentState(data: ProfileData, id: string, status: "paid" | "pending", today = localDateKey()): ProfileData {
  const transaction = data.transactions.find((item) => item.id === id);
  if (!transaction || selectTransactionLedgers([transaction], data.loanReceivables).loanTransactions.length) return data;
  const card = isCreditCardExpense(transaction) ? data.cards.find((item) => item.id === transaction.cardId) : undefined;
  if (card) return setInvoicePaymentStatus(data, card.id, getTransactionInvoiceMonth(transaction, card), status === "paid", today);
  return { ...data, transactions: data.transactions.map((item) => item.id === id ? { ...item, paymentStatus: status, paymentDate: status === "paid" ? today : undefined } : item) };
}
