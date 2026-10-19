import type { AppCard, LoanReceivable, ProfileData } from "./app-store";
import {
  getCardBillingChoices,
  getCardBillingCycle,
  getInvoiceDates,
  sanitizeInvoiceMonth,
} from "./card-billing";
import { sanitizeDueDate } from "./transaction-status";

export type CardLoanPart = {
  amount: number;
  dueDate: string;
  closingDate: string;
  invoiceMonth: string;
  installment: number;
  installments: number;
};

/** After closing, a person must explicitly choose the current or next invoice. */
export function getCardLoanCycle(
  card: AppCard | undefined,
  purchaseDate: string,
  invoiceMonth?: string,
) {
  if (!card || card.archived) return null;
  const automatic = getCardBillingCycle(card, purchaseDate);
  if (!automatic) return null;
  const choices = getCardBillingChoices(card, purchaseDate);
  if (choices) {
    if (invoiceMonth === choices.current.month) return choices.current;
    if (invoiceMonth === choices.next.month) return choices.next;
    return null;
  }
  return !invoiceMonth || invoiceMonth === automatic.month ? automatic : null;
}

/** Installments always follow the selected card's real invoice dates. */
export function getCardLoanSchedule(
  card: AppCard | undefined,
  purchaseDate: string,
  amount: number,
  count: number,
  invoiceMonth?: string,
): CardLoanPart[] {
  if (
    !Number.isFinite(amount) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 48
  )
    return [];
  const cents = Math.round(amount * 100);
  const first = getCardLoanCycle(card, purchaseDate, invoiceMonth);
  if (!card || !first || cents < count) return [];
  const [year, month] = first.month.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const monthIndex = year * 12 + month - 1 + index;
    const invoiceMonth = `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, "0")}`;
    const cycle = getInvoiceDates(card, invoiceMonth)!;
    return {
      amount:
        (Math.floor(cents / count) + (index < cents % count ? 1 : 0)) / 100,
      dueDate: cycle.dueDate,
      closingDate: cycle.closingDate,
      invoiceMonth,
      installment: index + 1,
      installments: count,
    };
  });
}

/** Old records without card details need an explicit choice, never a guessed date. */
export function needsCardLoanInvoice(item: LoanReceivable): boolean {
  return (
    item.operationType === "card" &&
    (!item.cardId ||
      !sanitizeInvoiceMonth(item.cardInvoiceMonth) ||
      !sanitizeDueDate(item.cardClosingDate) ||
      !sanitizeDueDate(item.dueDate) ||
      item.collectionMode === "open")
  );
}

/** Link a legacy card purchase without changing installment amounts, receipts or unrelated records. */
export function linkCardLoanInvoice(
  data: ProfileData,
  id: string,
  cardId: string,
  purchaseDate: string,
  invoiceMonth?: string,
): ProfileData {
  const item = data.loanReceivables.find(
    (row) => row.id === id && row.operationType === "card",
  );
  const card = data.cards.find((row) => row.id === cardId);
  if (!item) return data;
  const group = data.loanReceivables.filter(
    (row) => row.loanId === item.loanId && row.operationType === "card",
  );
  const count = Math.max(
    1,
    ...group.map((row) =>
      Math.max(row.installment ?? 1, row.installments ?? 1),
    ),
  );
  const schedule = getCardLoanSchedule(
    card,
    purchaseDate,
    count,
    count,
    invoiceMonth,
  );
  if (
    !schedule.length ||
    group.some(
      (row) =>
        row.receipts?.some((receipt) => receipt.date < purchaseDate) ||
        (row.paymentDate && row.paymentDate < purchaseDate),
    )
  )
    return data;
  const ids = new Set(group.map((row) => row.id));
  const datesFor = (row: LoanReceivable) => {
    const cycle = schedule[(row.installment ?? 1) - 1];
    return {
      cardId,
      cardInvoiceMonth: cycle.invoiceMonth,
      cardClosingDate: cycle.closingDate,
      dueDate: cycle.dueDate,
    };
  };
  const pendingDates = new Map(
    group
      .filter((row) => row.transactionId)
      .map((row) => [row.transactionId, datesFor(row).dueDate]),
  );
  return {
    ...data,
    loanReceivables: data.loanReceivables.map((row) =>
      ids.has(row.id)
        ? {
            ...row,
            ...datesFor(row),
            startDate: purchaseDate,
            collectionMode: "fixed",
            freePaymentMode: undefined,
            suggestedPaymentAmount: undefined,
            status: row.status === "paid" ? "paid" : "scheduled",
          }
        : row,
    ),
    transactions: data.transactions.map((row) =>
      pendingDates.has(row.id) && row.paymentStatus !== "paid"
        ? {
            ...row,
            date: pendingDates.get(row.id)!,
            dueDate: pendingDates.get(row.id),
          }
        : row,
    ),
  };
}
