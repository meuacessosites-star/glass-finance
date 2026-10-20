import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  CreditCard,
  FileText,
  HandCoins,
  ImagePlus,
  Infinity as InfinityIcon,
  Landmark,
  Paperclip,
  Repeat2,
  Wallet,
  X,
  Banknote,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { sanitizeDueDate } from "@/lib/transaction-status";
import { localDateKey } from "@/lib/card-billing";
import { getCardLoanSchedule } from "@/lib/card-loans";
import { CardLoanBillingFields } from "./CardLoanBillingFields";
import { scheduledLoanDueDates } from "@/lib/loan-repayments";
import { useAppStore, type LoanCreationInput } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";
import { compressAttachmentFile } from "@/lib/attachment-utils";
import type { DraftDisplayMode } from "@/lib/mock-data";
import type { PaymentMethodId } from "./PaymentMethodSelector";
import { PersonSelector } from "./PersonSelector";
import { HorizontalScroll } from "./HorizontalScroll";

type CollectionMode = "fixed" | "open";
type OperationType = "loan" | "card";

type PickedAttachment = {
  src: string;
  isImage: boolean;
  name: string;
};

const PAYMENT_OPTIONS: {
  id: Extract<PaymentMethodId, "pix" | "dinheiro" | "cartao">;
  label: string;
  Icon: typeof Landmark;
}[] = [
  { id: "pix", label: "Pix", Icon: Landmark },
  { id: "dinheiro", label: "Dinheiro", Icon: Wallet },
  { id: "cartao", label: "Cartão", Icon: CreditCard },
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-3.5 py-3 text-[14px] font-semibold text-glass-ink outline-none placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Registra valores disponibilizados a terceiros e acompanha a devolução.
 * A saída acontece imediatamente; as devoluções ficam como contas a receber
 * agendadas ou como uma dívida em aberto vinculada ao contato.
 */
export function LoanTransactionSheet({
  open,
  onClose,
  initial,
  onCommit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { amount: number; date: string; description?: string; note?: string; cardId?: string; operationType?: OperationType };
  onCommit?: (data: LoanCreationInput) => void;
  onSaved?: () => void;
}) {
  const { createLoanRecord, categories, cards } = useAppStore();
  const overlay = useExclusiveOverlay({
    name: "loan-transaction-sheet",
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
  });
  const people = useQuery(api.people.list) as
    | Array<{ _id: string; name: string }>
    | undefined;
  const [cents, setCents] = useState(Math.round((initial?.amount ?? 0) * 100));
  const [operationType, setOperationType] = useState<OperationType>(initial?.operationType ?? "loan");
  const savedRef = useRef(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [draftDisplay, setDraftDisplay] = useState<DraftDisplayMode>("hidden");
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>(initial?.operationType === "card" ? "cartao" : "pix");
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("fixed");
  const [freePaymentMode, setFreePaymentMode] = useState<
    "installments" | "flexible"
  >("flexible");
  const [freeInstallmentCents, setFreeInstallmentCents] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [dueDay, setDueDay] = useState(() => new Date().getDate());
  const [date, setDate] = useState(initial?.date ?? localDateKey());
  const [cardId, setCardId] = useState(initial?.cardId ?? "");
  const [invoiceMonth, setInvoiceMonth] = useState<string | undefined>();
  const effectiveCollectionMode =
    operationType === "card" ? "fixed" : collectionMode;
  const cardSchedule = getCardLoanSchedule(
    cards.find((card) => card.id === cardId),
    date,
    cents / 100,
    installments,
    invoiceMonth,
  );

  const amountLabel = useMemo(() => formatAmount(cents), [cents]);
  const contact = people?.find((person) => person._id === personId)?.name ?? "";
  const categoryId =
    categories.find((category) => category.id === "transferencias")?.id ??
    categories.find((category) => category.id === "outros")?.id ??
    categories[0]?.id ??
    "outros";
  const dueDates = useMemo(
    () =>
      operationType === "card"
        ? cardSchedule.map((part) => part.dueDate)
        : effectiveCollectionMode === "fixed"
          ? scheduledLoanDueDates(date, dueDay, installments)
          : [],
    [
      operationType,
      effectiveCollectionMode,
      cardSchedule,
      date,
      dueDay,
      installments,
    ],
  );
  const canSave =
    cents > 0 &&
    Boolean(sanitizeDueDate(date)) &&
    date <= localDateKey() &&
    Boolean(personId) &&
    contact.trim().length > 0 &&
    (effectiveCollectionMode === "open"
      ? freePaymentMode === "flexible" ||
        (freeInstallmentCents > 0 && freeInstallmentCents <= cents)
      : dueDates.length === installments && cents >= installments);
  const installmentCents =
    installments > 0 ? Math.floor(cents / installments) : 0;
  const remainderCents = installments > 0 ? cents % installments : 0;
  const operationLabel =
    operationType === "card" ? "Cartão emprestado" : "Empréstimo";
  const operationDescription =
    operationType === "card"
      ? "Registre uma compra feita no seu cartão para alguém"
      : "Registre um valor e acompanhe a devolução";
  const paymentOptions =
    operationType === "card"
      ? PAYMENT_OPTIONS.filter((option) => option.id === "cartao")
      : PAYMENT_OPTIONS.filter((option) => option.id !== "cartao");

  const reset = () => {
    savedRef.current = false;
    setCents(0);
    setOperationType("loan");
    setPersonId(null);
    setDescription("");
    setNote("");
    setDraftDisplay("hidden");
    setAttachments([]);
    setPaymentMethod("pix");
    setCardId("");
    setInvoiceMonth(undefined);
    setCollectionMode("fixed");
    setFreePaymentMode("flexible");
    setFreeInstallmentCents(0);
    setInstallments(1);
    setDueDay(new Date().getDate());
    setDate(localDateKey());
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAmount = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setCents(digits ? Number(digits) : 0);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = Math.max(0, 6 - attachments.length);
    const selected = Array.from(files).slice(0, remaining);
    if (!selected.length) {
      toast.error("Limite de 6 anexos atingido");
      return;
    }

    try {
      const picked = await Promise.all(
        selected.map(async (file) => ({
          src: await compressAttachmentFile(file),
          isImage: file.type.startsWith("image/"),
          name: file.name,
        })),
      );
      setAttachments((current) => [...current, ...picked].slice(0, 6));
    } catch {
      toast.error("Não foi possível adicionar o anexo");
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const handleSave = () => {
    if (!canSave || savedRef.current) return;
    savedRef.current = true;

    const normalizedContact = contact.trim();
    const normalizedDescription = description.trim() || undefined;
    const normalizedNote = note.trim() || undefined;
    const receivables = dueDates.map((dueDate, index) => {
      const amountInCents = installmentCents + (index < remainderCents ? 1 : 0);
      return {
        amount: amountInCents / 100,
        dueDate,
        installment: index + 1,
        installments,
      };
    });

    (onCommit ?? createLoanRecord)({
      contact: normalizedContact,
      description: normalizedDescription,
      amount: cents / 100,
      date,
      categoryId,
      paymentMethod,
      operationType,
      note: normalizedNote,
      draftDisplay,
      attachments,
      collectionMode: effectiveCollectionMode,
      cardId: operationType === "card" ? cardId : undefined,
      cardInvoiceMonth: cardSchedule[0]?.invoiceMonth,
      installments,
      freePaymentMode:
        effectiveCollectionMode === "open" ? freePaymentMode : undefined,
      suggestedPaymentAmount:
        effectiveCollectionMode === "open" && freePaymentMode === "installments"
          ? freeInstallmentCents / 100
          : undefined,
      receivables:
        effectiveCollectionMode === "fixed" ? receivables : undefined,
    });

    toast(
      effectiveCollectionMode === "fixed"
        ? `${operationLabel} e cobranças agendados`
        : `${operationLabel} em aberto registrado`,
      {
        description:
          effectiveCollectionMode === "fixed"
            ? `${installments} conta${installments > 1 ? "s" : ""} a receber de ${normalizedContact}.`
            : `A devolução de ${normalizedContact} ficou registrada sem vencimento fixo.`,
      },
    );
    if (onSaved) { reset(); onSaved(); } else handleClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="loan-transaction"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className="glass glass-strong absolute inset-0 z-[55] flex flex-col bg-white dark:bg-[#f4f8ff]"
        >
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                {operationLabel}
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                {operationDescription}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={handleClose}
              className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
            >
              <X className="size-[18px]" />
            </button>
          </div>

          <div className="glass glass-strong mx-5 mt-3 grid grid-cols-2 rounded-2xl p-1">
            {[
              { id: "loan" as const, label: "Empréstimo", Icon: Banknote },
              {
                id: "card" as const,
                label: "Cartão emprestado",
                Icon: CreditCard,
              },
            ].map(({ id, label, Icon }) => {
              const selected = operationType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setOperationType(id);
                    if (id === "card") setCollectionMode("fixed");
                    setPaymentMethod(id === "card" ? "cartao" : "pix");
                  }}
                  className={cn(
                    "relative flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold transition-all",
                    selected
                      ? "bg-white text-primary shadow-sm"
                      : "text-glass-sub",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
            <div className="mt-3 text-center">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                {operationType === "card"
                  ? "Valor da compra"
                  : "Valor emprestado"}
              </p>
              <input
                inputMode="numeric"
                value={amountLabel}
                onChange={(event) => handleAmount(event.target.value)}
                placeholder="R$ 0,00"
                aria-label={
                  operationType === "card"
                    ? "Valor da compra"
                    : "Valor emprestado"
                }
                className="mt-1 w-full bg-transparent text-center text-[38px] font-bold tracking-tight text-[#FF3B30] outline-none"
              />
              <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-primary/30" />
            </div>

            <PersonSelector
              overlayParentId={overlay.overlayId}
              value={personId}
              onValueChange={setPersonId}
              onNavigateToPeople={onClose}
              required
              label="Nome do contato"
              placeholder="Selecionar pessoa"
            />
            <p className="mt-1.5 px-1 text-[11.5px] text-glass-faint">
              {operationType === "card"
                ? "A compra ficará vinculada ao cartão emprestado."
                : "Essencial para acompanhar quem precisa devolver o valor."}
            </p>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Descrição{" "}
                <span className="normal-case text-glass-faint">(opcional)</span>
              </p>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={
                  operationType === "card"
                    ? "Ex.: Compra no shopping para alguém"
                    : "Ex.: Dinheiro para uma compra"
                }
                maxLength={80}
                className={cn(inputClass, "mt-2")}
              />
            </div>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Anexos{" "}
                <span className="normal-case text-glass-faint">
                  (imagens, documentos ou outros arquivos)
                </span>
              </p>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                multiple
                onChange={(event) => handleFiles(event.target.files)}
                className="hidden"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="glass flex min-h-[52px] min-w-0 items-center gap-2 rounded-2xl px-3 text-left text-glass-sub transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  <ImagePlus
                    className="size-5 shrink-0 text-[#5E5CE6]"
                    strokeWidth={2.2}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-glass-ink">
                      Adicionar imagem
                    </span>
                    <span className="block truncate text-[10px] font-medium text-glass-faint">
                      Galeria ou câmera
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="glass flex min-h-[52px] min-w-0 items-center gap-2 rounded-2xl px-3 text-left text-glass-sub transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  <FileText
                    className="size-5 shrink-0 text-[#2F6BFF]"
                    strokeWidth={2.2}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-glass-ink">
                      Adicionar arquivo
                    </span>
                    <span className="block truncate text-[10px] font-medium text-glass-faint">
                      PDF, Word, ZIP e outros
                    </span>
                  </span>
                </button>
              </div>
              {attachments.length > 0 && (
                <>
                  <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">
                    {attachments.map((attachment, index) =>
                      attachment.isImage ? (
                        <div
                          key={`${attachment.name}-${index}`}
                          className="relative size-[68px] shrink-0 overflow-hidden rounded-2xl"
                        >
                          <img
                            src={attachment.src}
                            alt={attachment.name}
                            className="size-full object-cover"
                          />
                          <button
                            type="button"
                            aria-label={`Remover ${attachment.name}`}
                            onClick={() => removeAttachment(index)}
                            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-transform active:scale-90"
                          >
                            <X className="size-3" strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <div
                          key={`${attachment.name}-${index}`}
                          className="glass glass-soft flex h-[68px] w-[150px] shrink-0 flex-col justify-center rounded-2xl px-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#2F6BFF]/15 text-[#2F6BFF]">
                              <FileText className="size-4" strokeWidth={2.3} />
                            </span>
                            <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-glass-ink">
                              {attachment.name}
                            </p>
                            <button
                              type="button"
                              aria-label={`Remover ${attachment.name}`}
                              onClick={() => removeAttachment(index)}
                              className="shrink-0 text-glass-sub transition-colors hover:text-[#FF3B30]"
                            >
                              <X className="size-4" strokeWidth={2.6} />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </HorizontalScroll>
                  <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-glass-faint">
                    <Paperclip className="size-3" /> {attachments.length} de 6
                    anexos
                  </p>
                </>
              )}
            </div>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Rascunho{" "}
                <span className="normal-case text-glass-faint">(opcional)</span>
              </p>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  operationType === "card"
                    ? "Anotações sobre a compra…"
                    : "Anotações sobre o empréstimo…"
                }
                maxLength={300}
                rows={3}
                className={cn(
                  inputClass,
                  "mt-2 min-h-[84px] resize-none leading-relaxed",
                )}
              />
              <div className="mt-3">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                  Exibição no card
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { id: "hidden" as const, label: "Ocultar no card" },
                    { id: "multipleMedia" as const, label: "Mostrar no card" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={draftDisplay === option.id}
                      onClick={() => setDraftDisplay(option.id)}
                      className={cn(
                        "rounded-2xl px-3 py-2.5 text-left text-[11.5px] font-semibold transition-all active:scale-[0.98]",
                        draftDisplay === option.id
                          ? "bg-primary text-white shadow-[0_6px_16px_-8px_rgba(47,107,255,0.8)]"
                          : "glass glass-soft text-glass-sub",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {operationType === "card" ? (
              <div className="mt-6">
                <CardLoanBillingFields
                  cards={cards}
                  cardId={cardId}
                  purchaseDate={date}
                  invoiceMonth={invoiceMonth}
                  installments={installments}
                  onCardChange={(id) => {
                    setCardId(id);
                    setInvoiceMonth(undefined);
                  }}
                  onInvoiceChange={setInvoiceMonth}
                />
              </div>
            ) : (
              <>
                <div className="mt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Como o valor foi enviado?
                  </p>
                  <HorizontalScroll className="mt-2 w-full min-w-0 gap-2 px-1 py-1">
                    {paymentOptions.map(({ id, label, Icon }) => {
                      const selected = paymentMethod === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPaymentMethod(id)}
                          className={cn(
                            "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-all sm:px-3",
                            selected
                              ? "bg-primary/10 text-primary ring-2 ring-primary/40"
                              : "glass text-glass-sub",
                          )}
                        >
                          <Icon className="size-3.5" />
                          {label}
                        </button>
                      );
                    })}
                  </HorizontalScroll>
                </div>

                <div className="mt-6">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Como a pessoa vai devolver o valor?
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-black/5 p-1">
                    <button
                      type="button"
                      onClick={() => setCollectionMode("fixed")}
                      className={cn(
                        "flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1.5 py-2.5 text-[12px] font-semibold transition-all sm:gap-1.5 sm:px-2 sm:text-[12.5px]",
                        effectiveCollectionMode === "fixed"
                          ? "bg-white text-primary shadow-sm"
                          : "text-glass-sub",
                      )}
                    >
                      <Repeat2 className="size-4" />
                      Fixo/Parcelado
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollectionMode("open")}
                      className={cn(
                        "flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1.5 py-2.5 text-[12px] font-semibold transition-all sm:gap-1.5 sm:px-2 sm:text-[12.5px]",
                        effectiveCollectionMode === "open"
                          ? "bg-white text-primary shadow-sm"
                          : "text-glass-sub",
                      )}
                    >
                      <InfinityIcon className="size-4" />
                      Pagamento livre
                    </button>
                  </div>
                </div>
              </>
            )}

            {effectiveCollectionMode === "fixed" && (
              <div className="mt-5">
                <p className="mb-3 text-[12px] leading-relaxed text-glass-sub">
                  {operationType === "card"
                    ? "A compra terá vencimento definido pela fatura do cartão. Se for parcelada, cada parcela terá a data da sua fatura."
                    : "A pessoa devolve no dia escolhido de cada mês, até quitar todas as parcelas. Se uma parcela não for recebida, ela continuará pendente."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                      Parcelas
                    </p>
                    <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
                      <HandCoins className="size-4 shrink-0 text-glass-sub" />
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={48}
                        value={installments}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setInstallments(
                            Number.isFinite(next)
                              ? Math.min(48, Math.max(1, Math.round(next)))
                              : 1,
                          );
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-glass-ink outline-none"
                      />
                      <span className="text-[12px] font-semibold text-glass-sub">
                        x
                      </span>
                    </label>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                      {operationType === "card"
                        ? "Vencimento do cartão"
                        : "Dia do recebimento"}
                    </p>
                    <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
                      <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={31}
                        readOnly={operationType === "card"}
                        aria-label={
                          operationType === "card"
                            ? "Dia do vencimento do cartão"
                            : "Dia do recebimento"
                        }
                        value={
                          operationType === "card"
                            ? (cards.find((card) => card.id === cardId)
                                ?.dueDay ?? "")
                            : dueDay
                        }
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setDueDay(
                            Number.isFinite(next)
                              ? Math.min(31, Math.max(1, Math.round(next)))
                              : 1,
                          );
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-glass-ink outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {effectiveCollectionMode === "open" && (
              <div className="glass glass-soft mt-5 rounded-2xl px-4 py-3">
                <p className="text-[13px] font-semibold text-glass-ink">
                  Como serão os pagamentos livres?
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={freePaymentMode === "installments"}
                    onClick={() => {
                      setFreePaymentMode("installments");
                      if (!freeInstallmentCents && cents > 0)
                        setFreeInstallmentCents(Math.ceil(cents / 2));
                    }}
                    className={cn(
                      "min-h-11 rounded-xl px-2 text-[12px] font-semibold",
                      freePaymentMode === "installments"
                        ? "bg-primary text-white"
                        : "glass text-glass-sub",
                    )}
                  >
                    Em parcelas
                  </button>
                  <button
                    type="button"
                    aria-pressed={freePaymentMode === "flexible"}
                    onClick={() => setFreePaymentMode("flexible")}
                    className={cn(
                      "min-h-11 rounded-xl px-2 text-[12px] font-semibold",
                      freePaymentMode === "flexible"
                        ? "bg-primary text-white"
                        : "glass text-glass-sub",
                    )}
                  >
                    Indefinido
                  </button>
                </div>
                {freePaymentMode === "installments" ? (
                  <div className="mt-4">
                    <div className="grid grid-cols-[0.85fr_1.15fr] gap-3">
                      <label className="min-w-0 text-[11px] font-semibold text-glass-sub">
                        Parcelas previstas
                        <input
                          type="number"
                          inputMode="numeric"
                          aria-label="Parcelas livres previstas"
                          min={1}
                          max={Math.min(120, Math.max(1, cents))}
                          value={
                            freeInstallmentCents > 0 && cents > 0
                              ? Math.ceil(cents / freeInstallmentCents)
                              : 1
                          }
                          onChange={(event) => {
                            const count = Math.max(
                              1,
                              Math.min(
                                120,
                                cents || 1,
                                Math.round(Number(event.target.value)) || 1,
                              ),
                            );
                            setFreeInstallmentCents(
                              cents > 0 ? Math.ceil(cents / count) : 0,
                            );
                          }}
                          className={`${inputClass} mt-1.5`}
                        />
                      </label>
                      <label className="min-w-0 text-[11px] font-semibold text-glass-sub">
                        Valor por parcela
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label="Valor da parcela livre"
                          value={formatAmount(freeInstallmentCents)}
                          onChange={(event) =>
                            setFreeInstallmentCents(
                              Number(event.target.value.replace(/\D/g, "")) ||
                                0,
                            )
                          }
                          className={`${inputClass} mt-1.5`}
                        />
                      </label>
                    </div>
                    {freeInstallmentCents > cents && (
                      <p className="mt-2 text-[11px] text-[#b52a32]">
                        O valor da parcela deve ser até o total emprestado.
                      </p>
                    )}
                    <p className="mt-2 text-[12px] leading-relaxed text-glass-sub">
                      Esse é o valor combinado, sem data fixa. A última parcela
                      pode ser menor, e você poderá registrar um valor diferente
                      se receber só uma parte.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] leading-relaxed text-glass-sub">
                    Sem valor de parcela ou data definidos. Você informa quanto
                    recebeu a cada pagamento, ou marca que recebeu tudo.
                  </p>
                )}
                <p className="mt-3 text-[12px] leading-relaxed text-glass-sub">
                  Se passar um mês sem receber, só o restante continuará em
                  aberto. O saldo não aumenta e não haverá cobrança extra.
                </p>
              </div>
            )}

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                {operationType === "card" ? "Data da compra" : "Data da saída"}
              </p>
              <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                <input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setInvoiceMonth(undefined);
                  }}
                  max={localDateKey()}
                  className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                />
              </label>
            </div>
          </div>

          <div className="px-5 pb-7 pt-2">
            {effectiveCollectionMode === "fixed" &&
              cents > 0 &&
              dueDates.length > 0 && (
                <div className="glass glass-soft mb-3 rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                        {operationType === "card"
                          ? "Compra a receber"
                          : "Conta a receber"}
                      </p>
                      <p className="amount-tabular text-[17px] font-bold leading-tight text-[#17a443]">
                        {formatAmount(
                          installmentCents + (remainderCents > 0 ? 1 : 0),
                        )}
                      </p>
                    </div>
                    <p className="text-right text-[12px] font-semibold text-glass-sub">
                      {installments}× · dia{" "}
                      {operationType === "card"
                        ? cards.find((card) => card.id === cardId)?.dueDay
                        : dueDay}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-glass-faint">
                    {operationType === "card"
                      ? "Primeira parcela em"
                      : "Primeira devolução em"}{" "}
                    {formatDate(dueDates[0])}.
                  </p>
                </div>
              )}
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]",
                !canSave && "opacity-50",
              )}
            >
              <Check className="size-[18px]" strokeWidth={2.6} />
              Salvar registro
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
