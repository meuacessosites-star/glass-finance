import {
  createHomeAlertSession,
  hideHomeAlert,
  homePaymentAlertId,
  type HomeAlertSession,
} from "./home-alerts";
import type { PaymentNotification } from "./payment-notifications";

// Document memory survives route changes, but never a full app reopen/reload.
const visits = new Map<string, HomeAlertSession>();
export function resetHomeAlertSessions() {
  visits.clear();
}
export function resetProfileHomeAlerts(profileId: string) {
  visits.delete(profileId);
}
export function loadHomeAlertSession(profileId: string): HomeAlertSession {
  return visits.get(profileId) ?? createHomeAlertSession();
}
export function saveHomeAlertSession(
  profileId: string,
  session: HomeAlertSession,
) {
  visits.set(profileId, session);
}
export function hideHomePaymentAlerts(
  profileId: string,
  payments: PaymentNotification[],
) {
  saveHomeAlertSession(
    profileId,
    payments.reduce(
      (session, item) => hideHomeAlert(session, homePaymentAlertId(item)),
      loadHomeAlertSession(profileId),
    ),
  );
}
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) resetHomeAlertSessions();
  });
}
