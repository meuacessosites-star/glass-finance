import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAppStore } from "@/lib/app-store";
import { getPaymentNotifications } from "@/lib/payment-notifications";
import { localDateKey } from "@/lib/card-billing";

/** Keep a small, privacy-safe server calendar for offline daily push reminders.
 * This intentionally sends no amount, title, account name or financial details.
 * Only enabled profiles synchronize, and never more than 300 dated events.
 */
export function PushScheduleSync() {
  const {
    activeProfile, reminderPreferences, cards, visibleTransactions, loanReceivables,
    notifications, includeBorrowedCardInvoices,
  } = useAppStore();
  const sync = useMutation(api.pushNotifications.syncSchedule);
  const lastSent = useRef("");
  const today = localDateKey();
  const schedule = useMemo(() => {
    const payments = getPaymentNotifications({
      cards, transactions: visibleTransactions, loanReceivables,
      includeBorrowedCardInvoices, readPaymentNotificationIds: [],
    }, today, 90);
    // Exclude very old unpaid entries so they cannot crowd out near-term
    // reminders when a long-running account has hundreds of past transactions.
    const origin = Date.parse(today + "T12:00:00Z");
    const items: Array<{ key: string; date: string; kind: "invoice" | "transaction" | "loan" | "review" }> = payments
      .filter(item => Date.parse(item.date + "T12:00:00Z") >= origin - 7 * 86400000)
      .sort((a, b) =>
        Math.abs(Date.parse(a.date + "T12:00:00Z") - origin) -
        Math.abs(Date.parse(b.date + "T12:00:00Z") - origin))
      .slice(0, 295)
      .map(item => ({
        key: item.id.slice(0, 160),
        date: item.date,
        kind: item.kind,
      }));
    if (notifications.some(item => item.status === "pending")) {
      items.push({ key: "pending-review", date: today, kind: "review" as const });
    }
    return items;
  }, [cards, visibleTransactions, loanReceivables, notifications,
    includeBorrowedCardInvoices, today]);
  useEffect(() => {
    if (!activeProfile?.id || !reminderPreferences.browserEnabled) return;
    const serialized = JSON.stringify([activeProfile.id, schedule]);
    if (serialized === lastSent.current) return;
    const timer = window.setTimeout(() => {
      void sync({ profileId: activeProfile.id, items: schedule })
        .then(() => { lastSent.current = serialized; })
        .catch(() => { /* Retry on the next app change; local finance data stays untouched. */ });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [activeProfile?.id, reminderPreferences.browserEnabled, schedule, sync]);
  return null;
}
