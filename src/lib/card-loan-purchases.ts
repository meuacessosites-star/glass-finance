import type { LoanReceivable } from "./app-store";
import type { Transaction } from "./mock-data";
import { sanitizeInvoiceMonth } from "./card-billing";

/** These virtual purchases exist only in card calculations and statements. */
export function getBorrowedCardTransactions(rows: LoanReceivable[]): Transaction[] {
  return rows.filter((row) =>
    row.operationType === "card" &&
    !!row.cardId && !!sanitizeInvoiceMonth(row.cardInvoiceMonth) &&
    Number.isFinite(row.amount) && row.amount > 0
  ).map((row) => ({
    id: `borrowed-card-${row.id}`,
    title: row.contact ? `Cartão emprestado · ${row.contact}` : "Cartão emprestado",
    categoryId: "outros",
    amount: -Math.round(Math.abs(row.amount) * 100) / 100,
    date: row.startDate ?? row.dueDate ?? `${row.cardInvoiceMonth}-01`,
    dueDate: row.dueDate,
    cardInvoiceMonth: row.cardInvoiceMonth,
    cardId: row.cardId,
    cardMode: "credito",
    paymentMethod: "cartao",
    paymentStatus: "pending",
    note: row.description ?? "Compra vinculada a empréstimo de cartão",
  }));
}
