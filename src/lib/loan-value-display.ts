import type { LoanReceivable } from "./app-store";
import { getLoanOutstandingAmount } from "./loan-repayments";

export type LoanValueMode = "uniform" | "status";

export function sanitizeLoanValueMode(value: unknown): LoanValueMode {
  return value === "status" ? "status" : "uniform";
}

/** Presentation only: a minus sign never changes the saved receivable balance. */
export function getLoanValueDisplay(item: LoanReceivable, mode: LoanValueMode) {
  const unpaid = mode === "status" && item.status !== "paid";
  return {
    amount:
      item.status === "paid" ? item.amount : getLoanOutstandingAmount(item),
    sign: unpaid ? "−" : "+",
    className: unpaid
      ? "text-[#d63036] dark:text-[#ff9b96]"
      : "text-[#17a443] dark:text-[#7edb9d]",
  };
}
