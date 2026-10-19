import type { LoanReceivable, ProfileData } from "./app-store";
import {
  getLoanOutstandingAmount,
  getLoanReceivedAmount,
  isFreeLoan,
} from "./loan-repayments";
import { localDateKey } from "./card-billing";
import { sanitizeDueDate } from "./transaction-status";

const cents = (amount: number) => Math.round(amount * 100);
const receiptTotal = (item: LoanReceivable) =>
  (item.receipts ?? []).reduce(
    (sum, receipt) => sum + cents(receipt.amount),
    0,
  );
const hasReference = (note: string | undefined, id: string) =>
  note?.match(/(?:^|\n)Referência:\s*([^\r\n]+)/)?.[1].trim() === id;

function receiptsAfterReopening(item: LoanReceivable) {
  const receipts = item.receipts ?? [];
  // Completion is the last saved action, even if its receipt date was backdated.
  return receipts.length && receiptTotal(item) >= cents(item.amount)
    ? receipts.slice(0, -1)
    : receipts;
}

export function getLoanReopenAmount(item: LoanReceivable): number {
  if (item.status !== "paid") return 0;
  return (
    Math.max(
      0,
      cents(item.amount) -
        receiptsAfterReopening(item).reduce(
          (sum, receipt) => sum + cents(receipt.amount),
          0,
        ),
    ) / 100
  );
}

/** Undo only the selected completion, keeping earlier partial receipts and other installments. */
export function reopenLoanReceivable(
  data: ProfileData,
  id: string,
): ProfileData {
  const item = data.loanReceivables.find((row) => row.id === id);
  if (!item || getLoanReopenAmount(item) <= 0) return data;
  const free = isFreeLoan(item);
  const receipts = receiptsAfterReopening(item);
  const last =
    item.receipts?.length !== receipts.length
      ? item.receipts?.[item.receipts.length - 1]
      : undefined;
  const preserved = new Set(receipts.map((receipt) => receipt.transactionId));
  const paymentId = item.transactionId ?? `loan-receivable-${item.id}`;
  const undoneIds = new Set(
    [last?.transactionId, paymentId].filter((value): value is string =>
      Boolean(value && !preserved.has(value)),
    ),
  );
  const pendingId = item.transactionId ?? last?.transactionId ?? paymentId;
  const amount = getLoanReopenAmount(item);
  const belongsToLoan = (row: ProfileData["transactions"][number]) =>
    row.amount > 0 &&
    (row.source === "loan" ||
      row.operationType === "loan" ||
      row.operationType === "card" ||
      hasReference(row.note, item.loanId) ||
      row.id === item.transactionId ||
      row.id.startsWith("loan-receivable-"));
  const transactions = data.transactions.flatMap((row) => {
    if (!undoneIds.has(row.id) || !belongsToLoan(row)) return [row];
    if (free || row.id !== pendingId) return [];
    return [
      {
        ...row,
        amount,
        date: item.dueDate ?? row.date,
        dueDate: item.dueDate,
        paymentStatus: "pending" as const,
        paymentDate: undefined,
        source: "loan" as const,
      },
    ];
  });
  return {
    ...data,
    transactions,
    loanReceivables: data.loanReceivables.map((row) =>
      row.id === id
        ? {
            ...row,
            status: free ? "open" : "scheduled",
            paymentDate: undefined,
            receipts: item.receipts ? receipts : undefined,
            transactionId: free
              ? undefined
              : data.transactions.some(
                    (row) => row.id === pendingId && belongsToLoan(row),
                  )
                ? pendingId
                : undefined,
          }
        : row,
    ),
  };
}

export type LoanRecordEdit = {
  contact?: string;
  description?: string;
  note?: string;
  paymentMethod?: string;
  startDate?: string;
  draftDisplay?: LoanReceivable["draftDisplay"];
  attachments?: string[];
  amount?: number;
  dueDate?: string;
  freePaymentMode?: "installments" | "flexible";
  suggestedPaymentAmount?: number;
};

export function validateLoanRecordEdit(
  data: Pick<ProfileData, "loanReceivables">,
  id: string,
  patch: LoanRecordEdit,
  today = localDateKey(),
): string | undefined {
  const item = data.loanReceivables.find((row) => row.id === id);
  if (!item) return "Este registro não está mais disponível.";
  const free = isFreeLoan(item);
  const amount = patch.amount ?? item.amount;
  if (!Number.isFinite(amount) || cents(amount) <= 0)
    return "Informe um valor maior que zero.";
  if (item.status === "paid" && cents(amount) !== cents(item.amount))
    return "Reabra o registro antes de alterar o valor recebido.";
  if (cents(amount) < cents(getLoanReceivedAmount(item)))
    return "O valor não pode ser menor do que já foi recebido.";
  if (
    patch.contact !== undefined &&
    (!patch.contact.trim() || patch.contact.trim().length > 80)
  )
    return "Informe o nome da pessoa, com até 80 caracteres.";
  if (patch.description !== undefined && patch.description.length > 120)
    return "A descrição deve ter até 120 caracteres.";
  if (patch.note !== undefined && patch.note.length > 300)
    return "A observação deve ter até 300 caracteres.";
  if (
    patch.attachments &&
    (patch.attachments.length > 6 ||
      patch.attachments.some((src) => typeof src !== "string"))
  )
    return "Use no máximo 6 anexos.";
  if (
    patch.paymentMethod !== undefined &&
    (item.operationType === "card"
      ? patch.paymentMethod !== "cartao"
      : !["pix", "dinheiro"].includes(patch.paymentMethod))
  )
    return "Escolha uma forma de pagamento válida para este registro.";
  if (
    patch.dueDate !== undefined &&
    (free || item.operationType === "card" || !sanitizeDueDate(patch.dueDate))
  )
    return "O vencimento do cartão segue a fatura; empréstimos livres não têm vencimento fixo.";
  const start = patch.startDate ?? item.startDate;
  if (
    patch.startDate !== undefined &&
    (!sanitizeDueDate(patch.startDate) ||
      patch.startDate > today ||
      item.operationType === "card")
  )
    return "Informe uma data válida para o empréstimo. A data da compra no cartão segue o registro da fatura.";
  const group = data.loanReceivables.filter(
    (row) => row.loanId === item.loanId,
  );
  if (
    start &&
    (patch.startDate !== undefined || patch.dueDate !== undefined) &&
    group.some((row) => {
      const due = row.id === id ? (patch.dueDate ?? row.dueDate) : row.dueDate;
      return (
        (due && due < start) ||
        row.receipts?.some((receipt) => receipt.date < start) ||
        (row.paymentDate && row.paymentDate < start)
      );
    })
  )
    return "A data do empréstimo precisa ser anterior ou igual aos vencimentos e recebimentos.";
  if (
    (patch.freePaymentMode !== undefined ||
      patch.suggestedPaymentAmount !== undefined) &&
    !free
  )
    return "Pagamento livre está disponível apenas para empréstimos livres em dinheiro.";
  const mode = patch.freePaymentMode ?? item.freePaymentMode;
  const suggested = patch.suggestedPaymentAmount ?? item.suggestedPaymentAmount;
  if (
    free &&
    mode === "installments" &&
    (!suggested ||
      !Number.isFinite(suggested) ||
      cents(suggested) <= 0 ||
      cents(suggested) > cents(amount))
  )
    return "O valor combinado por parcela deve ser maior que zero e até o total emprestado.";
  return undefined;
}

/** Common fields apply to the loan; amount and due date apply only to the selected installment. */
export function updateLoanRecord(
  data: ProfileData,
  id: string,
  patch: LoanRecordEdit,
  today = localDateKey(),
): ProfileData {
  if (validateLoanRecordEdit(data, id, patch, today)) return data;
  const selected = data.loanReceivables.find((row) => row.id === id)!;
  const common: Partial<LoanReceivable> = {};
  if (patch.contact !== undefined) common.contact = patch.contact.trim();
  for (const key of ["description", "note"] as const)
    if (patch[key] !== undefined) common[key] = patch[key]!.trim() || undefined;
  for (const key of [
    "paymentMethod",
    "startDate",
    "draftDisplay",
    "attachments",
  ] as const)
    if (key in patch) Object.assign(common, { [key]: patch[key] });
  const loanReceivables = data.loanReceivables.map((row): LoanReceivable => {
    if (row.loanId !== selected.loanId) return row;
    let next = { ...row, ...common };
    if (row.id !== id) return next;
    if (patch.amount !== undefined) next.amount = cents(patch.amount) / 100;
    if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
    if (patch.freePaymentMode !== undefined)
      next.freePaymentMode = patch.freePaymentMode;
    if (patch.suggestedPaymentAmount !== undefined)
      next.suggestedPaymentAmount = cents(patch.suggestedPaymentAmount) / 100;
    if (isFreeLoan(next) && next.freePaymentMode !== "installments")
      next.suggestedPaymentAmount = undefined;
    if (
      next.status !== "paid" &&
      getLoanOutstandingAmount(next) === 0 &&
      next.receipts?.length
    )
      next = {
        ...next,
        status: "paid",
        paymentDate: next.receipts.reduce(
          (latest, receipt) => (receipt.date > latest ? receipt.date : latest),
          next.receipts[0].date,
        ),
      };
    return next;
  });
  const group = loanReceivables.filter((row) => row.loanId === selected.loanId);
  const current = group.find((row) => row.id === id)!;
  const total = group.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
  const pending = new Map(
    group
      .filter((row) => row.status !== "paid" && row.transactionId)
      .map((row) => [row.transactionId, row]),
  );
  const rewriteNote =
    patch.note !== undefined ||
    patch.description !== undefined ||
    patch.contact !== undefined;
  const operation =
    selected.operationType === "card" ? "Cartão emprestado" : "Empréstimo";
  const transactions = data.transactions.map((row) => {
    if (row.amount < 0 && hasReference(row.note, selected.loanId))
      return {
        ...row,
        amount: -total,
        title:
          patch.contact === undefined
            ? row.title
            : `${selected.operationType === "card" ? "Cartão usado por" : "Emprestei para"} ${current.contact}`,
        date: patch.startDate ?? row.date,
        paymentMethod: patch.paymentMethod ?? row.paymentMethod,
        attachments: patch.attachments ?? row.attachments,
        draftDisplay: patch.draftDisplay ?? row.draftDisplay,
        note: rewriteNote
          ? [
              current.note,
              current.description,
              `Tipo: ${operation}`,
              `Contato: ${current.contact}`,
              `Referência: ${selected.loanId}`,
            ]
              .filter(Boolean)
              .join("\n")
          : row.note,
      };
    const receivable = pending.get(row.id);
    if (!receivable || row.paymentStatus === "paid") return row;
    return {
      ...row,
      title:
        patch.contact === undefined
          ? row.title
          : `Devolução de ${receivable.contact} · ${receivable.installment ?? 1}/${receivable.installments ?? 1}`,
      amount:
        receivable.id === id
          ? getLoanOutstandingAmount(receivable)
          : row.amount,
      date: receivable.id === id ? (patch.dueDate ?? row.date) : row.date,
      dueDate: receivable.dueDate,
      paymentMethod: patch.paymentMethod ?? row.paymentMethod,
      attachments: patch.attachments ?? row.attachments,
      draftDisplay: patch.draftDisplay ?? row.draftDisplay,
      note: rewriteNote
        ? [
            receivable.note,
            receivable.description,
            `Referência: ${selected.loanId}`,
          ]
            .filter(Boolean)
            .join("\n")
        : row.note,
    };
  });
  const savedTransactions = transactions.filter(
    (row) =>
      !(
        current.status === "paid" &&
        selected.status !== "paid" &&
        row.id === selected.transactionId &&
        row.paymentStatus !== "paid"
      ),
  );
  return { ...data, loanReceivables, transactions: savedTransactions };
}
