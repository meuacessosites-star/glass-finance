import type { AppCard } from "./app-store";
import type { Transaction } from "./mock-data";
import { getInvoiceDates, getInvoicePartsInPeriod, getTransactionInvoiceSchedule, isCreditCardExpense, isInvoiceMarkedPaid, isInvoicePartPaid, localDateKey, sanitizeInvoiceMonth } from "./card-billing";
import { selectTransactionLedgers } from "./transaction-ledgers";

const cents = (amount: number) => Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;

export type CardInvoiceStatus = "paid" | "empty" | "overdue" | "due" | "partial" | "open";

/** A due warning takes priority over partial payment; paid invoices never expire. */
export function getCardInvoiceStatus(card: AppCard, month: string, metrics: { invoicePaid: boolean; invoiceTotal: number; paidAmount: number }, today = localDateKey()): CardInvoiceStatus {
  if (metrics.invoicePaid) return "paid";
  if (metrics.invoiceTotal <= 0) return "empty";
  const dueDate = getInvoiceDates(card, month)?.dueDate;
  if (dueDate && dueDate < today) return "overdue";
  if (dueDate === today) return "due";
  return metrics.paidAmount > 0 ? "partial" : "open";
}

/** Keep bank colors intact while choosing readable ink, including custom colors. */
export function getCardHeaderForeground(color: string): "#050505" | "#FFFFFF" {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => {
      const s = parseInt(hex.slice(index, index + 2), 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const background = luminance(/^#[0-9a-f]{6}$/i.test(color) ? color : "#2F6BFF");
  const darkContrast = (background + 0.05) / (luminance("#050505") + 0.05);
  const whiteContrast = 1.05 / (background + 0.05);
  return darkContrast >= whiteContrast ? "#050505" : "#FFFFFF";
}

export function selectCardPurchases(transactions: Transaction[]): Transaction[] {
  return selectTransactionLedgers(transactions).regularTransactions.filter(
    (row) => Number.isFinite(row.amount) && isCreditCardExpense(row),
  );
}

/** Always the whole invoice month. Statement filters cannot change a payment. */
export function getCardInvoiceMetrics(card: AppCard, transactions: Transaction[], month: string, today = localDateKey()) {
  const entries = selectCardPurchases(transactions)
    .filter((row) => row.cardId === card.id)
    .flatMap((transaction) => getInvoicePartsInPeriod(transaction, card, month).map((part) => ({ transaction, part })));
  const grossCents = entries.reduce((sum, { part }) => sum + cents(part.amount), 0);
  const payment = card.invoicePaymentsByMonth?.[month];
  const override = card.invoiceOverrideByMonth?.[month];
  const totalCents = typeof override === "number" && Number.isFinite(override)
    ? cents(override) : Math.max(grossCents, cents(payment?.totalAmount ?? 0));
  const markedPaid = isInvoiceMarkedPaid(card, month, today.slice(0, 7));
  const individuallyPaid = entries.reduce((sum, { transaction, part }) =>
    sum + (isInvoicePartPaid(transaction, card, part, today) ? cents(part.amount) : 0), 0);
  // The payment record is cumulative, and can overlap individually paid rows.
  const paidCents = markedPaid ? totalCents : Math.min(totalCents, Math.max(individuallyPaid, cents(payment?.paidAmount ?? 0)));
  return {
    invoiceTotal: totalCents / 100,
    paidAmount: paidCents / 100,
    openAmount: (totalCents - paidCents) / 100,
    invoicePaid: markedPaid || (totalCents > 0 && paidCents === totalCents),
  };
}

/** Future installments also reserve the card limit until they are paid. */
export function getCardCommittedAmount(card: AppCard, transactions: Transaction[], today = localDateKey()): number {
  const purchases = selectCardPurchases(transactions).filter((row) => row.cardId === card.id);
  const months = new Set([
    ...purchases.flatMap((row) => getTransactionInvoiceSchedule(row, card).map((part) => part.month)),
    ...Object.keys(card.invoicePaymentsByMonth ?? {}),
    ...Object.keys(card.invoiceOverrideByMonth ?? {}),
  ]);
  return [...months].reduce((sum, month) => sum + cents(getCardInvoiceMetrics(card, purchases, month, today).openAmount), 0) / 100;
}

/** Exact month selection: omitted months never enter the statement through a date span. */
export function getSelectedInvoiceParts(transaction: Transaction, card: AppCard, month: string, fromDate?: string | null, untilDate?: string | null, months?: readonly string[]) {
  if (fromDate || untilDate) return getInvoicePartsInPeriod(transaction, card, month, fromDate, untilDate);
  const selected = new Set((months?.length ? months : [month]).filter((key) => sanitizeInvoiceMonth(key)));
  return getTransactionInvoiceSchedule(transaction, card).filter((part) => selected.has(part.month));
}

/** Sum exactly the displayed rows; history counts each original purchase once. */
export function getCardStatementTotal(card: AppCard, rows: Transaction[], month: string, scope: "month" | "all", fromDate?: string | null, untilDate?: string | null, months?: readonly string[]): number {
  return selectCardPurchases(rows).filter((row) => row.cardId === card.id).reduce((sum, row) =>
    sum + (scope === "all" ? cents(Math.abs(row.amount)) : getSelectedInvoiceParts(row, card, month, fromDate, untilDate, months).reduce((subtotal, part) => subtotal + cents(part.amount), 0)), 0) / 100;
}

/** Accept Brazilian grouping/comma or an ungrouped decimal point, never truncate. */
export function parseInvoiceMoney(value: string): number | null {
  const input = value.trim();
  const brazilian = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(input);
  if (!brazilian && !/^\d+\.\d{1,2}$/.test(input)) return null;
  const amount = Number(brazilian ? input.replace(/\./g, "").replace(",", ".") : input);
  const parsedCents = Math.round(amount * 100);
  return Number.isSafeInteger(parsedCents) && parsedCents >= 0 ? parsedCents / 100 : null;
}

export function getInvoicePaymentAmount(outstanding: number, mode: "full" | "partial" | "installments", input: string, count: number, originalTotal = outstanding): number | null {
  const balance = cents(outstanding);
  if (!balance) return null;
  if (mode === "full") return balance / 100;
  if (mode === "installments") return Number.isInteger(count) && count >= 2 && count <= 48 ? Math.min(balance, Math.ceil(Math.max(balance, cents(originalTotal)) / count)) / 100 : null;
  const amount = parseInvoiceMoney(input);
  return amount !== null && amount > 0 && cents(amount) <= balance ? amount : null;
}
