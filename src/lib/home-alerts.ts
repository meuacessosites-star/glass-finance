import type { ProfileData } from "./app-store";
import {
  getPaymentNotifications,
  type PaymentNotification,
} from "./payment-notifications";

export const HOME_ALERT_DISPLAY_MS = 3 * 60_000;
export type HomeAlert = {
  id: string;
  tone: PaymentNotification["phase"] | "message";
  label: string;
  title: string;
  description?: string;
  date: string;
  amount: number;
  receiving?: boolean;
  action: string;
  destination: {
    pathname: string;
    state: {
      notificationId?: string;
      transactionId?: string;
      receivableId?: string;
      cardId?: string;
      invoiceMonth?: string;
    };
  };
};
type AlertData = Pick<
  ProfileData,
  | "cards"
  | "transactions"
  | "loanReceivables"
  | "notifications"
  | "includeBorrowedCardInvoices"
>;

/** Home reminders have their own temporary visibility; inbox read state is untouched. */
export function homePaymentAlertId(item: PaymentNotification): string {
  return item.kind === "invoice"
    ? `home:invoice:${item.cardId}:${item.invoiceMonth}`
    : item.kind === "loan"
      ? `home:loan:${item.receivableId}`
      : `home:transaction:${item.transactionId}`;
}
export function getHomeAlerts(data: AlertData, today: string): HomeAlert[] {
  const payments = getPaymentNotifications(
    {
      cards: data.cards,
      transactions: data.transactions,
      loanReceivables: data.loanReceivables,
      includeBorrowedCardInvoices: data.includeBorrowedCardInvoices,
      readPaymentNotificationIds: [],
    },
    today,
  ).map(
    (item): HomeAlert => ({
      id: homePaymentAlertId(item),
      tone: item.event === "closing" ? "closing" : item.phase,
      label:
        item.phase === "overdue"
          ? item.receiving
            ? "Recebimento em atraso"
            : "Pagamento vencido"
          : item.phase === "today"
            ? item.receiving
              ? "Receber hoje"
              : "Vence hoje"
            : item.event === "closing"
              ? item.phase === "closing"
                ? "Fecha hoje"
                : "Fechamento próximo"
              : item.receiving
                ? "Recebimento próximo"
                : "Vencimento próximo",
      title: item.title,
      date: item.date,
      amount: item.amount,
      receiving: item.receiving,
      action:
        item.kind === "invoice"
          ? "Ver fatura"
          : item.kind === "loan"
            ? "Ver empréstimo"
            : "Ver transação",
      destination:
        item.kind === "invoice"
          ? {
              pathname: "/dashboard/compras-cartao",
              state: { cardId: item.cardId, invoiceMonth: item.invoiceMonth },
            }
          : item.kind === "loan"
            ? {
                pathname: "/dashboard/emprestimos",
                state: { receivableId: item.receivableId },
              }
            : {
                pathname: "/dashboard/transacoes",
                state: { transactionId: item.transactionId },
              },
    }),
  );
  const messages = data.notifications
    .filter((item) => item.status === "pending")
    .map(
      (item): HomeAlert => ({
        id: `notification:${item.id}`,
        tone: "message",
        label: "Notificação para revisar",
        title: item.merchant,
        description: item.bank,
        date: item.date,
        amount: item.amount,
        action: "Revisar notificação",
        destination: {
          pathname: "/dashboard/notificacoes",
          state: { notificationId: item.id },
        },
      }),
    );
  const priority: Record<HomeAlert["tone"], number> = {
    overdue: 0,
    today: 1,
    message: 2,
    closing: 3,
    upcoming: 4,
  };
  const unique = new Map(
    [...payments, ...messages].map((item) => [item.id, item]),
  );
  return [...unique.values()].sort(
    (a, b) =>
      priority[a.tone] - priority[b.tone] ||
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
}

export type HomeAlertSession = {
  firstShownAt: Record<string, number>;
  hiddenIds: string[];
};
export function createHomeAlertSession(): HomeAlertSession {
  return { firstShownAt: {}, hiddenIds: [] };
}
export function registerHomeAlerts(
  session: HomeAlertSession,
  alerts: HomeAlert[],
  now: number,
): HomeAlertSession {
  const newItems = alerts.filter(
    (item) =>
      !Object.prototype.hasOwnProperty.call(session.firstShownAt, item.id),
  );
  if (!newItems.length) return session;
  return {
    ...session,
    firstShownAt: {
      ...session.firstShownAt,
      ...Object.fromEntries(newItems.map((item) => [item.id, now])),
    },
  };
}
export function hideHomeAlert(
  session: HomeAlertSession,
  id: string,
): HomeAlertSession {
  return session.hiddenIds.includes(id)
    ? session
    : { ...session, hiddenIds: [...session.hiddenIds, id] };
}
export function visibleHomeAlerts(
  alerts: HomeAlert[],
  session: HomeAlertSession,
  now: number,
  displaySeconds = HOME_ALERT_DISPLAY_MS / 1000,
): HomeAlert[] {
  const hidden = new Set(session.hiddenIds);
  return alerts.filter(
    (item) =>
      !hidden.has(item.id) &&
      (displaySeconds === 0 || now < (session.firstShownAt[item.id] ?? now) + displaySeconds * 1000),
  );
}
