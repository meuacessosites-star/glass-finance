import type { AppNotification, AppStoreState, ProfileData } from "./app-store";
import { localDateKey } from "./card-billing";

export const NOTIFICATION_RETENTION_OPTIONS = [
  1, 3, 7, 15, 30, 90, 180, 365, 0,
] as const;
export function sanitizeNotificationRetention(value: unknown): number {
  return typeof value === "number" &&
    NOTIFICATION_RETENTION_OPTIONS.some((days) => days === value)
    ? value
    : 7;
}
export function notificationExpiry(
  notification: AppNotification,
  days: number,
): number | undefined {
  const approved = notification.approvedAt
    ? Date.parse(notification.approvedAt)
    : NaN;
  return days > 0 && Number.isFinite(approved)
    ? approved + days * 86400000
    : undefined;
}
export function isNotificationExpired(
  notification: AppNotification,
  days: number,
  now = Date.now(),
): boolean {
  const expiry = notificationExpiry(notification, days);
  return expiry !== undefined && now >= expiry;
}
export function ignoredCountToday(
  data: Pick<
    ProfileData,
    "ignoredNotificationCount" | "ignoredNotificationDate"
  >,
  today = localDateKey(),
): number {
  return data.ignoredNotificationDate === today
    ? Math.max(0, Math.floor(data.ignoredNotificationCount ?? 0))
    : 0;
}

/** Prune only messages; financial records and read-payment markers are never removed. */
export function maintainNotificationHistory(
  data: ProfileData,
  now = new Date(),
): ProfileData {
  const today = localDateKey(now);
  const days = sanitizeNotificationRetention(data.notificationRetentionDays);
  const ignoredDate = data.ignoredNotificationDate ?? today;
  const count =
    ignoredDate === today
      ? Math.max(0, Math.floor(data.ignoredNotificationCount ?? 0))
      : 0;
  let changed =
    data.notificationRetentionDays !== days ||
    data.ignoredNotificationDate !== today ||
    data.ignoredNotificationCount !== count;
  const notifications = data.notifications.flatMap((item) => {
    const migrated =
      (item.status === "approved" || item.recordKind) &&
      (!item.approvedAt || !Number.isFinite(Date.parse(item.approvedAt)))
        ? { ...item, approvedAt: now.toISOString() }
        : item;
    if (isNotificationExpired(migrated, days, now.getTime())) {
      changed = true;
      return [];
    }
    if (migrated !== item) changed = true;
    return [migrated];
  });
  return changed
    ? {
        ...data,
        notifications,
        ignoredNotificationCount: count,
        ignoredNotificationDate: today,
        notificationRetentionDays: days,
      }
    : data;
}
export function maintainAllNotificationHistory(
  state: AppStoreState,
  now = new Date(),
): AppStoreState {
  let changed = false;
  const profiles = state.profiles.map((profile) => {
    const data = maintainNotificationHistory(profile.data, now);
    if (data === profile.data) return profile;
    changed = true;
    return { ...profile, data };
  });
  return changed ? { ...state, profiles } : state;
}
export function setNotificationRetention(
  data: ProfileData,
  days: number,
  now = new Date(),
): ProfileData {
  return maintainNotificationHistory(
    { ...data, notificationRetentionDays: sanitizeNotificationRetention(days) },
    now,
  );
}
