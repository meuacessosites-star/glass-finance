import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { useState } from "react";
import {
  getLoanValueDisplay,
  type LoanValueMode,
} from "@/lib/loan-value-display";
import { AttachmentImageViewer } from "./AttachmentImageViewer";
import { LoanInstallmentHistory } from "./LoanInstallmentHistory";
import { getLoanHistoryGroup } from "@/lib/loan-history";
import {
  MessageCircle,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AppCard, LoanReceivable } from "@/lib/app-store";
import { downloadAttachment } from "@/lib/attachment-utils";
import { needsCardLoanInvoice } from "@/lib/card-loans";
import {
  getLoanOutstandingAmount,
  getLoanReceivedAmount,
  getLoanRepaymentStatus,
  isFreeLoan,
} from "@/lib/loan-repayments";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PAYMENT_METHOD_LABELS } from "./PaymentMethodSelector";

const dateLabel = (date?: string) =>
  date ? date.split("-").reverse().join("/") : "Não informada";
function statusLabel(item: LoanReceivable, today: string) {
  if (item.status === "paid") return "Recebido";
  if (needsCardLoanInvoice(item)) return "Definir cartão e fatura";
  const status = getLoanRepaymentStatus(item, today);
  return status === "overdue"
    ? "Vencido"
    : status === "open"
      ? "Em aberto"
      : "Pendente";
}

/** Details use all saved installments, independently of the current filter. */
export function LoanDetailsDialog({
  item,
  valueMode = "uniform",
  installments,
  card,
  purchaseDate,
  today,
  onClose,
  onEdit,
  onReopen,
  onReminder,
  showActions = true,
}: {
  item: LoanReceivable;
  valueMode?: LoanValueMode;
  installments: LoanReceivable[];
  card?: AppCard;
  purchaseDate?: string;
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onReopen: () => void;
  onReminder?: () => void;
  showActions?: boolean;
}) {
  const formatCurrency = usePrivateCurrency();
  const [expandedAttachment, setExpandedAttachment] = useState<number | null>(
    null,
  );
  const free = isFreeLoan(item);
  const isCard = item.operationType === "card";
  const schedule = getLoanHistoryGroup(item, installments);
  const sum = (valueFor: (row: LoanReceivable) => number) =>
    schedule.reduce(
      (total, row) => total + Math.round(valueFor(row) * 100),
      0,
    ) / 100;
  const valueDisplay = getLoanValueDisplay(item, valueMode);
  const status = getLoanRepaymentStatus(item, today);
  const download = async (src: string, index: number) => {
    try {
      await downloadAttachment(src, `anexo-emprestimo-${index + 1}`);
    } catch {
      toast.error("Não foi possível baixar este anexo");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="glass-strong flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-3xl bg-white p-0 text-glass-ink dark:bg-[#f4f8ff]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!document.querySelector("[data-loan-edit-dialog]"))
            document.getElementById(`loan-details-${item.id}`)?.focus();
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-black/5 px-5 py-4">
          <DialogHeader className="min-w-0 text-left">
            <DialogTitle>Detalhes</DialogTitle>
            <DialogDescription>
              {isCard ? "Cartão emprestado" : "Empréstimo"} · {item.contact}
            </DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 items-center gap-1">
            {showActions && (
              <button
                type="button"
                onClick={onEdit}
                className="flex min-h-10 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary"
              >
                <Pencil className="size-3.5" />
                Editar
              </button>
            )}
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Fechar detalhes"
                className="glass flex size-10 items-center justify-center rounded-full text-glass-sub"
              >
                <X className="size-[18px]" />
              </button>
            </DialogClose>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {showActions && onReminder && getLoanOutstandingAmount(item) > 0 && (
            <button
              type="button"
              onClick={onReminder}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600/10 px-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300"
            >
              <MessageCircle className="size-4" />
              Preparar lembrete de pagamento
            </button>
          )}
          <div>
            <h3 className="break-words text-[17px] font-bold">
              {item.contact}
            </h3>
            {item.description && (
              <p className="mt-1 break-words text-[13px] text-glass-sub">
                {item.description}
              </p>
            )}
            <p className="mt-3 text-[11px] font-medium text-glass-sub">
              {free
                ? item.status === "paid"
                  ? "Valor recebido"
                  : "Falta receber"
                : `Parcela ${item.installment ?? 1} de ${item.installments ?? 1}`}
            </p>
            <p
              className={cn(
                "amount-tabular mt-1 text-[28px] font-bold",
                valueDisplay.className,
                valueDisplay.sign === "−"
                  ? "dark:text-[#d63036]"
                  : "dark:text-[#17a443]",
              )}
            >
              {valueDisplay.sign}
              {formatCurrency(valueDisplay.amount)}
            </p>
            <button
              type="button"
              disabled={!showActions || item.status !== "paid"}
              onClick={onReopen}
              aria-label={
                showActions && item.status === "paid"
                  ? "Reabrir registro recebido"
                  : statusLabel(item, today)
              }
              className={cn(
                "mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-bold",
                status === "paid"
                  ? "bg-[#148d48] text-white"
                  : status === "overdue"
                    ? "bg-[#be252c] text-white"
                    : free
                      ? "bg-[#dceeee] text-[#246b70]"
                      : "bg-[#ffa000] text-[#422c08]",
              )}
            >
              {statusLabel(item, today)}
            </button>
          </div>
          <section className="rounded-2xl bg-primary/5 p-3 text-[12px]">
            <h3 className="font-semibold">
              {schedule.length > 1
                ? isCard
                  ? "Resumo da compra completa"
                  : "Resumo do empréstimo completo"
                : "Resumo do registro"}
            </h3>
            <dl className="mt-3 space-y-2 text-glass-sub">
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Valor total {isCard ? "da compra" : "emprestado"}</dt>
                <dd className="amount-tabular font-semibold text-glass-ink">
                  {formatCurrency(sum((row) => row.amount))}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Já recebido</dt>
                <dd className="amount-tabular font-semibold text-[#148d48]">
                  {formatCurrency(sum(getLoanReceivedAmount))}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Falta receber</dt>
                <dd className="amount-tabular font-semibold text-glass-ink">
                  {formatCurrency(sum(getLoanOutstandingAmount))}
                </dd>
              </div>
            </dl>
          </section>
          <LoanInstallmentHistory
            item={item}
            items={installments}
            card={card}
            today={today}
          />
          <dl className="space-y-3 text-[12px] text-glass-sub">
            <div className="flex gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <dt className="font-semibold text-glass-ink">
                  {isCard ? "Data da compra" : "Data do empréstimo"}
                </dt>
                <dd className="mt-1">{dateLabel(purchaseDate)}</dd>
              </div>
            </div>
            <div>
              <dt className="font-semibold text-glass-ink">
                Forma de pagamento usada
              </dt>
              <dd className="mt-1">
                {isCard
                  ? "Cartão"
                  : (PAYMENT_METHOD_LABELS[item.paymentMethod ?? ""] ??
                    item.paymentMethod ??
                    "Não informada")}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-glass-ink">Devolução</dt>
              <dd className="mt-1">
                {free
                  ? item.freePaymentMode === "installments"
                    ? "Pagamento livre em parcelas, sem vencimento fixo"
                    : "Pagamento livre, sem valor de parcela ou vencimento fixos"
                  : isCard
                    ? "Parcelas com vencimento na fatura do cartão"
                    : "Fixo / Parcelado"}
              </dd>
            </div>
            {free &&
              item.freePaymentMode === "installments" &&
              item.suggestedPaymentAmount && (
                <div>
                  <dt className="font-semibold text-glass-ink">
                    Valor combinado por parcela
                  </dt>
                  <dd className="amount-tabular mt-1">
                    {formatCurrency(item.suggestedPaymentAmount)}
                  </dd>
                </div>
              )}
            {!free && item.dueDate && (
              <div>
                <dt className="font-semibold text-glass-ink">
                  Vencimento desta parcela
                </dt>
                <dd className="mt-1 whitespace-nowrap">
                  {dateLabel(item.dueDate)}
                </dd>
              </div>
            )}
            {item.status === "paid" && (
              <div>
                <dt className="font-semibold text-glass-ink">Recebido em</dt>
                <dd className="mt-1">{dateLabel(item.paymentDate)}</dd>
              </div>
            )}
          </dl>
          {isCard && (
            <section className="space-y-2 rounded-2xl bg-primary/5 p-3 text-[12px] text-glass-sub">
              <h3 className="flex items-center gap-2 font-semibold text-glass-ink">
                <CreditCard className="size-4" />
                Cartão e fatura
              </h3>
              {needsCardLoanInvoice(item) ? (
                <p>
                  O cartão e as datas desta compra ainda precisam ser definidos
                  no botão “Definir cartão e fatura”.
                </p>
              ) : (
                <>
                  <p className="break-words font-semibold text-glass-ink">
                    {card
                      ? `${card.name} · final ${card.last4}`
                      : "Cartão vinculado"}
                  </p>
                  <p>
                    Fechamento{" "}
                    <span className="whitespace-nowrap">
                      {dateLabel(item.cardClosingDate)}
                    </span>
                  </p>
                  <p>
                    Vencimento{" "}
                    <span className="whitespace-nowrap">
                      {dateLabel(item.dueDate)}
                    </span>
                  </p>
                </>
              )}
            </section>
          )}
          {!free && (
            <section>
              <h3 className="text-[13px] font-semibold">
                Recebimentos deste registro
              </h3>
              {item.receipts?.length ? (
                <ol className="mt-2 space-y-2">
                  {item.receipts.map((receipt) => (
                    <li
                      key={receipt.id}
                      className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#148d48]/5 px-3 py-2 text-[12px]"
                    >
                      <span>{dateLabel(receipt.date)}</span>
                      <strong className="amount-tabular text-[#148d48]">
                        {formatCurrency(receipt.amount)}
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-[12px] text-glass-sub">
                  {item.status === "paid"
                    ? `${formatCurrency(item.amount)} recebido${item.paymentDate ? ` em ${dateLabel(item.paymentDate)}` : ". Data não informada"}.`
                    : "Nenhum recebimento registrado ainda."}
                </p>
              )}
            </section>
          )}
          {item.note?.trim() && (
            <section className="rounded-2xl bg-primary/5 p-3">
              <h3 className="text-[12px] font-semibold text-[#9b655d]">
                Observação
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[#bd9288] pl-2 text-[13px]">
                {item.note}
              </p>
            </section>
          )}
          {Boolean(item.attachments?.length) && (
            <section>
              <h3 className="text-[13px] font-semibold">Anexos</h3>
              <div className="mt-2 space-y-3">
                {item.attachments?.map((src, index) => (
                  <figure
                    key={index}
                    className="overflow-hidden rounded-2xl border border-black/10 p-2"
                  >
                    {src.startsWith("data:image") && (
                      <button
                        type="button"
                        aria-label={`Ampliar anexo ${index + 1}`}
                        onClick={() => setExpandedAttachment(index)}
                        className="block w-full cursor-zoom-in rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <img
                          src={src}
                          alt={`Anexo ${index + 1}`}
                          className="max-h-72 w-full rounded-xl object-contain"
                        />
                      </button>
                    )}
                    <figcaption>
                      <button
                        type="button"
                        onClick={() => void download(src, index)}
                        className="flex min-h-10 w-full items-center justify-between gap-2 px-1 text-[12px] font-semibold text-primary"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="size-4" />
                          Anexo {index + 1}
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="size-3.5" />
                          Baixar
                        </span>
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
          {showActions && item.status === "paid" && (
            <button
              type="button"
              onClick={onReopen}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 text-[13px] font-semibold text-primary"
            >
              <RotateCcw className="size-4" />
              Reabrir registro
            </button>
          )}
          <DialogClose asChild>
            <button
              type="button"
              className="min-h-11 w-full rounded-xl bg-primary px-4 text-[13px] font-semibold text-white"
            >
              Fechar detalhes
            </button>
          </DialogClose>
        </div>
      </DialogContent>
      {expandedAttachment !== null && (
        <AttachmentImageViewer
          key={`${item.id}-${expandedAttachment}`}
          attachments={item.attachments ?? []}
          initialAttachmentIndex={expandedAttachment}
          onClose={() => setExpandedAttachment(null)}
        />
      )}
    </Dialog>
  );
}
