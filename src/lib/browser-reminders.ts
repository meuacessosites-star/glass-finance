import type { PaymentNotification } from "./payment-notifications";
import { localDateKey } from "./card-billing";

/** Decide reminders without relying on the device notification API. */
export function shouldSendBrowserReminder(
  item: PaymentNotification,
  today: string,
  notifiedKeys: Set<string>,
): boolean {
  if (item.phase !== "today" && item.phase !== "overdue" &&
      item.phase !== "upcoming" && item.phase !== "closing") return false;
  if (item.phase === "upcoming" && item.date > today) {
    // A daily summary may include events in the 7-day horizon, but not fire
    // a separate OS alert on every visit until their due/closing day.
    return false;
  }
  const key = browserReminderKey(item, today);
  return !notifiedKeys.has(key);
}
export function browserReminderKey(item: PaymentNotification, day = localDateKey()) {
  return JSON.stringify([day, item.id]);
}
export function browserReminderText(item: PaymentNotification) {
  // The system lock screen may be visible to others: avoid exposing amounts.
  const type = item.kind === "invoice" ? "Fatura" : item.kind === "loan" ? "Recebimento" : "Conta";
  return item.phase === "overdue"
    ? `${type} em atraso. Consulte os detalhes no Glass Finance.`
    : item.event === "closing"
      ? "O fechamento do cartão é hoje. Confira os detalhes no Glass Finance."
      : item.receiving
        ? "Há um recebimento previsto para hoje. Confira no Glass Finance."
        : `${type} com vencimento hoje. Confira no Glass Finance.`;
}

/** Browser-level reminders only while the site is open or resumed.
 * True background delivery requires a server push subscription and scheduler.
 */
export async function showBrowserReminder(
  item: PaymentNotification,
  registration: ServiceWorkerRegistration | null,
): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const title = "Lembrete do Glass Finance";
  const options: NotificationOptions = {
    body: browserReminderText(item),
    tag: `glass-finance-${item.id}`,
    icon: "/favicon.png",
    data: { url: "/dashboard/notificacoes" },
  };
  if (registration && "showNotification" in registration) {
    await registration.showNotification(title, options);
    return true;
  }
  try {
    const notification = new Notification(title, options);
    notification.onclick = () => { window.focus(); window.location.assign("/dashboard/notificacoes"); };
    return true;
  } catch {
    return false;
  }
}
