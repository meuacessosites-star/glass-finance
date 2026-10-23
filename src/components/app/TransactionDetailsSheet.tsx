import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { AttachmentImageViewer } from "./AttachmentImageViewer";
import {
  getTransactionBillingCycle,
  isCreditCardExpense,
} from "@/lib/card-billing";
import { getCardInstallmentHistory } from "@/lib/card-installments";
import { CardInstallmentHistory } from "./CardInstallmentHistory";
import {
  getTransactionDueDate,
  getTransactionPaymentStatus,
} from "@/lib/transaction-status";
import { useLocalDate } from "@/hooks/use-local-date";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  FileText,
  ImageIcon,
  Layers,
  Pencil,
  Repeat,
  X,
} from "lucide-react";
import { downloadAttachment } from "@/lib/attachment-utils";
import { useAppStore } from "@/lib/app-store";
import {
  dayLabel,
  formatCurrency,
  recurrenceLabel,
  shortDate,
  type Transaction,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";
import { CategoryIcon } from "./CategoryIcon";
import {
  CARD_MODE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./PaymentMethodSelector";
import { Switch } from "@/components/ui/switch";

const fallback = { label: "Outros", color: "#8E8E93", icon: "outros" };
/**
 * Transaction details — opened by tapping a transaction card. Shows the
 * receipt photo(s) attached by Escanear Nota, the draft/observations, and
 * the scanned date and time. Photos open a full-screen lightbox.
 */
export function TransactionDetailsSheet({
  transaction,
  open,
  onClose,
  onEdit,
}: {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const formatCurrency = usePrivateCurrency();
  const { categoryById, cards, loanReceivables, updateTransaction } =
    useAppStore();
  const today = useLocalDate();
  const dueDate = getTransactionDueDate(transaction, cards, loanReceivables);
  const paymentStatus = getTransactionPaymentStatus(
    transaction,
    cards,
    loanReceivables,
    today,
  );
  useExclusiveOverlay({
    name: "transaction-details-sheet",
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [installmentsExpanded, setInstallmentsExpanded] = useState(true);
  // Close the expanded attachment whenever its owning details window closes.
  useEffect(() => {
    if (!open) setLightboxIndex(null);
  }, [open]);
  const paymentDateInputRef = useRef<HTMLInputElement | null>(null);
  const category = categoryById[transaction.categoryId] ?? fallback;
  const isIncome = transaction.amount > 0;
  const attachments = transaction.attachments ?? [];
  const rawMethod = transaction.paymentMethod ?? "";
  const methodId =
    rawMethod === "credito" || rawMethod === "debito" ? "cartao" : rawMethod;
  const mode =
    transaction.cardMode ??
    (rawMethod === "credito" || rawMethod === "debito"
      ? rawMethod
      : undefined) ??
    "";
  const paymentLabel = methodId
    ? (PAYMENT_METHOD_LABELS[methodId] ?? methodId)
    : null;
  const paymentCard = transaction.cardId
    ? cards.find((c) => c.id === transaction.cardId)
    : undefined;
  const billingCycle =
    paymentCard && isCreditCardExpense(transaction)
      ? getTransactionBillingCycle(transaction, paymentCard)
      : null;
  const cardDisplayMode = transaction.cardDisplayMode ?? "last4";
  const installmentAccent = paymentCard?.color ?? "#AF52DE";
  const cardInstallments = getCardInstallmentHistory(
    transaction,
    paymentCard,
    today,
  );

  const screen = document.getElementById("app-screen");
  if (!screen) return null;

  const dateLabel = `${dayLabel(transaction.date)} · ${shortDate(transaction.date)}${
    transaction.time ? ` às ${transaction.time}` : ""
  }`;
  const editablePaymentDate = transaction.paymentDate ?? transaction.date;
  const showPaymentDateOnCard = transaction.showPaymentDateOnCard !== false;
  const installmentCount =
    transaction.recurrence === "parcelada"
      ? (transaction.installments ?? 0)
      : 0;
  const currentInstallment = Math.min(
    installmentCount || 1,
    Math.max(1, transaction.currentInstallment ?? 1),
  );
  const paidThroughInstallment =
    transaction.paymentStatus === "paid"
      ? currentInstallment
      : Math.max(0, currentInstallment - 1);

  const openPaymentDatePicker = () => {
    const input = paymentDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  };

  const handlePaymentDateChange = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    updateTransaction(transaction.id, { paymentDate: value });
    toast.success("Data de pagamento atualizada");
  };

  const handlePaymentDateVisibilityChange = (checked: boolean) => {
    updateTransaction(transaction.id, { showPaymentDateOnCard: checked });
    toast.success(checked ? "Data exibida no card" : "Data ocultada no card");
  };

  const handleCardDisplayModeChange = (mode: "name" | "last4") => {
    updateTransaction(transaction.id, { cardDisplayMode: mode });
    toast.success(
      mode === "name" ? "Nome do cartão exibido" : "Número do cartão exibido",
    );
  };

  const openLightbox = (attachmentIndex: number) => {
    if (attachments[attachmentIndex]?.startsWith("data:image"))
      setLightboxIndex(attachmentIndex);
  };

  const handleAttachmentDownload = async (src: string, index: number) => {
    try {
      await downloadAttachment(src, `anexo-${index + 1}`);
    } catch {
      toast.error("Não foi possível baixar este anexo");
    }
  };

  return createPortal(
    <>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className="absolute inset-0 z-[65] flex items-center justify-center bg-[#0b1630]/45 px-8 backdrop-blur-[2px]"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="glass glass-strong flex max-h-[85%] w-full max-w-[320px] flex-col overflow-hidden rounded-[2rem] bg-white dark:bg-[#f4f8ff]"
          >
            <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
              <p className="text-[15px] font-bold tracking-tight text-glass-ink">
                Detalhes
              </p>
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
              {/* Main row */}
              <div className="mt-4 flex items-center gap-3">
                <CategoryIcon
                  categoryId={transaction.categoryId}
                  size="size-14"
                  iconSize="size-6"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold text-glass-ink">
                    {transaction.title}
                  </p>
                  <p
                    className="mt-0.5 text-[12.5px] font-semibold"
                    style={{ color: category.color }}
                  >
                    {category.label}
                  </p>
                </div>
              </div>

              <p
                className={cn(
                  "amount-tabular mt-4 text-[30px] font-bold leading-none tracking-tight",
                  isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
                )}
              >
                {isIncome ? "+" : "−"}
                {formatCurrency(transaction.amount)}
              </p>

              <CardInstallmentHistory
                installments={cardInstallments}
                accent={installmentAccent}
              />

              {/* Info rows */}
              <div className="mt-4 space-y-2.5">
                {dueDate && paymentStatus !== "paid" && (
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-3 text-[12px] font-semibold",
                      paymentStatus === "overdue"
                        ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
                        : "bg-primary/10 text-glass-ink",
                    )}
                  >
                    {paymentStatus === "overdue" ? "Vencida" : "Pendente"} ·
                    Vencimento {shortDate(dueDate)}
                  </div>
                )}
                {billingCycle && (
                  <div className="rounded-2xl bg-primary/10 px-3.5 py-3 text-[12px] text-glass-ink">
                    <p className="font-bold">Fatura de {paymentCard?.name}</p>
                    <p className="mt-1">
                      Fechamento {shortDate(billingCycle.closingDate)} ·
                      Vencimento {shortDate(billingCycle.dueDate)}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                  <CalendarDays className="size-4 shrink-0 text-[#5E5CE6]" />
                  <p className="text-[13px] font-medium text-glass-ink">
                    {dateLabel}
                  </p>
                </div>
                {transaction.paymentStatus === "paid" && (
                  <>
                    <div
                      className="flex items-center gap-3 rounded-2xl bg-[#1FBF4F]/10 px-3.5 py-2.5"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <Check className="size-4 shrink-0 text-[#168A39]" />
                      <button
                        type="button"
                        onClick={openPaymentDatePicker}
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-[13px] font-semibold text-[#168A39] transition-opacity hover:opacity-80 active:scale-[0.99]"
                      >
                        <span>Pago em {shortDate(editablePaymentDate)}</span>
                        <CalendarDays className="size-4 shrink-0" />
                      </button>
                      <input
                        ref={paymentDateInputRef}
                        type="date"
                        value={editablePaymentDate}
                        aria-label="Alterar data de pagamento"
                        onChange={(event) =>
                          handlePaymentDateChange(event.target.value)
                        }
                        className="sr-only"
                      />
                    </div>
                    <div
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <label
                        htmlFor={`show-payment-date-${transaction.id}`}
                        className="min-w-0 cursor-pointer text-[12px] font-semibold text-glass-ink"
                      >
                        <span className="block">Mostrar data no card</span>
                        <span className="mt-0.5 block text-[10.5px] font-medium text-glass-sub">
                          Exibe “Pago em DD/MM” na lista
                        </span>
                      </label>
                      <Switch
                        id={`show-payment-date-${transaction.id}`}
                        checked={showPaymentDateOnCard}
                        onCheckedChange={handlePaymentDateVisibilityChange}
                        aria-label="Mostrar data no card"
                      />
                    </div>
                  </>
                )}
                {attachments.length > 0 && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                    <ImageIcon className="size-4 shrink-0 text-[#FF9500]" />
                    <p className="text-[13px] font-medium text-glass-ink">
                      {attachments.length}{" "}
                      {attachments.length === 1
                        ? "nota anexada"
                        : "notas anexadas"}
                    </p>
                  </div>
                )}
                {transaction.time && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                    <Clock className="size-4 shrink-0 text-[#2F6BFF]" />
                    <p className="text-[13px] font-medium text-glass-ink">
                      Registrada às {transaction.time}
                    </p>
                  </div>
                )}
                {paymentLabel && (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                    <CreditCard
                      className="size-4 shrink-0"
                      style={{ color: paymentCard?.color ?? "#17A443" }}
                    />
                    <p className="min-w-0 text-[13px] font-medium text-glass-ink">
                      Pagamento · {paymentLabel}
                      {methodId === "cartao" && mode
                        ? ` · ${CARD_MODE_LABELS[mode as "credito" | "debito"] ?? mode}`
                        : ""}
                      {paymentCard && (
                        <>
                          {" · "}
                          <span
                            className="font-bold"
                            style={{ color: paymentCard.color ?? "#17A443" }}
                          >
                            {paymentCard.name} ····{paymentCard.last4}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                )}
                {paymentCard && (
                  <div className="rounded-2xl bg-white/40 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-glass-ink">
                          Exibir no card da transação
                        </p>
                        <p className="mt-0.5 truncate text-[10.5px] font-medium text-glass-sub">
                          {cardDisplayMode === "name"
                            ? paymentCard.name
                            : `•••• ${paymentCard.last4}`}
                        </p>
                      </div>
                      <CreditCard
                        className="size-4 shrink-0"
                        style={{ color: paymentCard.color ?? "#17A443" }}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {[
                        {
                          id: "last4" as const,
                          label: `•••• ${paymentCard.last4}`,
                        },
                        { id: "name" as const, label: "Nome do cartão" },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={cardDisplayMode === option.id}
                          onClick={() => handleCardDisplayModeChange(option.id)}
                          className={cn(
                            "min-h-10 rounded-xl px-2 text-[11px] font-bold transition-all active:scale-[0.98]",
                            cardDisplayMode === option.id
                              ? "bg-glass-ink text-white shadow-sm dark:bg-white dark:text-slate-900"
                              : "bg-white/60 text-glass-sub dark:bg-white/10",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {transaction.recurrence === "parcelada" &&
                installmentCount > 1 ? (
                  <div
                    className="rounded-2xl border px-3.5 py-2.5"
                    style={{
                      backgroundColor: `${installmentAccent}16`,
                      borderColor: `${installmentAccent}38`,
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={installmentsExpanded}
                      aria-controls={`installments-list-${transaction.id}`}
                      onClick={() =>
                        setInstallmentsExpanded((expanded) => !expanded)
                      }
                      className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Layers
                          className="size-4 shrink-0"
                          style={{ color: installmentAccent }}
                        />
                        <span className="text-[13px] font-semibold text-glass-ink">
                          Parcelado · {currentInstallment}/{installmentCount}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition-transform duration-200",
                          installmentsExpanded && "rotate-180",
                        )}
                        style={{ color: installmentAccent }}
                      />
                    </button>
                    {installmentsExpanded && (
                      <div
                        id={`installments-list-${transaction.id}`}
                        className="mt-1 max-h-48 space-y-1 overflow-y-auto pr-1"
                      >
                        {Array.from(
                          { length: installmentCount },
                          (_, index) => {
                            const installmentNumber = index + 1;
                            const historyItem = cardInstallments[index];
                            const isPaid = historyItem
                              ? historyItem.status === "paid"
                              : installmentNumber <= paidThroughInstallment;
                            const isCurrent =
                              installmentNumber === currentInstallment;
                            return (
                              <div
                                key={installmentNumber}
                                className={cn(
                                  "flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-[12px]",
                                  isPaid
                                    ? "bg-[#1FBF4F]/10 text-[#168A39]"
                                    : isCurrent
                                      ? "text-glass-ink"
                                      : "bg-white/50 text-glass-sub",
                                )}
                                style={
                                  isCurrent
                                    ? {
                                        backgroundColor: `${installmentAccent}1F`,
                                        color: installmentAccent,
                                      }
                                    : undefined
                                }
                              >
                                <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                                  {isPaid ? (
                                    <Check
                                      className="size-3.5 shrink-0"
                                      strokeWidth={3}
                                      style={{ color: "#168A39" }}
                                    />
                                  ) : (
                                    <span
                                      className="size-3.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>{installmentNumber}ª parcela</span>
                                </span>
                                <span
                                  className="shrink-0 text-[10.5px] font-semibold"
                                  style={{
                                    color: isPaid
                                      ? "#168A39"
                                      : historyItem?.status === "overdue"
                                        ? "#B4232A"
                                        : isCurrent
                                          ? installmentAccent
                                          : "#C77A00",
                                  }}
                                >
                                  {isPaid
                                    ? "Paga"
                                    : historyItem?.status === "overdue"
                                      ? "Vencida"
                                      : isCurrent
                                        ? "Atual"
                                        : historyItem?.status === "scheduled"
                                          ? "Agendada"
                                          : "Pendente"}
                                </span>
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  recurrenceLabel(transaction) && (
                    <div className="flex items-center gap-3 rounded-2xl bg-white/40 px-3.5 py-2.5">
                      <Repeat className="size-4 shrink-0 text-[#5E5CE6]" />
                      <p className="text-[13px] font-medium text-glass-ink">
                        {recurrenceLabel(transaction)}
                      </p>
                    </div>
                  )
                )}
              </div>

              {/* Draft / notes */}
              {transaction.note && (
                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-white/10 dark:bg-[#1c2542]/35">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[#6B5CC5] dark:text-[#B9AEFF]">
                    <FileText className="size-3.5" /> Rascunho
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] italic leading-relaxed text-slate-700 dark:text-slate-200">
                    {transaction.note}
                  </p>
                </div>
              )}

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                    Anexos
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {attachments.map((src, i) =>
                      src.startsWith("data:image") ? (
                        <button
                          key={i}
                          type="button"
                          aria-label={`Ver anexo ${i + 1}`}
                          onClick={() => openLightbox(i)}
                          className="group relative aspect-square overflow-hidden rounded-2xl transition-transform active:scale-95"
                        >
                          <img
                            src={src}
                            alt={`Anexo ${i + 1}`}
                            className="size-full object-cover"
                          />
                        </button>
                      ) : (
                        <button
                          key={i}
                          type="button"
                          onClick={() => void handleAttachmentDownload(src, i)}
                          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/40 px-2 text-center transition-transform active:scale-95"
                        >
                          <FileText className="size-5 shrink-0 text-[#2F6BFF]" />
                          <span className="truncate text-[10.5px] font-semibold leading-tight text-glass-sub">
                            Arquivo
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}

              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(47,107,255,0.75)] transition-all hover:brightness-105 active:scale-[0.99]"
                >
                  <Pencil className="size-4" />
                  Editar
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {open && lightboxIndex !== null && (
        <AttachmentImageViewer
          key={`${transaction.id}-${lightboxIndex}`}
          attachments={attachments}
          initialAttachmentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>,
    screen,
  );
}
