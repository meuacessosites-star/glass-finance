import { needsCardLoanInvoice } from "./card-loans";
import type { LoanReceivable, LoanReceipt, ProfileData } from "./app-store";
import type { Transaction } from "./mock-data";
import { localDateKey } from "./card-billing";

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

/** Keep the chosen day in every month, using the last day in shorter months. */
export function scheduledLoanDueDates(
  baseDate: string,
  dueDay: number,
  installments: number,
): string[] {
  if (
    !validDate(baseDate) ||
    !Number.isInteger(dueDay) ||
    dueDay < 1 ||
    dueDay > 31 ||
    !Number.isInteger(installments) ||
    installments < 1 ||
    installments > 48
  )
    return [];
  const [year, month] = baseDate.split("-").map(Number);
  const dateInMonth = (offset: number) => {
    const start = new Date(Date.UTC(year, month - 1 + offset, 1));
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
  };
  const firstOffset = dateInMonth(0) < baseDate ? 1 : 0;
  return Array.from({ length: installments }, (_, index) =>
    dateInMonth(firstOffset + index),
  );
}

export function isFreeLoan(item: LoanReceivable): boolean {
  return (
    item.operationType !== "card" &&
    (item.collectionMode === "open" || (!item.collectionMode && !item.dueDate))
  );
}

export function sanitizeLoanReceipts(
  value: unknown,
): LoanReceipt[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const transactionIds = new Set<string>();
  const valid: LoanReceipt[] = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      !entry.id ||
      ids.has(entry.id) ||
      typeof entry.amount !== "number" ||
      !Number.isFinite(entry.amount) ||
      Math.round(entry.amount * 100) <= 0 ||
      typeof entry.date !== "string" ||
      !validDate(entry.date) ||
      typeof entry.transactionId !== "string" ||
      !entry.transactionId ||
      transactionIds.has(entry.transactionId)
    )
      continue;
    ids.add(entry.id);
    transactionIds.add(entry.transactionId);
    valid.push({
      id: entry.id,
      amount: Math.round(entry.amount * 100) / 100,
      date: entry.date,
      transactionId: entry.transactionId,
    });
  }
  return valid;
}

export function getLoanReceivedAmount(item: LoanReceivable): number {
  if (item.status === "paid") return item.amount;
  const cents = (item.receipts ?? []).reduce(
    (sum, receipt) => sum + Math.round(receipt.amount * 100),
    0,
  );
  return Math.min(Math.round(item.amount * 100), cents) / 100;
}

export function getLoanOutstandingAmount(item: LoanReceivable): number {
  return (
    Math.max(
      0,
      Math.round(item.amount * 100) -
        Math.round(getLoanReceivedAmount(item) * 100),
    ) / 100
  );
}

export function getSuggestedLoanReceiptAmount(item: LoanReceivable): number {
  const balance = getLoanOutstandingAmount(item);
  return item.freePaymentMode === "installments" &&
    item.suggestedPaymentAmount &&
    item.suggestedPaymentAmount > 0
    ? Math.min(balance, item.suggestedPaymentAmount)
    : balance;
}

/** A free loan keeps one principal. Only actual receipts reduce its balance. */
export function recordFreeLoanReceipt(
  data: ProfileData,
  id: string,
  amount: number,
  paidOn: string,
  receiptId: string,
): ProfileData {
  const item = data.loanReceivables.find((row) => row.id === id);
  if (
    !item ||
    !isFreeLoan(item) ||
    item.status === "paid" ||
    !validDate(paidOn) ||
    !receiptId ||
    item.receipts?.some((receipt) => receipt.id === receiptId) ||
    (item.startDate && paidOn < item.startDate) ||
    !Number.isFinite(amount)
  )
    return data;
  const cents = Math.round(amount * 100);
  const balanceCents = Math.round(getLoanOutstandingAmount(item) * 100);
  if (cents <= 0 || cents > balanceCents) return data;
  const transactionId = `loan-receivable-${item.id}-${receiptId}`;
  if (data.transactions.some((transaction) => transaction.id === transactionId))
    return data;
  const receipt: LoanReceipt = {
    id: receiptId,
    amount: cents / 100,
    date: paidOn,
    transactionId,
  };
  const receipts = [...(item.receipts ?? []), receipt];
  const completionDate = receipts.reduce(
    (latest, payment) => (payment.date > latest ? payment.date : latest),
    paidOn,
  );
  const complete = cents === balanceCents;
  const original = data.transactions.find(
    (transaction) =>
      transaction.amount < 0 &&
      transaction.source === "loan" &&
      transaction.note?.includes(`Referência: ${item.loanId}`),
  );
  const transaction: Transaction = {
    id: transactionId,
    title: `Devolução de ${item.contact}${complete ? " · conclusão" : " · recebimento parcial"}`,
    categoryId: original?.categoryId ?? "outros",
    amount: cents / 100,
    date: paidOn,
    paymentDate: paidOn,
    paymentStatus: "paid",
    paymentMethod: item.paymentMethod ?? original?.paymentMethod,
    source: "loan",
    operationType: item.operationType ?? "loan",
    note: [item.note, item.description, `Referência: ${item.loanId}`]
      .filter(Boolean)
      .join("\n"),
    attachments: item.attachments,
    draftDisplay: item.draftDisplay,
  };
  return {
    ...data,
    loanReceivables: data.loanReceivables.map((row) =>
      row.id === id
        ? {
            ...row,
            dueDate: undefined,
            status: complete ? "paid" : "open",
            collectionMode: "open",
            paymentDate: complete ? completionDate : undefined,
            receipts,
          }
        : row,
    ),
    transactions: [transaction, ...data.transactions],
  };
}

export function getLoanRepaymentStatus(
  item: LoanReceivable,
  today = localDateKey(),
): "paid" | "open" | "pending" | "overdue" {
  if (item.status === "paid") return "paid";
  if (needsCardLoanInvoice(item)) return "pending";
  if (isFreeLoan(item)) return "open";
  return item.dueDate && item.dueDate < today ? "overdue" : "pending";
}

/** Carry unpaid balances forward as a view; never change their dates or duplicate records. */
export function selectLoanReceivablesForMonth(
  items: LoanReceivable[],
  month: string,
): LoanReceivable[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return items.filter((item) => {
    const initialMonth = (
      isFreeLoan(item)
        ? (item.startDate ?? item.createdAt)
        : (item.dueDate ?? item.startDate ?? item.createdAt)
    ).slice(0, 7);
    if (item.status !== "paid") return initialMonth <= month;
    const paymentMonth = item.paymentDate?.slice(0, 7) ?? initialMonth;
    const firstMonth =
      paymentMonth < initialMonth ? paymentMonth : initialMonth;
    const lastMonth = paymentMonth > initialMonth ? paymentMonth : initialMonth;
    return firstMonth <= month && month <= lastMonth;
  });
}

/** Record an actual receipt once, keeping it exclusively in the loan statement. */
export function settleLoanReceivables(
  data: ProfileData,
  ids: string[],
  paidOn = localDateKey(),
): ProfileData {
  if (!validDate(paidOn)) return data;
  const selected = new Set(ids);
  const freeLoans = data.loanReceivables.filter(
    (item) =>
      selected.has(item.id) && isFreeLoan(item) && item.status !== "paid",
  );
  const settledFree = freeLoans.reduce(
    (next, item) =>
      recordFreeLoanReceipt(
        next,
        item.id,
        getLoanOutstandingAmount(item),
        paidOn,
        `full-${item.id}`,
      ),
    data,
  );
  if (settledFree !== data) data = settledFree;
  const receivables = data.loanReceivables.filter(
    (item) =>
      selected.has(item.id) &&
      item.status !== "paid" &&
      !isFreeLoan(item) &&
      !needsCardLoanInvoice(item),
  );
  if (!receivables.length) return data;
  const payments = new Map<string, Transaction>();
  const additions: Transaction[] = [];
  for (const item of receivables) {
    const original = data.transactions.find(
      (transaction) =>
        transaction.amount < 0 &&
        transaction.source === "loan" &&
        transaction.note?.includes(`Referência: ${item.loanId}`),
    );
    const transactionId = item.transactionId ?? `loan-receivable-${item.id}`;
    const existing = data.transactions.find(
      (transaction) => transaction.id === transactionId,
    );
    const payment: Transaction = {
      ...existing,
      id: transactionId,
      title: existing?.title ?? `Devolução de ${item.contact}`,
      categoryId: existing?.categoryId ?? original?.categoryId ?? "outros",
      amount: getLoanOutstandingAmount(item),
      date: paidOn,
      dueDate: item.dueDate,
      paymentDate: paidOn,
      paymentStatus: "paid",
      paymentMethod:
        item.paymentMethod ??
        existing?.paymentMethod ??
        original?.paymentMethod,
      source: "loan",
      operationType: item.operationType ?? "loan",
      note:
        existing?.note ??
        [item.note, item.description, `Referência: ${item.loanId}`]
          .filter(Boolean)
          .join("\n"),
      attachments: item.attachments ?? existing?.attachments,
      draftDisplay: item.draftDisplay ?? existing?.draftDisplay,
    };
    if (existing) payments.set(transactionId, payment);
    else additions.push(payment);
  }
  const receivableIds = new Set(receivables.map((item) => item.id));
  return {
    ...data,
    loanReceivables: data.loanReceivables.map((item) =>
      receivableIds.has(item.id)
        ? {
            ...item,
            status: "paid",
            paymentDate: (item.receipts ?? []).reduce(
              (latest, receipt) =>
                receipt.date > latest ? receipt.date : latest,
              paidOn,
            ),
            receipts: item.receipts?.length
              ? [
                  ...item.receipts,
                  {
                    id: `full-${item.id}`,
                    amount: getLoanOutstandingAmount(item),
                    date: paidOn,
                    transactionId:
                      item.transactionId ?? `loan-receivable-${item.id}`,
                  },
                ]
              : item.receipts,
            transactionId: item.transactionId ?? `loan-receivable-${item.id}`,
          }
        : item,
    ),
    transactions: [
      ...additions,
      ...data.transactions.map((item) => payments.get(item.id) ?? item),
    ],
  };
}
