import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/app-store";
import { localDateKey } from "@/lib/card-billing";
import { getPaymentNotifications } from "@/lib/payment-notifications";
import {
  browserReminderKey,
  shouldSendBrowserReminder,
  showBrowserReminder,
} from "@/lib/browser-reminders";

const KEY_PREFIX = "glass-finance:reminder-seen:";
const ONE_DAY = 86_400_000;

/** Runs for the active profile only. No timer is registered when alerts are off.
 * Because this is foreground polling, no alert is promised while the app is closed.
 */
export function BrowserReminderRunner() {
  const {
    activeProfile, cards, visibleTransactions, loanReceivables,
    readPaymentNotificationIds, includeBorrowedCardInvoices, reminderPreferences,
  } = useAppStore();
  const [tick, setTick] = useState(0);
  const today = localDateKey(new Date());
  const reminders = useMemo(
    () => getPaymentNotifications({
      cards, transactions: visibleTransactions, loanReceivables,
      readPaymentNotificationIds, includeBorrowedCardInvoices,
    }, today, 7),
    [cards, visibleTransactions, loanReceivables, readPaymentNotificationIds,
      includeBorrowedCardInvoices, today, tick],
  );
  useEffect(() => {
    if (!reminderPreferences.browserEnabled || !activeProfile?.id) return;
    const update = () => setTick(value => value + 1);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const timer = window.setInterval(update, 15 * 60_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [activeProfile?.id, reminderPreferences.browserEnabled]);
  useEffect(() => {
    if (!reminderPreferences.browserEnabled || !activeProfile?.id ||
        typeof Notification === "undefined" || Notification.permission !== "granted" ||
        document.visibilityState !== "visible") return;
    let cancelled = false;
    const execute = async () => {
      const key = KEY_PREFIX + activeProfile.id;
      let values: Record<string, number> = {};
      try {
        const loaded: unknown = JSON.parse(localStorage.getItem(key) || "{}");
        if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
          values = loaded as Record<string, number>;
        }
      } catch { /* storage is optional */ }
      const now = Date.now();
      for (const [id, ms] of Object.entries(values)) {
        if (!Number.isFinite(ms) || now - ms > 10 * ONE_DAY) delete values[id];
      }
      const seen = new Set(Object.keys(values));
      const selection = reminders.filter(item => shouldSendBrowserReminder(item, today, seen)).slice(0, 3);
      if (!selection.length) return;
      const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
      for (const item of selection) {
        if (cancelled) return;
        if (await showBrowserReminder(item, registration ?? null)) {
          values[browserReminderKey(item, today)] = now;
          try { localStorage.setItem(key, JSON.stringify(values)); } catch { /* optional */ }
        }
      }
    };
    void execute().catch(() => { /* alerts must never crash financial dashboard */ });
    return () => { cancelled = true; };
  }, [activeProfile?.id, reminderPreferences.browserEnabled, reminders, today, tick]);
  return null;
}
