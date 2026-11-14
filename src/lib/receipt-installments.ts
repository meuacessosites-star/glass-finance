/** Converts an installment count from a receipt into the form's supported
 * range. Does not infer installments from product quantities or item lists.
 */
export type ReceiptInstallmentPlan = {
  installments: number;
  currentInstallment: number;
};

function installmentInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\s*\d{1,2}\s*x?\s*$/i.test(value)) {
    return Number(value.trim().replace(/x$/i, ""));
  }
  return null;
}

export function receiptInstallmentPlan(
  installmentCount: unknown,
  current: unknown,
): ReceiptInstallmentPlan | null {
  const installments = installmentInteger(installmentCount);
  // The form currently supports 2 through 24 installments.
  if (installments === null || installments < 2 || installments > 24) return null;
  const mentionedCurrent = installmentInteger(current);
  return {
    installments,
    currentInstallment: mentionedCurrent !== null &&
      mentionedCurrent >= 1 && mentionedCurrent <= installments
      ? mentionedCurrent
      : 1,
  };
}
