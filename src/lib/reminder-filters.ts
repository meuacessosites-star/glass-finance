import type { AppNotification, ProfileData } from "./app-store";
import type { PaymentNotification } from "./payment-notifications";
import { searchApprovedNotifications } from "./notification-search";
import { normalizeSearchText } from "./transaction-view";
import { formatCurrency, shortDate } from "./mock-data";

export type ReminderFilter = "all" | "overdue" | "today" | "upcoming";
export type ReminderKind = "all" | "invoice" | "transaction" | "loan";
export type ReminderPreferences = {
  enabled: boolean;
  phase: ReminderFilter;
  kind: ReminderKind;
  browserEnabled: boolean;
};

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enabled: true,
  phase: "all",
  kind: "all",
  browserEnabled: false,
};
const phases = new Set<ReminderFilter>(["all", "overdue", "today", "upcoming"]);
const kinds = new Set<ReminderKind>(["all", "invoice", "transaction", "loan"]);
export function sanitizeReminderPreferences(value: unknown): ReminderPreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_REMINDER_PREFERENCES };
  const v = value as Partial<ReminderPreferences>;
  return {
    enabled: v.enabled !== false,
    browserEnabled: v.browserEnabled === true,
    phase: phases.has(v.phase as ReminderFilter) ? v.phase! : "all",
    kind: kinds.has(v.kind as ReminderKind) ? v.kind! : "all",
  };
}

export function filterPaymentReminders(
  notifications: PaymentNotification[],
  options: { phase: ReminderFilter; kind: ReminderKind; query: string },
): PaymentNotification[] {
  const terms = normalizeSearchText(options.query.trim()).split(/\s+/).filter(Boolean);
  return notifications.filter(item => {
    if (options.phase !== "all" &&
        (options.phase === "upcoming"
          ? item.phase !== "upcoming" && item.phase !== "closing"
          : item.phase !== options.phase)) return false;
    if (options.kind !== "all" && item.kind !== options.kind) return false;
    const text = normalizeSearchText([
      item.title, item.kind, item.date, shortDate(item.date),
      `${item.date.slice(8, 10)}/${item.date.slice(5, 7)}/${item.date.slice(0, 4)}`,
      `${item.date.slice(5, 7)}/${item.date.slice(0, 4)}`,
      formatCurrency(Math.abs(item.amount)), Math.abs(item.amount).toFixed(2),
      item.phase, item.receiving ? "receber recebimento" : "pagar pagamento",
    ].join(" "));
    return terms.every(term => text.includes(term));
  });
}

type SearchFields = Pick<ProfileData,
  "notifications" | "transactions" | "loanReceivables" | "categories" | "cards"
>;
export function filterInboxMessages(data: SearchFields, status: "pending" | "approved", query: string): AppNotification[] {
  if (status === "approved") return searchApprovedNotifications(data, query);
  const terms = normalizeSearchText(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return data.notifications.filter(item => item.status === "pending");
  return data.notifications.filter(item => {
    if (item.status !== "pending") return false;
    const text = normalizeSearchText([
      item.merchant, item.bank, item.date, shortDate(item.date),
      item.time, item.amount.toFixed(2), formatCurrency(item.amount),
      data.categories.find(cat => cat.id === item.categoryId)?.label,
      data.cards.find(card => card.id === item.cardId)?.name,
    ].filter(Boolean).join(" "));
    return terms.every(term => text.includes(term));
  });
}
