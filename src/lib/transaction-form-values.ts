import type { TransactionFormValues } from "@/components/app/AddTransactionSheet";
import { normalizePaymentMethod } from "@/components/app/PaymentMethodSelector";
import type { Transaction } from "./mock-data";

export function transactionToFormValues(
  transaction: Transaction,
): TransactionFormValues {
  const payment = normalizePaymentMethod(transaction.paymentMethod);
  const cardMode =
    transaction.cardMode === "credito" || transaction.cardMode === "debito"
      ? transaction.cardMode
      : payment.cardMode;

  return {
    type: transaction.amount >= 0 ? "income" : "expense",
    cents: Math.round(Math.abs(transaction.amount) * 100),
    title: transaction.title,
    categoryId: transaction.categoryId,
    date: transaction.date,
    dueDate: transaction.dueDate,
    time: transaction.time ?? "",
    note: transaction.note ?? "",
    draftDisplay: transaction.draftDisplay ?? "hidden",
    attachments: (transaction.attachments ?? []).map((src, index) => ({
      src,
      isImage: src.startsWith("data:image"),
      name: src.startsWith("data:image")
        ? `Imagem ${index + 1}`
        : `Arquivo ${index + 1}`,
    })),
    recurrence: transaction.recurrence ?? "unica",
    frequency: transaction.frequency ?? "mensal",
    daysInterval: transaction.frequencyInterval ?? 15,
    installments: transaction.installments ?? 2,
    currentInstallment: transaction.currentInstallment ?? 1,
    paymentMethod: payment.method,
    cardMode,
    cardId: transaction.cardId ?? null,
    cardInvoiceMonth: transaction.cardInvoiceMonth,
    personId: transaction.personId ?? null,
    paymentStatus: transaction.paymentStatus ?? "paid",
    paymentDate: transaction.paymentDate ?? "",
    cardDisplayMode: transaction.cardDisplayMode ?? "last4",
  };
}
