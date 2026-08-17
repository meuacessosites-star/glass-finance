import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { currentMonthKey } from "@/lib/mock-data";
import { useAppStore } from "@/lib/app-store";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type DueTodayAlert = {
  id: string;
  label: string;
  kind: "invoice" | "transaction" | "loan";
};

function isRegularCreditPurchase(transaction: {
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

export function DueTodayAlerts() {
  const navigate = useNavigate();
  const { activeProfile, cards, visibleTransactions, loanReceivables } = useAppStore();
  const today = localDateKey();

  const dueToday = useMemo<DueTodayAlert[]>(() => {
    const todayDay = new Date().getDate();
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
        currentInvoicePurchases.reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
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
  }, [cards, loanReceivables, today, visibleTransactions]);

  const alertKey = useMemo(
    () =>
      `${activeProfile?.id ?? "profile"}:${today}:${dueToday
        .map((item) => item.id)
        .sort()
        .join(",")}`,
    [activeProfile?.id, dueToday, today],
  );
  const displayedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!dueToday.length || displayedKey.current === alertKey) return;

    const storageKey = `granascan:due-today-alert:${alertKey}`;
    try {
      if (window.sessionStorage.getItem(storageKey) === "shown") {
        displayedKey.current = alertKey;
        return;
      }
      window.sessionStorage.setItem(storageKey, "shown");
    } catch {
      // A restricted storage environment should not prevent the visual alert.
    }

    displayedKey.current = alertKey;
    const visibleItems = dueToday.slice(0, 3).map((item) => item.label).join(" • ");
    const remaining = dueToday.length - 3;
    toast.warning(
      `${dueToday.length} pendência${dueToday.length === 1 ? "" : "s"} vence hoje`,
      {
        description: `${visibleItems}${remaining > 0 ? ` • +${remaining} outra${remaining === 1 ? "" : "s"}` : ""}`,
        duration: 9000,
        action: {
          label: "Ver transações",
          onClick: () => navigate("/dashboard/transacoes"),
        },
      },
    );
  }, [alertKey, dueToday, navigate]);

  return null;
}
