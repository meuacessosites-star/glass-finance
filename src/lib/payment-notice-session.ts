import type { AppStoreState } from "./app-store";

/** Read means hidden for this opening; only real payment completion stops future reminders. */
export function startPaymentNoticeSession(state: AppStoreState): AppStoreState {
  let changed = false;
  const profiles = state.profiles.map((profile) => {
    if (!profile.data.readPaymentNotificationIds?.length) return profile;
    changed = true;
    return {
      ...profile,
      data: { ...profile.data, readPaymentNotificationIds: [] },
    };
  });
  return changed ? { ...state, profiles } : state;
}
