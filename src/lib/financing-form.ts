import type { AppFinancing } from './app-store';

const moneyFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const moneyFieldValue = (amount: number) => moneyFormatter.format(amount);

/** Same cents-based entry used by transactions. Empty stays empty while editing. */
export function maskMoneyField(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digits ? moneyFieldValue(Number(digits) / 100) : '';
}
export function parseMoneyField(value: string): number {
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(value)) return NaN;
  return Number(value.replace(/\./g, '').replace(',', '.'));
}
export function installmentCounts(total: string, paid: string) {
  if (!/^\d+$/.test(total) || !/^\d+$/.test(paid)) return null;
  const installments = Number(total), paidCount = Number(paid);
  if (!Number.isInteger(installments) || installments < 1 || installments > 480 || paidCount > installments) return null;
  return { installments, paidCount, pendingCount: installments - paidCount, currentInstallment: paidCount + 1 };
}

/** Discard reversed actual payments, so they cannot reappear on a later edit. */
export function reconcileFinancingHistory(f: AppFinancing, total: number, paid: number) {
  return {
    payments: f.payments?.filter(p => p.installment <= paid && p.installment <= total),
    forecasts: f.forecasts?.filter(p => p.installment <= total),
  };
}
