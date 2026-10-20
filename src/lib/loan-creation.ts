import type {
  LoanCreationInput,
  LoanReceivable,
  ProfileData,
} from "./app-store";
import { getCardLoanSchedule } from "./card-loans";
import { localDateKey } from "./card-billing";
import type { LoanOperationType } from "./mock-data";

/** Shared creation path: notification review uses the same loan and installment rules. */
export function createLoanRecordData(
  d: ProfileData,
  data: LoanCreationInput,
  uid: (prefix: string) => string,
): ProfileData {
  const loanId = uid("loan");
  const createdAt = localDateKey();
  const operationType: LoanOperationType =
    data.operationType === "card" ? "card" : "loan";
  const card =
    operationType === "card"
      ? d.cards.find((card) => card.id === data.cardId)
      : undefined;
  const cardSchedule =
    operationType === "card"
      ? getCardLoanSchedule(
          card,
          data.date,
          data.amount,
          data.installments ?? 1,
          data.cardInvoiceMonth,
        )
      : [];
  if (
    operationType === "card" &&
    (data.collectionMode !== "fixed" || !cardSchedule.length)
  )
    return d;
  const plannedReceivables =
    operationType === "card" ? cardSchedule : (data.receivables ?? []);
  const operationLabel =
    operationType === "card" ? "Cartão emprestado" : "Empréstimo";
  const collectionLabel =
    data.collectionMode === "fixed"
      ? `${plannedReceivables.length} parcela(s) agendada(s)`
      : "Dívida em aberto";
  const originalNote = [
    data.note?.trim() || undefined,
    data.description?.trim() || undefined,
    `Tipo: ${operationLabel}`,
    `Contato: ${data.contact}`,
    `Cobrança: ${collectionLabel}`,
    `Referência: ${loanId}`,
  ]
    .filter(Boolean)
    .join("\n");
  const original = {
    id: uid("t"),
    title:
      operationType === "card"
        ? `Cartão usado por ${data.contact}`
        : `Emprestei para ${data.contact}`,
    categoryId: data.categoryId,
    amount: -Math.abs(data.amount),
    date: data.date,
    note: originalNote,
    draftDisplay: data.draftDisplay ?? "hidden",
    attachments: data.attachments?.length
      ? data.attachments.map((attachment) => attachment.src)
      : undefined,
    paymentMethod: data.paymentMethod,
    source: "loan" as const,
    operationType,
    cardId: card?.id,
    cardMode: card ? ("credito" as const) : undefined,
    cardInvoiceMonth: cardSchedule[0]?.invoiceMonth,
  };

  if (data.collectionMode === "open") {
    const openDebt: LoanReceivable = {
      id: uid("receivable"),
      loanId,
      contact: data.contact,
      amount: Math.abs(data.amount),
      status: "open",
      collectionMode: "open",
      freePaymentMode:
        data.freePaymentMode === "installments" ? "installments" : "flexible",
      suggestedPaymentAmount:
        data.freePaymentMode === "installments" &&
        data.suggestedPaymentAmount &&
        Number.isFinite(data.suggestedPaymentAmount)
          ? Math.min(
              Math.abs(data.amount),
              Math.max(
                0.01,
                Math.round(data.suggestedPaymentAmount * 100) / 100,
              ),
            )
          : undefined,
      startDate: data.date,
      description: data.description?.trim() || undefined,
      paymentMethod: data.paymentMethod,
      note: data.note?.trim() || undefined,
      draftDisplay: data.draftDisplay ?? "hidden",
      attachments: data.attachments?.length
        ? data.attachments.map((attachment) => attachment.src)
        : undefined,
      operationType,
      createdAt,
    };
    return {
      ...d,
      transactions: [original, ...d.transactions],
      loanReceivables: [openDebt, ...d.loanReceivables],
    };
  }

  const scheduled = plannedReceivables.map((item, index) => {
    const transactionId = uid("t");
    const receivable: LoanReceivable = {
      id: uid("receivable"),
      loanId,
      contact: data.contact,
      amount: Math.abs(item.amount),
      dueDate: item.dueDate,
      cardId: card?.id,
      cardInvoiceMonth: cardSchedule[index]?.invoiceMonth,
      cardClosingDate: cardSchedule[index]?.closingDate,
      status: "scheduled",
      collectionMode: "fixed",
      startDate: data.date,
      installment: item.installment,
      installments: item.installments,
      transactionId,
      description: data.description?.trim() || undefined,
      paymentMethod: data.paymentMethod,
      note: data.note?.trim() || undefined,
      draftDisplay: data.draftDisplay ?? "hidden",
      attachments: data.attachments?.length
        ? data.attachments.map((attachment) => attachment.src)
        : undefined,
      operationType,
      createdAt,
    };
    return {
      receivable,
      transaction: {
        id: transactionId,
        title: `Devolução de ${data.contact} · ${item.installment}/${item.installments}`,
        categoryId: data.categoryId,
        amount: Math.abs(item.amount),
        date: item.dueDate,
        note: [
          data.note?.trim() || undefined,
          data.description?.trim() || undefined,
          `${operationLabel} para ${data.contact}`,
          `Parcela ${item.installment}/${item.installments}`,
          `Referência: ${loanId}`,
        ]
          .filter(Boolean)
          .join("\n"),
        draftDisplay: data.draftDisplay ?? "hidden",
        attachments: data.attachments?.length
          ? data.attachments.map((attachment) => attachment.src)
          : undefined,
        paymentMethod: data.paymentMethod,
        recurrence: "parcelada" as const,
        paymentStatus: "pending" as const,
        dueDate: item.dueDate,
        installments: item.installments,
        source: "loan" as const,
        operationType,
        currentInstallment: item.installment,
      },
    };
  });
  return {
    ...d,
    transactions: [
      original,
      ...scheduled.map((item) => item.transaction),
      ...d.transactions,
    ],
    loanReceivables: [
      ...scheduled.map((item) => item.receivable),
      ...d.loanReceivables,
    ],
  };
}
