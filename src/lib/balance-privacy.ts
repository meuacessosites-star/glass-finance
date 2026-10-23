import { formatCurrency } from './mock-data';
export const HIDDEN_AMOUNT = '••••';
export function formatPrivateAmount(value: number, hidden: boolean, withSign = false): string {
  return hidden ? HIDDEN_AMOUNT : formatCurrency(value, withSign);
}
export const balancePrivacyKey = (profileId: string, scope: "all" | "home-summary" = "all") => `granascan:balance-privacy:${profileId}${scope === "all" ? "" : `:${scope}`}`;
