import type { AppNotification, ProfileData } from "./app-store";
import { notificationRecord } from "./notification-actions";
import { formatCurrency, shortDate } from "./mock-data";
import { normalizeSearchText } from "./transaction-view";

type SearchData = Pick<ProfileData,
  "notifications" | "transactions" | "loanReceivables" | "categories" | "cards"
>;

/** Search the original message and its current saved registration. */
export function searchApprovedNotifications(data: SearchData, query: string): AppNotification[] {
  const terms = normalizeSearchText(query.trim()).split(/\s+/).filter(Boolean);
  return data.notifications.filter((message) => {
    if (message.status !== "approved") return false;
    if (!terms.length) return true;
    const record = notificationRecord(data, message);
    const transaction = record?.kind === "transaction"
      ? data.transactions.find((item) => item.id === record.id)
      : undefined;
    const loan = record?.kind === "loan"
      ? data.loanReceivables.find((item) => item.id === record.id)
      : undefined;
    const categoryIds = [message.categoryId, transaction?.categoryId];
    const cardIds = [message.cardId, transaction?.cardId, loan?.cardId];
    const amounts = [message.amount, transaction?.amount, loan?.amount]
      .filter((amount): amount is number => typeof amount === "number")
      .flatMap((amount) => [formatCurrency(Math.abs(amount)), Math.abs(amount).toFixed(2)]);
    const dates = [message.date, transaction?.date, loan?.startDate, loan?.dueDate]
      .filter((date): date is string => Boolean(date))
      .flatMap((date) => [date, shortDate(date), `${shortDate(date)}/${date.slice(0, 4)}`]);
    const text = normalizeSearchText([
      message.merchant, message.bank, message.time,
      transaction?.title, transaction?.note,
      loan?.contact, loan?.description, loan?.note,
      ...data.categories.filter((item) => categoryIds.includes(item.id)).map((item) => item.label),
      ...data.cards.filter((item) => cardIds.includes(item.id)).flatMap((item) => [item.name, item.institution, item.last4]),
      ...amounts, ...dates,
    ].filter(Boolean).join(" "));
    return terms.every((term) => text.includes(term));
  });
}
