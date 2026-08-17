import { currentMonthKey, type Transaction } from "@/lib/mock-data";
import type { AppCard, LoanReceivable } from "@/lib/app-store";

export type DueTodayAlert = {
  id: string;
  label: string;
  kind: "invoice" | "transaction" | "loan";
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isRegularCreditPurchase(transaction: {
  amount: number;
  cardId?: string;
  cardMode?: "credito" | "debito";
  paymentMethod?: string;
  source?: string;
  title?: string;
  note?: string;
}) {
  const searchable = `${transaction.title ?? ""} ${transaction.note ?? ""}`.toLowerCase();
  const looksLikeLoan = transaction.source === "loan" || /empr[eé]stimo|d[ií]vida|loan/.test(searchable);
  return (
    transaction.amount < 0 &&
    Boolean(transaction.cardId) &&
    transaction.cardMode === "credito" &&
    (transaction.paymentMethod === "cartao" || transaction.paymentMethod === "credito") &&
    !looksLikeLoan
  );
}

export function getDueTodayAlerts(
  cards: AppCard[],
  visibleTransactions: Transaction[],
  loanReceivables: LoanReceivable[],
  now = new Date(),
): DueTodayAlert[] {
  const today = localDateKey(now);
  const todayDay = now.getDate();
  const alerts: DueTodayAlert[] = [];

  cards.forEach((card) => {
    if (card.archived || card.dueDay !== todayDay) return;

    const currentInvoicePurchases = visibleTransactions.filter(
      (transaction) =>
        transaction.date.startsWith(`${currentMonthKey}-`) &&
        transaction.cardId === card.id &&
        isRegularCreditPurchase(transaction),
    );
    const invoiceAmount =
      card.invoiceOverrideByMonth?.[currentMonthKey] ??
      card.invoicePaymentsByMonth?.[currentMonthKey]?.totalAmount ??
      currentInvoicePurchases.reduce(
        (total, transaction) => total + Math.abs(transaction.amount),
        0,
      );
    const invoicePaid =
      card.invoicePaidByMonth?.[currentMonthKey] ?? card.invoicePaid === true;

    if (invoiceAmount > 0 && !invoicePaid) {
      alerts.push({
        id: `invoice-${card.id}-${currentMonthKey}`,
        label: `${card.name}: fatura vence hoje`,
        kind: "invoice",
      });
    }
  });

  visibleTransactions.forEach((transaction) => {
    if (
      transaction.date !== today ||
      transaction.paymentStatus !== "pending" ||
      transaction.source === "loan" ||
      isRegularCreditPurchase(transaction)
    ) {
      return;
    }
    alerts.push({
      id: `transaction-${transaction.id}`,
      label: `${transaction.title}: transação pendente vence hoje`,
      kind: "transaction",
    });
  });

  loanReceivables.forEach((receivable) => {
    if (!receivable.dueDate || receivable.dueDate !== today || receivable.status === "paid") {
      return;
    }
    alerts.push({
      id: `loan-${receivable.id}`,
      label: `${receivable.contact}: recebimento de empréstimo vence hoje`,
      kind: "loan",
    });
  });

  return alerts;
}
