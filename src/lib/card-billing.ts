import type { AppCard } from "./app-store";
import type { Transaction } from "./mock-data";

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day, 12);
  return localDateKey(result) === value ? result : null;
}
function validDay(day?: number): day is number {
  return typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 31;
}
export function calendarDate(year: number, monthIndex: number, day: number): string {
  const month = new Date(year, monthIndex, 1, 12);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  return localDateKey(new Date(month.getFullYear(), month.getMonth(), Math.min(day, last), 12));
}
export type CardBillingCycle = { closingDate: string; dueDate: string; month: string };
export function sanitizeInvoiceMonth(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && parseDate(`${value}-01`) ? value : undefined;
}
export function getCardBillingCycle(card: Pick<AppCard, "closingDay" | "dueDay">, purchaseDate: string): CardBillingCycle | null {
  const purchase = parseDate(purchaseDate);
  if (!purchase || !validDay(card.closingDay) || !validDay(card.dueDay)) return null;
  let month = purchase.getMonth();
  let closingDate = calendarDate(purchase.getFullYear(), month, card.closingDay);
  if (purchaseDate > closingDate) {
    month += 1;
    closingDate = calendarDate(purchase.getFullYear(), month, card.closingDay);
  }
  const dueDate = calendarDate(purchase.getFullYear(), month + (card.dueDay > card.closingDay ? 0 : 1), card.dueDay);
  return { closingDate, dueDate, month: dueDate.slice(0, 7) };
}
export function getInvoiceDates(card: Pick<AppCard, "closingDay" | "dueDay">, month: string): CardBillingCycle | null {
  if (!sanitizeInvoiceMonth(month) || !validDay(card.closingDay) || !validDay(card.dueDay)) return null;
  const [year, number] = month.split("-").map(Number);
  const dueDate = calendarDate(year, number - 1, card.dueDay);
  const closingDate = calendarDate(year, number - (card.dueDay > card.closingDay ? 1 : 2), card.closingDay);
  return { closingDate, dueDate, month };
}
/** The current invoice means the one closed in the purchase's calendar month. */
export function getCardBillingChoices(card: Pick<AppCard, "closingDay" | "dueDay">, purchaseDate: string): { current: CardBillingCycle; next: CardBillingCycle } | null {
  const purchase = parseDate(purchaseDate);
  const next = getCardBillingCycle(card, purchaseDate);
  if (!purchase || !next || !validDay(card.closingDay) || !validDay(card.dueDay)) return null;
  const closingDate = calendarDate(purchase.getFullYear(), purchase.getMonth(), card.closingDay);
  if (purchaseDate <= closingDate) return null;
  const dueDate = calendarDate(purchase.getFullYear(), purchase.getMonth() + (card.dueDay > card.closingDay ? 0 : 1), card.dueDay);
  return { current: { closingDate, dueDate, month: dueDate.slice(0, 7) }, next };
}
export function isCreditCardExpense(t: Pick<Transaction, "amount" | "cardId" | "cardMode" | "paymentMethod" | "source">): boolean {
  return t.amount < 0 && !!t.cardId && t.source !== "loan" &&
    (t.cardMode === "credito" || t.paymentMethod === "credito") &&
    (t.paymentMethod === "cartao" || t.paymentMethod === "credito");
}
export function getTransactionBillingCycle(t: Pick<Transaction, "date" | "cardInvoiceMonth">, card: Pick<AppCard, "closingDay" | "dueDay">): CardBillingCycle | null {
  const savedMonth = sanitizeInvoiceMonth(t.cardInvoiceMonth);
  return (savedMonth && getInvoiceDates(card, savedMonth)) || getCardBillingCycle(card, t.date);
}
export function getTransactionInvoiceMonth(t: Pick<Transaction, "date" | "cardInvoiceMonth">, card?: Pick<AppCard, "closingDay" | "dueDay">): string {
  return sanitizeInvoiceMonth(t.cardInvoiceMonth) || (card && getCardBillingCycle(card, t.date)?.month) || t.date.slice(0, 7);
}
export function getInstallmentCount(transaction: Transaction): number {
  return transaction.recurrence === "parcelada" && Number.isFinite(transaction.installments)
    ? Math.min(48, Math.max(1, Math.round(transaction.installments!))) : 1;
}
export function getCurrentInstallment(transaction: Transaction): number {
  return Number.isFinite(transaction.currentInstallment)
    ? Math.min(getInstallmentCount(transaction), Math.max(1, Math.round(transaction.currentInstallment!))) : 1;
}
export type CardInvoicePart = { number: number; total: number; amount: number; month: string; dueDate?: string };
/** Derive invoice parts without adding duplicate transactions to the cash ledger. */
export function getTransactionInvoiceSchedule(transaction: Transaction, card?: Pick<AppCard, "closingDay" | "dueDay">): CardInvoicePart[] {
  if (transaction.amount >= 0 || transaction.source === "loan" ||
    !(transaction.cardMode === "credito" || transaction.paymentMethod === "credito") ||
    !(transaction.paymentMethod === "cartao" || transaction.paymentMethod === "credito")) return [];
  const firstMonth = sanitizeInvoiceMonth(getTransactionInvoiceMonth(transaction, card));
  if (!firstMonth) return [];
  const count = getInstallmentCount(transaction);
  const totalCents = Math.round(Math.abs(transaction.amount) * 100);
  const cents = Math.floor(totalCents / count), remainder = totalCents % count;
  const [year, monthNumber] = firstMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const month = calendarDate(year, monthNumber - 1 + index, 1).slice(0, 7);
    return { number: index + 1, total: count, amount: (cents + (index < remainder ? 1 : 0)) / 100,
      month, dueDate: card ? getInvoiceDates(card, month)?.dueDate : undefined };
  });
}
export function getTransactionInvoiceAmount(transaction: Transaction, card: AppCard, month: string): number {
  return getTransactionInvoiceSchedule(transaction, card).find((part) => part.month === month)?.amount ?? 0;
}
export function getInvoicePartsInPeriod(transaction: Transaction, card: AppCard, month: string, fromDate?: string | null, untilDate?: string | null): CardInvoicePart[] {
  return getTransactionInvoiceSchedule(transaction, card).filter((part) => {
    if (!fromDate && !untilDate) return part.month === month;
    const start = fromDate ?? `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const end = untilDate ?? calendarDate(year, monthNumber - 1, 31);
    return !!part.dueDate && part.dueDate >= start && part.dueDate <= end;
  });
}
export function getCurrentInvoiceMonth(transaction: Transaction, card?: AppCard): string {
  return getTransactionInvoiceSchedule(transaction, card).find((part) => part.number === getCurrentInstallment(transaction))?.month
    ?? getTransactionInvoiceMonth(transaction, card);
}
export function isInvoicePartPaid(transaction: Transaction, card: AppCard | undefined, part: CardInvoicePart, today = localDateKey()): boolean {
  if (card && isInvoiceMarkedPaid(card, part.month, today.slice(0, 7))) return true;
  return part.number === getCurrentInstallment(transaction) && transaction.paymentStatus === "paid";
}
export function isInvoiceMarkedPaid(card: AppCard, month: string, currentMonth = localDateKey().slice(0, 7)): boolean {
  if (typeof card.invoicePaidByMonth?.[month] === "boolean") return card.invoicePaidByMonth[month];
  return !Object.keys(card.invoicePaidByMonth ?? {}).length && month === currentMonth && card.invoicePaid === true;
}
export type CardBillingReminder = CardBillingCycle & {
  id: string; cardId: string; cardName: string; last4: string;
  amount: number; phase: "closing" | "due" | "overdue" | "upcoming";
};
export function getCardBillingReminders(cards: AppCard[], transactions: Transaction[], now = new Date()): CardBillingReminder[] {
  const today = localDateKey(now);
  const reminders: CardBillingReminder[] = [];
  for (const card of cards) {
    if (card.archived) continue;
    const purchases = transactions.filter((t) => t.cardId === card.id && isCreditCardExpense(t));
    const entries = purchases.flatMap((transaction) => getTransactionInvoiceSchedule(transaction, card).map((part) => ({ transaction, part })));
    const months = new Set([...entries.map(({ part }) => part.month), ...Object.keys(card.invoicePaymentsByMonth ?? {}), ...Object.keys(card.invoiceOverrideByMonth ?? {})]);
    for (const month of months) {
      const dates = getInvoiceDates(card, month);
      if (!dates || isInvoiceMarkedPaid(card, month, today.slice(0, 7))) continue;
      const items = entries.filter(({ part }) => part.month === month);
      const gross = items.reduce((sum, { part }) => sum + part.amount, 0);
      const payment = card.invoicePaymentsByMonth?.[month];
      const total = card.invoiceOverrideByMonth?.[month] ?? Math.max(gross, payment?.totalAmount ?? 0);
      const individuallyPaid = items.filter(({ transaction, part }) => isInvoicePartPaid(transaction, card, part, today)).reduce((sum, { part }) => sum + part.amount, 0);
      const amount = Math.round((total - Math.max(individuallyPaid, payment?.paidAmount ?? 0)) * 100) / 100;
      if (amount <= 0) continue;
      reminders.push({ ...dates, id: `card-invoice-${card.id}-${month}`, cardId: card.id, cardName: card.name, last4: card.last4, amount,
        phase: dates.dueDate < today ? "overdue" : dates.dueDate === today ? "due" : dates.closingDate === today ? "closing" : "upcoming" });
    }
  }
  return reminders.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cardName.localeCompare(b.cardName));
}
