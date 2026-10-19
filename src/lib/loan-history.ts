import type { LoanReceivable } from "./app-store";
import { needsCardLoanInvoice } from "./card-loans";
import {
  getLoanOutstandingAmount,
  getLoanReceivedAmount,
  isFreeLoan,
} from "./loan-repayments";
import { sanitizeDueDate } from "./transaction-status";

export type LoanHistoryPart = {
  id: string;
  number: number;
  total: number;
  amount: number;
  receivedAmount: number;
  remainingAmount: number;
  dueDate?: string;
  paymentDate?: string;
  status: "paid" | "pending" | "overdue" | "scheduled" | "invoice-needed";
  isSelected: boolean;
};

/** Read only the saved records of this operation, across all visible periods. */
export function getLoanHistoryGroup(
  item: LoanReceivable,
  items: LoanReceivable[],
): LoanReceivable[] {
  const group = items.filter(
    (row) =>
      row.loanId === item.loanId &&
      (row.operationType ?? "loan") === (item.operationType ?? "loan"),
  );
  if (!group.some((row) => row.id === item.id)) group.push(item);
  return group.sort(
    (a, b) =>
      (a.installment ?? 1) - (b.installment ?? 1) ||
      (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt),
  );
}

/** A free loan never acquires dated installments just to draw its history. */
export function getLoanInstallmentHistory(
  item: LoanReceivable,
  items: LoanReceivable[],
  today: string,
): LoanHistoryPart[] {
  if (isFreeLoan(item)) return [];
  const group = getLoanHistoryGroup(item, items).filter(
    (row) => !isFreeLoan(row),
  );
  const firstUnpaid = group.findIndex((row) => row.status !== "paid");
  const total = Math.max(
    group.length,
    ...group.map((row) =>
      Math.max(row.installment ?? 1, row.installments ?? 1),
    ),
  );
  return group.map((part, index) => {
    const dueDate = sanitizeDueDate(part.dueDate);
    const status: LoanHistoryPart["status"] =
      part.status === "paid"
        ? "paid"
        : needsCardLoanInvoice(part)
          ? "invoice-needed"
          : dueDate && dueDate < today
            ? "overdue"
            : dueDate && dueDate > today && index > firstUnpaid
              ? "scheduled"
              : "pending";
    return {
      id: part.id,
      number: part.installment ?? index + 1,
      total,
      amount: part.amount,
      receivedAmount: getLoanReceivedAmount(part),
      remainingAmount: getLoanOutstandingAmount(part),
      dueDate,
      paymentDate: sanitizeDueDate(part.paymentDate),
      status,
      isSelected: part.id === item.id,
    };
  });
}
