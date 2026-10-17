import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock,
  FileText,
  ImagePlus,
  Layers,
  Minus,
  Paperclip,
  Plus,
  Repeat,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";
import { getCardBillingChoices, getTransactionBillingCycle, localDateKey, sanitizeInvoiceMonth } from "@/lib/card-billing";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";
import { compressAttachmentFile } from "@/lib/attachment-utils";
import type {
  DraftDisplayMode,
  RecurrenceFrequency,
  RecurrenceMode,
} from "@/lib/mock-data";
import { CategoryIcon } from "./CategoryIcon";
import {
  SearchHighlight,
  scrollToSearchResult,
} from "./SearchHighlight";
import { HorizontalScroll } from "./HorizontalScroll";
import { SquircleIcon } from "./ThemeToggle";
import {
  PaymentMethodSelector,
  type CardMode,
  type PaymentMethodId,
} from "./PaymentMethodSelector";
import { PersonSelector } from "./PersonSelector";

// ---------------------------------------------------------------------------
// AddTransactionSheet — full-screen iOS-style page opened by “Adicionar
// Manual” in the + menu. Saves the transaction into the ACTIVE profile's
// store, so it shows up in the Home summary, the history and the reports.
// ---------------------------------------------------------------------------

const INCOME_IDS = new Set(["salario", "freelance", "transferencias"]);

/** Categorias mais comuns mostradas como pílulas rápidas no formulário. */
const QUICK_EXPENSE_IDS = ["alimentacao", "transporte", "moradia"];
const QUICK_INCOME_IDS = ["salario", "freelance"];

/** Lowercase + remove acentos, para "Alimentação" bater com "alimentacao". */
function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type TxType = "expense" | "income";

/** An attachment picked in the form: a data URL plus display metadata. */
export type PickedAttachment = {
  src: string;
  isImage: boolean;
  name: string;
};

/** Snapshot dos estados do formulário manual — usado também para pré-preencher
 * a tela a partir de outra origem (ex.: resultado da IA no fluxo "Escanear
 * Nota"). */
export type TransactionFormValues = {
  type: TxType;
  cents: number;
  title: string;
  categoryId: string;
  date: string;
  dueDate?: string;
  time: string;
  note: string;
  draftDisplay?: DraftDisplayMode;
  attachments: PickedAttachment[];
  recurrence: RecurrenceMode;
  frequency: RecurrenceFrequency;
  daysInterval: number;
  installments: number;
  currentInstallment: number;
  paymentMethod: PaymentMethodId | "";
  cardMode: CardMode | "";
  cardId: string | null;
  cardInvoiceMonth?: string;
  personId?: string | null;
  paymentStatus?: "paid" | "pending";
  paymentDate?: string;
  cardDisplayMode?: "name" | "last4";
};

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

const RECURRENCE_OPTIONS: {
  id: RecurrenceMode;
  label: string;
  desc: string;
}[] = [
  { id: "unica", label: "Única", desc: "Acontece uma vez" },
  { id: "recorrente", label: "Recorrente", desc: "Se repete todo mês/semana/ano" },
  { id: "parcelada", label: "Parcelada", desc: "Dividida em N parcelas" },
];

const FREQUENCIES: { id: RecurrenceFrequency; label: string }[] = [
  { id: "mensal", label: "Mensal" },
  { id: "semanal", label: "Semanal" },
  { id: "anual", label: "Anual" },
  { id: "dias", label: "Dias" },
];

function Stepper({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
}) {
  return (
    <div className="glass glass-soft flex w-full min-w-0 items-center justify-between gap-0 rounded-2xl px-1.5 py-1.5">
      <button
        type="button"
        aria-label="Diminuir"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex size-11 items-center justify-center rounded-full bg-white/70 text-glass-ink transition-all active:scale-90 disabled:opacity-30"
      >
        <Minus className="size-4" strokeWidth={2.6} />
      </button>
      <p className="min-w-0 flex-1 whitespace-nowrap text-center text-[13px] font-bold text-glass-ink">
        {value} {suffix}
      </p>
      <button
        type="button"
        aria-label="Aumentar"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex size-11 items-center justify-center rounded-full bg-white/70 text-glass-ink transition-all active:scale-90 disabled:opacity-30"
      >
        <Plus className="size-4" strokeWidth={2.6} />
      </button>
    </div>
  );
}

export function AddTransactionSheet({
  open,
  onClose,
  onExitComplete,
  initial,
  editTransactionId,
  fullScreen = false,
  overlayParentId,
}: {
  open: boolean;
  onClose: () => void;
  /** Chamado quando a animação de saída do sheet termina (depois que o nó
   * realmente saiu do DOM). Permite que uma tela pai feche somente após o
   * formulário sair — evita o erro de "removeChild" causado por dois
   * AnimatePresence aninhados desmontando árvores ao mesmo tempo. */
  onExitComplete?: () => void;
  /** Pré-preenchimento opcional aplicado ao abrir (ex.: leitura da IA). */
  initial?: TransactionFormValues | null;
  /** ID da transação persistida quando o formulário está em modo de edição. */
  editTransactionId?: string | null;
  /** Faz o sheet ocupar o conteúdo inteiro da rota dedicada de edição. */
  fullScreen?: boolean;
  /** ID do overlay pai quando o formulário é aberto dentro de outro fluxo. */
  overlayParentId?: string;
}) {
  const navigate = useNavigate();
  const { categories, cards, addTransaction, updateTransaction, categoryById } = useAppStore();
  const overlay = useExclusiveOverlay({
    name: "add-transaction-sheet",
    open,
    parentId: overlayParentId,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
  });
  const [type, setType] = useState<TxType>("expense");
  const [cents, setCents] = useState(0);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => localDateKey());
  const [dueDate, setDueDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [draftDisplay, setDraftDisplay] = useState<DraftDisplayMode>("hidden");
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [recurrence, setRecurrence] = useState<RecurrenceMode>("unica");
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("mensal");
  const [daysInterval, setDaysInterval] = useState(15);
  const [installments, setInstallments] = useState(2);
  const [currentInstallment, setCurrentInstallment] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | "">("");
  const [cardMode, setCardMode] = useState<CardMode | "">("");
  const [cardId, setCardId] = useState<string | null>(null);
  const selectedCard = cardId ? cards.find((card) => card.id === cardId) : undefined;
  const isCreditExpense = type === "expense" && paymentMethod === "cartao" && cardMode === "credito";
  const savedInvoiceMonth = isCreditExpense && initial?.cardId === cardId
    ? sanitizeInvoiceMonth(initial.cardInvoiceMonth)
    : undefined;
  const billingCycle = isCreditExpense && selectedCard ? getTransactionBillingCycle({ date, cardInvoiceMonth: savedInvoiceMonth }, selectedCard) : null;
  const billingChoices = isCreditExpense && selectedCard ? getCardBillingChoices(selectedCard, date) : null;
  const [invoiceChoiceOpen, setInvoiceChoiceOpen] = useState(false);
  const [invoiceChoiceMonth, setInvoiceChoiceMonth] = useState<string>();
  const savedRef = useRef(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [paymentDate, setPaymentDate] = useState(() => localDateKey());
  const [cardDisplayMode, setCardDisplayMode] = useState<"name" | "last4">("last4");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seletor híbrido de categorias: pílulas rápidas + bottom sheet de busca.
  const [pickerOpen, setPickerOpen] = useState(false);
  useExclusiveOverlay({
    name: "category-picker",
    open: pickerOpen,
    parentId: overlay.overlayId,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) setPickerOpen(false);
    },
  });
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Fresh form every time the sheet opens.
  // The reset intentionally runs when the sheet opens to keep this form isolated.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    savedRef.current = false;
    setInvoiceChoiceOpen(false);
    setInvoiceChoiceMonth(undefined);
    setType("expense");
    setCents(0);
    setTitle("");
    setDate(localDateKey());
    setDueDate("");
    setTime("");
    setNote("");
    setDraftDisplay("hidden");
    setAttachments([]);
    setRecurrence("unica");
    setFrequency("mensal");
    setDaysInterval(15);
    setInstallments(2);
    setCurrentInstallment(1);
    setPaymentMethod("");
    setCardMode("");
    setCardId(null);
    setPersonId(null);
    setPaymentStatus("paid");
    setPaymentDate(localDateKey());
    setCardDisplayMode("last4");
    const fallback = categories.find((c) => !INCOME_IDS.has(c.id));
    setCategoryId(fallback?.id ?? categories[0]?.id ?? "outros");
    setPickerOpen(false);
    setQuery("");

    // Pré-preenchimento vindo de outra origem (ex.: leitura da IA no scanner).
    if (initial) {
      setType(initial.type ?? "expense");
      setCents(initial.cents ?? 0);
      setTitle(initial.title ?? "");
      setCategoryId(
        initial.categoryId &&
          categories.some((c) => c.id === initial.categoryId)
          ? initial.categoryId
          : fallback?.id ?? categories[0]?.id ?? "outros",
      );
      setDate(initial.date || localDateKey());
      setDueDate(initial.dueDate ?? "");
      setTime(initial.time ?? "");
      setNote(initial.note ?? "");
      setDraftDisplay(initial.draftDisplay ?? "hidden");
      setAttachments(initial.attachments ?? []);
      setRecurrence(initial.recurrence ?? "unica");
      setFrequency(initial.frequency ?? "mensal");
      setDaysInterval(initial.daysInterval ?? 15);
      setInstallments(initial.installments ?? 2);
      setCurrentInstallment(initial.currentInstallment ?? 1);
      setPaymentMethod(initial.paymentMethod ?? "");
      setCardMode(initial.cardMode ?? "");
      setCardId(initial.cardId ?? null);
      setPersonId(initial.personId ?? null);
      setPaymentStatus(initial.paymentStatus ?? "paid");
      setPaymentDate(
        initial.paymentStatus === "pending"
          ? ""
          : initial.paymentDate ?? initial.date ?? localDateKey(),
      );
      setCardDisplayMode(initial.cardDisplayMode ?? "last4");
    }
  }, [open, categories, initial]);

  // Foco automático na busca ao abrir o seletor (apenas desktop/pointer fino).
  useEffect(() => {
    if (!pickerOpen) return;
    setQuery("");
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? true;
    if (!finePointer) return;
    const t = setTimeout(() => searchRef.current?.focus(), 140);
    return () => clearTimeout(t);
  }, [pickerOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Esc fecha o seletor.
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setPickerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const switchType = (t: TxType) => {
    setType(t);
    if (t === "income" && !INCOME_IDS.has(categoryId)) {
      const income = categories.find((c) => INCOME_IDS.has(c.id));
      setCategoryId(income?.id ?? categories[0]?.id ?? "outros");
    } else if (t === "expense" && INCOME_IDS.has(categoryId)) {
      const expense = categories.find((c) => !INCOME_IDS.has(c.id));
      setCategoryId(expense?.id ?? categories[0]?.id ?? "outros");
    }
  };

  // Money input: keep only digits; the field always shows the formatted BRL
  // value (typing appends to the right, like a calculator).
  const handleAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    setCents(digits ? parseInt(digits, 10) : 0);
  };

  const amountLabel = (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const canSave = cents > 0 && title.trim().length > 0 && !!categoryId;

  const quickIds = type === "income" ? QUICK_INCOME_IDS : QUICK_EXPENSE_IDS;
  const quickCategories = categories.filter((c) => quickIds.includes(c.id));
  // Categoria escolhida no modal: se não estiver entre as rápidas padrão,
  // ela é injetada na PRIMEIRA posição para o usuário ver o botão ativo
  // da escolha atual (ex.: "Saúde").
  const pickedCategory = categoryId ? categoryById[categoryId] : undefined;
  const visibleCategories =
    pickedCategory && !quickIds.includes(pickedCategory.id)
      ? [pickedCategory, ...quickCategories]
      : quickCategories;
  const filteredCategories = categories.filter((c) =>
    normalizeText(c.label).includes(normalizeText(query)),
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = 6 - attachments.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (picked.length === 0) {
      toast("Limite de 6 anexos por transação");
      return;
    }
    for (const file of picked) {
      if (file.size > 12_000_000) {
        toast(`"${file.name}" é grande demais`, {
          description: "O limite de seleção é 12 MB por arquivo.",
        });
        continue;
      }
      try {
        const src = await compressAttachmentFile(file);
        if (src.length >= 3_000_000) {
          toast(`"${file.name}" continua grande demais`, {
            description: "Escolha um arquivo menor para manter o armazenamento otimizado.",
          });
          continue;
        }
        setAttachments((prev) => [
          ...prev,
          { src, isImage: file.type.startsWith("image/"), name: file.name },
        ]);
      } catch {
        toast(`Não foi possível ler "${file.name}"`);
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== index));

  const saveTransaction = (invoiceMonth?: string) => {
    if (!canSave || savedRef.current) return;
    if (billingChoices && ![billingChoices.current.month, billingChoices.next.month].includes(invoiceMonth ?? "")) return;
    savedRef.current = true;
    const payload = {
      title: title.trim(),
      categoryId,
      amount: type === "expense" ? -cents / 100 : cents / 100,
      date,
      dueDate: isCreditExpense ? undefined : dueDate || (paymentStatus === "pending" ? date : undefined),
      time: time || undefined,
      note: note.trim() || undefined,
      draftDisplay,
      attachments: attachments.length
        ? attachments.map((a) => a.src)
        : undefined,
      recurrence: recurrence === "unica" ? undefined : recurrence,
      frequency: recurrence === "recorrente" ? frequency : undefined,
      frequencyInterval:
        recurrence === "recorrente" && frequency === "dias"
          ? daysInterval
          : undefined,
      installments:
        recurrence === "parcelada"
          ? installments
          : undefined,
      currentInstallment:
        recurrence === "parcelada"
          ? currentInstallment
          : undefined,
      paymentMethod: paymentMethod || undefined,
      cardId: cardId ?? undefined,
      cardMode: paymentMethod === "cartao" ? cardMode || undefined : undefined,
      cardInvoiceMonth: isCreditExpense && selectedCard ? sanitizeInvoiceMonth(invoiceMonth) : undefined,
      personId: personId ?? undefined,
      paymentStatus,
      paymentDate: paymentStatus === "paid" ? paymentDate || date || undefined : undefined,
      cardDisplayMode: paymentMethod === "cartao" ? cardDisplayMode : undefined,
    };

    if (editTransactionId) {
      updateTransaction(editTransactionId, payload);
      toast("Transação atualizada", {
        description: "As alterações já aparecem no resumo e no histórico.",
      });
    } else {
      addTransaction(payload);
      toast(type === "expense" ? "Despesa adicionada" : "Receita adicionada", {
        description: "Já aparece no seu resumo e no histórico.",
      });
    }
    onClose();
  };

  const handleSave = () => {
    if (!canSave || savedRef.current) return;
    if (billingChoices) {
      setInvoiceChoiceMonth(
        savedInvoiceMonth && [billingChoices.current.month, billingChoices.next.month].includes(savedInvoiceMonth)
          ? savedInvoiceMonth : undefined,
      );
      setInvoiceChoiceOpen(true);
      return;
    }
    saveTransaction(savedInvoiceMonth);
  };

  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <motion.div
          key="add-tx"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className={cn(
            "glass glass-strong absolute inset-0 z-[55] flex flex-col bg-[#eef1fe] dark:bg-[#0a1122]",
            fullScreen && "z-[70]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                {editTransactionId ? "Editar transação" : "Adicionar manual"}
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                {editTransactionId ? "Atualize os dados deste lançamento" : "Registre um gasto ou ganho"}
              </p>
            </div>
            <button
              type="button"
              aria-label={editTransactionId ? "Cancelar edição" : "Fechar"}
              onClick={onClose}
              className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
            >
              <X className="size-[18px]" />
            </button>
          </div>

          {/* Form */}
          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
            {/* Type */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
                    type === t ? "bg-white shadow-sm" : "text-glass-sub",
                  )}
                >
                  {t === "expense" ? (
                    <ArrowDownLeft className="size-4 text-[#FF3B30]" />
                  ) : (
                    <ArrowUpRight className="size-4 text-[#17a443]" />
                  )}
                  <span
                    className={
                      type === t
                        ? t === "expense"
                          ? "text-[#FF3B30]"
                          : "text-[#17a443]"
                        : "text-glass-sub"
                    }
                  >
                    {t === "expense" ? "Despesa" : "Receita"}
                  </span>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="mt-6 text-center">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Valor
              </p>
              <input
                inputMode="numeric"
                value={amountLabel}
                onChange={(e) => handleAmount(e.target.value)}
                placeholder="R$ 0,00"
                aria-label="Valor"
                className={cn(
                  "mt-1 w-full bg-transparent text-center text-[38px] font-bold tracking-tight outline-none",
                  type === "expense" ? "text-[#FF3B30]" : "text-[#17a443]",
                )}
              />
              <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-primary/30" />
            </div>

            {/* Description */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Descrição
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "expense"
                    ? "Ex.: Padaria do Zé"
                    : "Ex.: Freelance · Landing page"
                }
                maxLength={40}
                className={cn(inputClass, "mt-2")}
              />
            </div>

            {/* Category */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Categoria
              </p>
              <HorizontalScroll className="mt-2 w-full min-w-0 gap-2 px-1 py-1">
                {visibleCategories.map((c) => {
                  const selected = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-11 min-w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl border px-1.5 py-2 text-[10px] font-semibold shadow-[0_6px_18px_-14px_rgba(15,23,42,0.65)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] sm:gap-2 sm:px-3.5 sm:text-[12px]",
                        selected
                          ? "text-glass-ink"
                          : "border-white/75 bg-white/60 text-glass-sub hover:bg-white/80 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
                      )}
                      style={
                        selected
                          ? {
                              borderColor: `${c.color}80`,
                              backgroundColor: `${c.color}18`,
                              boxShadow: `0 0 0 1.5px ${c.color}aa, 0 8px 20px -14px ${c.color}`,
                            }
                          : undefined
                      }
                    >
                      <CategoryIcon
                        categoryId={c.id}
                        size="size-3.5 sm:size-4"
                        iconSize="size-2.5 sm:size-2.5"
                      />
                      {c.label}
                    </button>
                  );
                })}
                {/* Outras — permanece na mesma faixa e fica acessível pelo deslize horizontal em telas estreitas. */}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex min-h-11 min-w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-2xl border border-dashed border-[#2F6BFF]/35 bg-[#2F6BFF]/[0.06] px-1.5 py-2 text-[10px] font-semibold text-[#2F6BFF] shadow-[0_6px_18px_-14px_rgba(47,107,255,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2F6BFF]/[0.1] active:translate-y-0 active:scale-[0.98] sm:gap-2 sm:px-3.5 sm:text-[12px]"
                >
                  <SquircleIcon
                    icon={Plus}
                    color="#2F6BFF"
                    size="size-3.5 sm:size-4"
                    iconSize="size-2.5 sm:size-2.5"
                  />
                  Outras
                </button>
              </HorizontalScroll>
            </div>

            <PersonSelector
              overlayParentId={overlay.overlayId}
              value={personId}
              onValueChange={setPersonId}
              onNavigateToPeople={onClose}
              label="Pessoa (opcional)"
            />

            {/* Repetition */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Repetição
              </p>
              <div className="mt-2 space-y-1.5">
                {RECURRENCE_OPTIONS.map((option) => {
                  const active = recurrence === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setRecurrence(option.id);
                        if (option.id === "parcelada") {
                          setCurrentInstallment(1);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-all active:scale-[0.99]",
                        active
                          ? "bg-primary/10 ring-2 ring-primary/40"
                          : "glass glass-soft hover:bg-white/60",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          active ? "bg-primary text-white" : "bg-black/5 text-glass-sub",
                        )}
                      >
                        {option.id === "recorrente" ? (
                          <Repeat className="size-[17px]" strokeWidth={2.3} />
                        ) : option.id === "parcelada" ? (
                          <Layers className="size-[17px]" strokeWidth={2.3} />
                        ) : (
                          <Check className="size-[17px]" strokeWidth={2.6} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-[14px] font-semibold",
                            active ? "text-primary" : "text-glass-ink",
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="block text-[12px] text-glass-sub">
                          {option.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Recorrente: frequency */}
              {recurrence === "recorrente" && (
                <>
                  <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-black/5 p-1">
                    {FREQUENCIES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFrequency(f.id)}
                        className={cn(
                          "rounded-xl py-2 text-[13px] font-semibold transition-all",
                          frequency === f.id
                            ? "bg-white shadow-sm text-glass-ink"
                            : "text-glass-sub",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {frequency === "dias" && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[12px] font-semibold text-glass-sub">
                        Repete a cada
                      </p>
                      <Stepper
                        value={daysInterval}
                        onChange={setDaysInterval}
                        min={2}
                        max={90}
                        suffix={
                          daysInterval === 1 ? "dia" : "dias"
                        }
                      />
                    </div>
                  )}
                </>
              )}

              {/* Parcelada: total + current installment */}
              {(recurrence === "parcelada") && (
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <div>
                    <p className="mb-1.5 text-[12px] font-semibold text-glass-sub">
                      Parcelas
                    </p>
                    <Stepper
                      value={installments}
                      onChange={(v) => {
                        setInstallments(v);
                        setCurrentInstallment((c) => Math.min(c, v));
                      }}
                      min={2}
                      max={24}
                      suffix={installments === 1 ? "parcela" : "parcelas"}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[12px] font-semibold text-glass-sub">
                      Parcela atual
                    </p>
                    <Stepper
                      value={currentInstallment}
                      onChange={setCurrentInstallment}
                      min={1}
                      max={installments}
                      suffix={`de ${installments}`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Forma de pagamento
              </p>
              <PaymentMethodSelector
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v);
                  if (v === "cartao") {
                    setCardMode("credito");
                    setCurrentInstallment(1);
                    if (type === "expense") { setPaymentStatus("pending"); setPaymentDate(""); }
                  }
                  else {
                    setCardMode("");
                    setCardId(null);
                  }
                }}
                cardMode={cardMode}
                onCardModeChange={(mode) => {
                  setCardMode(mode);
                  if (mode === "credito" && type === "expense") { setPaymentStatus("pending"); setPaymentDate(""); }
                  if (mode === "debito") { setPaymentStatus("paid"); setPaymentDate(localDateKey()); }
                }}
                cardId={cardId}
                onCardChange={(id) => {
                  setCardId(id);
                  if (id && isCreditExpense) { setPaymentStatus("pending"); setPaymentDate(""); }
                }}
                cards={cards}
              />
              {isCreditExpense && selectedCard && (
                <div className="glass glass-soft mt-3 rounded-2xl p-3" aria-live="polite">
                  <p className="text-[12px] font-bold text-glass-ink">Fatura de {selectedCard.name}</p>
                  {billingCycle ? <>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <label className="min-w-0 text-[11px] font-semibold text-glass-sub">Fechamento
                        <input aria-label="Fechamento da fatura" readOnly type="date" value={billingCycle.closingDate} className="mt-1 w-full rounded-xl bg-white/70 px-2 py-2 text-[13px] font-bold text-glass-ink [color-scheme:light]" />
                      </label>
                      <label className="min-w-0 text-[11px] font-semibold text-glass-sub">Vencimento
                        <input aria-label="Vencimento da fatura" readOnly type="date" value={billingCycle.dueDate} className="mt-1 w-full rounded-xl bg-white/70 px-2 py-2 text-[13px] font-bold text-glass-ink [color-scheme:light]" />
                      </label>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-glass-sub">
                      {billingChoices
                        ? savedInvoiceMonth
                          ? "Fatura escolhida anteriormente. Ao salvar, você pode confirmar ou trocar entre a atual e a do próximo mês."
                          : "Prévia do próximo mês. Esta compra é após o fechamento: ao salvar, escolha a fatura atual ou a do próximo mês."
                        : "Datas preenchidas pelo cartão."}
                      {" "}Os avisos seguem o fechamento e o vencimento da fatura escolhida, dentro do app.
                    </p>
                  </> : <>
                    <p className="mt-2 text-[12px] text-glass-sub">Informe o fechamento e o vencimento deste cartão para calcular a fatura e gerar os avisos.</p>
                    <button type="button" className="mt-2 min-h-10 rounded-xl bg-primary px-3 py-2 text-[12px] font-bold text-white" onClick={() => { onClose(); navigate("/dashboard/cartoes", { state: { editCardId: selectedCard.id } }); }}>Configurar datas do cartão</button>
                  </>}
                </div>
              )}
              {paymentMethod === "cartao" && cardId && (
                <div className="mt-2.5 rounded-2xl bg-glass-ink/[0.04] p-2 dark:bg-white/[0.04]">
                  <p className="mb-1.5 px-1 text-[11px] font-semibold text-glass-sub">
                    Exibir no card da transação
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { id: "last4" as const, label: `•••• ${selectedCard?.last4 ?? "0000"}` },
                      { id: "name" as const, label: selectedCard?.name ?? "Nome do cartão" },
                    ]).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={cardDisplayMode === option.id}
                        onClick={() => setCardDisplayMode(option.id)}
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
            </div>

            {/* Payment status */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Status do pagamento
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  { id: "paid" as const, label: "Pago", icon: Check },
                  { id: "pending" as const, label: "Pendente", icon: Clock },
                ]).map((option) => {
                  const active = paymentStatus === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setPaymentStatus(option.id);
                        if (option.id === "paid") {
                          setPaymentDate((current) => current || date || localDateKey());
                        } else {
                          setPaymentDate("");
                        }
                      }}
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-[13px] font-bold transition-all active:scale-[0.98]",
                        active
                          ? option.id === "paid"
                            ? "bg-[#1FBF4F] text-white shadow-[0_6px_16px_-8px_rgba(31,191,79,0.8)]"
                            : "bg-[#FF9F0A] text-white shadow-[0_6px_16px_-8px_rgba(255,159,10,0.8)]"
                          : "glass glass-soft text-glass-sub",
                      )}
                    >
                      <Icon className="size-4" strokeWidth={2.6} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {paymentStatus === "paid" && (
                <div className="mt-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                    Data do pagamento
                  </p>
                  <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                    <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      max={localDateKey()}
                      className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Date + optional time */}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                  {isCreditExpense ? "Data da compra" : "Data"}
                </p>
                <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                  <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={localDateKey()}
                    className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </label>
              </div>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                  Hora{" "}
                  <span className="normal-case text-glass-faint">(opcional)</span>
                </p>
                <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                  <Clock className="size-4 shrink-0 text-glass-sub" />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </label>
              </div>
            </div>

            {!isCreditExpense && paymentStatus === "pending" && (
              <div className="mt-4">
                <label className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub" htmlFor="transaction-due-date">Data de vencimento</label>
                <div className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                  <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                  <input id="transaction-due-date" type="date" required value={dueDate || date} onChange={(event) => setDueDate(event.target.value)} className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]" />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-glass-sub">Se esta data passar sem pagamento, o status muda automaticamente para Vencida.</p>
              </div>
            )}

            {/* Attachments */}
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
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="glass flex min-h-[52px] min-w-0 items-center gap-2 rounded-2xl px-3 text-left text-glass-sub transition-all hover:bg-white/60 active:scale-[0.98]"
                >
                  <ImagePlus className="size-5 shrink-0 text-[#5E5CE6]" strokeWidth={2.2} />
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
                  <FileText className="size-5 shrink-0 text-[#2F6BFF]" strokeWidth={2.2} />
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
              <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">
                {attachments.map((att, i) =>
                  att.isImage ? (
                    <div
                      key={i}
                      className="relative size-[68px] shrink-0 overflow-hidden rounded-2xl"
                    >
                      <img
                        src={att.src}
                        alt={att.name}
                        className="size-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remover ${att.name}`}
                        onClick={() => removeAttachment(i)}
                        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-transform active:scale-90"
                      >
                        <X className="size-3" strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="glass glass-soft flex h-[68px] w-[150px] shrink-0 flex-col justify-center rounded-2xl px-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#2F6BFF]/15 text-[#2F6BFF]">
                          <FileText className="size-4" strokeWidth={2.3} />
                        </span>
                        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-glass-ink">
                          {att.name}
                        </p>
                        <button
                          type="button"
                          aria-label={`Remover ${att.name}`}
                          onClick={() => removeAttachment(i)}
                          className="shrink-0 text-glass-sub transition-colors hover:text-[#FF3B30]"
                        >
                          <X className="size-4" strokeWidth={2.6} />
                        </button>
                      </div>
                    </div>
                  ),
                )}

              </HorizontalScroll>
              {attachments.length > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-glass-faint">
                  <Paperclip className="size-3" /> {attachments.length} de 6
                  anexos
                </p>
              )}
            </div>

            {/* Draft */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Rascunho{" "}
                <span className="normal-case text-glass-faint">(opcional)</span>
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anotações, observações, itens da compra…"
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
                  {(
                    [
                      { id: "hidden" as const, label: "Ocultar no card" },
                      {
                        id: "multipleMedia" as const,
                        label: "Mostrar no card",
                      },
                    ]
                  ).map((option) => (
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
          </div>

          {/* Footer */}
          <div className="px-5 pb-7 pt-2">
            {/* Parcelada: quanto fica cada parcela */}
            {(recurrence === "parcelada") && cents > 0 && (
              <div className="glass glass-soft mb-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                    Cada parcela
                  </p>
                  <p className="amount-tabular text-[17px] font-bold leading-tight text-glass-ink">
                    {(cents / 100 / installments).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                    {installments} × no total
                  </p>
                  <p className="amount-tabular whitespace-nowrap text-[12.5px] font-semibold leading-tight text-glass-sub">
                    {amountLabel} · registrando {currentInstallment} de{" "}
                    {installments}
                  </p>
                </div>
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
              {editTransactionId
                ? "Salvar edição"
                : `Adicionar ${type === "expense" ? "despesa" : "receita"}`}
            </button>
            {editTransactionId && (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 flex w-full items-center justify-center rounded-full py-2.5 text-[14px] font-semibold text-glass-sub transition-colors hover:text-glass-ink"
              >
                Cancelar
              </button>
            )}
          </div>

          <AlertDialog
            open={invoiceChoiceOpen && !!billingChoices}
            onOpenChange={setInvoiceChoiceOpen}
            overlayParentId={overlay.overlayId}
          >
            <AlertDialogContent
              overlayClassName="z-[90] backdrop-blur-sm"
              className="z-[100] max-h-[90dvh] overflow-y-auto rounded-3xl border-white/60 bg-[#eef1fe] p-5 text-glass-ink dark:bg-[#0a1122] sm:max-w-md"
            >
              <AlertDialogHeader className="text-left">
                <AlertDialogTitle>Em qual fatura deseja adicionar?</AlertDialogTitle>
                <AlertDialogDescription className="text-glass-sub">
                  A compra de {date.split("-").reverse().join("/")} é após o fechamento de {selectedCard?.name}
                  {billingChoices && ` em ${billingChoices.current.closingDate.split("-").reverse().join("/")}`}.
                  {" "}Escolha onde registrar esta despesa.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <fieldset className="grid gap-3">
                <legend className="sr-only">Fatura da compra</legend>
                {billingChoices && ([
                  { label: "Fatura atual", cycle: billingChoices.current },
                  { label: "Próximo mês", cycle: billingChoices.next },
                ]).map(({ label, cycle }) => (
                  <label key={cycle.month} className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                    invoiceChoiceMonth === cycle.month ? "border-primary bg-primary/10" : "border-glass-ink/15 bg-white/40 dark:bg-white/5",
                  )}>
                    <input
                      type="radio"
                      name="card-invoice-month"
                      value={cycle.month}
                      checked={invoiceChoiceMonth === cycle.month}
                      onChange={() => setInvoiceChoiceMonth(cycle.month)}
                      className="mt-1 size-5 shrink-0 accent-primary"
                    />
                    <span className="grid gap-1">
                      <span className="text-[15px] font-bold">{label}</span>
                      <span className="text-[13px] font-semibold">Vencimento: {cycle.dueDate.split("-").reverse().join("/")}</span>
                      <span className="text-[12px] text-glass-sub">Fechamento: {cycle.closingDate.split("-").reverse().join("/")}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <AlertDialogFooter className="sm:flex-col">
                <AlertDialogCancel className="min-h-11 w-full rounded-2xl">Voltar sem salvar</AlertDialogCancel>
                <AlertDialogAction disabled={!invoiceChoiceMonth} onClick={() => saveTransaction(invoiceChoiceMonth)} className="min-h-11 w-full rounded-2xl">
                  Confirmar e salvar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Seletor completo de categorias — bottom sheet com busca. NENHUM
              Fragment dentro do AnimatePresence: cada elemento é um filho
              keyado e condicional próprio, para o framer-motion desmontar as
              saídas (backdrop + sheet) sem perder a referência do DOM. */}
          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                key="cat-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={() => setPickerOpen(false)}
                className="absolute inset-0 z-40 bg-[#0b1630]/45 backdrop-blur-[2px]"
              />
            )}
            {pickerOpen && (
              <motion.div
                key="cat-sheet"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 330 }}
                  className="glass glass-strong absolute inset-x-0 bottom-0 z-50 flex max-h-[74%] flex-col rounded-t-[2.2rem] bg-white px-5 pb-8 pt-3 dark:bg-[#f4f8ff]"
                >
                  <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-black/15 dark:bg-black/25" />
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-glass-ink">
                        Escolher categoria
                      </h3>
                      <p className="text-[13px] text-glass-sub">
                        Todas as categorias disponíveis
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Fechar"
                      onClick={() => setPickerOpen(false)}
                      className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub active:scale-90"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Busca com lupa */}
                  <label className="glass glass-soft flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                    <Search className="size-4 shrink-0 text-glass-sub" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && filteredCategories[0]) {
                          event.preventDefault();
                          scrollToSearchResult(filteredCategories[0].id);
                        }
                      }}
                      placeholder="Buscar categoria…"
                      inputMode="search"
                      enterKeyHint="search"
                      className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint"
                    />
                    {query && (
                      <button
                        type="button"
                        aria-label="Limpar busca"
                        onClick={() => setQuery("")}
                        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-glass-sub transition-transform active:scale-90"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </label>

                  {/* Lista vertical filtrada em tempo real — o padding horizontal
                      dá respiro ao anel azul do item ativo para ele renderizar
                      com os cantos arredondados na direita, sem ser cortado pelo
                      overflow do contêiner. */}
                  <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto px-1">
                    {filteredCategories.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-glass-ink/10">
                          <Search className="size-5 text-glass-faint" />
                        </div>
                        <p className="text-[14px] font-semibold text-glass-ink">
                          Nenhuma categoria
                        </p>
                        <p className="text-[12.5px] text-glass-sub">
                          Tente buscar por outro termo.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 pb-1">
                        {filteredCategories.map((c) => {
                          const selected = categoryId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              data-search-result-id={c.id}
                              onClick={() => {
                                setCategoryId(c.id);
                                setPickerOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all active:scale-[0.99]",
                                selected
                                  ? "bg-primary/10 ring-2 ring-primary/40"
                                  : "hover:bg-white/50",
                              )}
                            >
                              <CategoryIcon
                                categoryId={c.id}
                                size="size-10"
                                iconSize="size-[17px]"
                              />
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    "block truncate text-[14.5px] font-semibold",
                                    selected ? "text-primary" : "text-glass-ink",
                                  )}
                                >
                                  <SearchHighlight query={query}>{c.label}</SearchHighlight>
                                </span>
                              </span>
                              {selected && (
                                <Check
                                  className="size-4 shrink-0 text-primary"
                                  strokeWidth={2.6}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
