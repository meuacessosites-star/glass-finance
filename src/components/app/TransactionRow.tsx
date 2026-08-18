import { useState, type MouseEvent } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import {
  Banknote,
  Barcode,
  Check,
  Clock3,
  CreditCard,
  Layers,
  Paperclip,
  QrCode,
  Repeat,
  Send,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatCurrency,
  frequencyLabel,
  shortDate,
  type Transaction,
} from "@/lib/mock-data";
import { useAppStore, type AppCard } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { SearchHighlight, scrollToSearchResult } from "./SearchHighlight";
import { TransactionDetailsSheet } from "./TransactionDetailsSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fallback = { label: "Outros", color: "#8E8E93", icon: "outros" };

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  boleto: "Boleto",
  transferencia: "Transferência",
  saldo: "Saldo",
};

function getPaymentPresentation(
  transaction: Transaction,
  cards: AppCard[],
): { label: string; icon: LucideIcon; color: string } | null {
  const rawMethod = transaction.paymentMethod?.toLowerCase().trim();
  if (!rawMethod) return null;

  const methodId =
    rawMethod === "credito" || rawMethod === "debito" ? "cartao" : rawMethod;
  const methodLabel = PAYMENT_METHOD_LABELS[methodId] ?? rawMethod;
  const card =
    methodId === "cartao" && transaction.cardId
      ? cards.find((item) => item.id === transaction.cardId)
      : undefined;
  const cardLabel = card
    ? transaction.cardDisplayMode === "name"
      ? card.name
      : `•••• ${card.last4}`
    : methodLabel;
  const modeLabel =
    methodId === "cartao" && transaction.cardMode === "credito"
      ? "Crédito"
      : methodId === "cartao" && transaction.cardMode === "debito"
        ? "Débito"
        : null;
  const label = modeLabel && !card ? `${cardLabel} · ${modeLabel}` : cardLabel;

  const icon =
    methodId === "pix"
      ? QrCode
      : methodId === "dinheiro"
        ? Banknote
        : methodId === "boleto"
          ? Barcode
          : methodId === "transferencia"
            ? Send
            : methodId === "saldo"
              ? Wallet
              : CreditCard;
  const color = card?.color ??
    (methodId === "pix"
      ? "#16A34A"
      : methodId === "dinheiro"
        ? "#A16207"
        : methodId === "boleto"
          ? "#7C3AED"
          : methodId === "transferencia"
            ? "#2563EB"
            : methodId === "saldo"
              ? "#0F766E"
              : "#2563EB");

  return { label, icon, color };
}

const SWIPE_DISTANCE = 208;
const SWIPE_OPEN_THRESHOLD = 32;
const SWIPE_CLOSE_THRESHOLD = 20;
const SWIPE_OPEN_VELOCITY = -220;
const SWIPE_CLOSE_VELOCITY = 180;

export function TransactionRow({
  transaction,
  swipeable = false,
  paymentLabel,
  paymentStatus,
  paymentActionLabel,
  onPaymentAction,
  selectable = false,
  selected = false,
  onSelect,
  onEdit,
  searchQuery,
}: {
  transaction: Transaction;
  showDate?: boolean;
  swipeable?: boolean;
  paymentLabel?: "Fatura paga" | "Pago" | "Pendente";
  paymentStatus?: "paid" | "pending";
  paymentActionLabel?: string;
  onPaymentAction?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: () => void;
  searchQuery?: string;
}) {
  const { categoryById, cards, deleteTransaction } = useAppStore();
  const [open, setOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const x = useMotionValue(0);
  const isIncome = transaction.amount > 0;
  const category = categoryById[transaction.categoryId] ?? fallback;
  const paymentPresentation = getPaymentPresentation(transaction, cards);
  const PaymentIcon = paymentPresentation?.icon;
  const hasAttachments = (transaction.attachments?.length ?? 0) > 0;
  const showDraftOnCard =
    transaction.draftDisplay === "multipleMedia" &&
    Boolean(transaction.note?.trim()) &&
    (transaction.attachments?.length ?? 0) > 1;
  const isSyntheticLoan = transaction.id.startsWith("loan-receivable-");
  const hasPaymentAction = Boolean(paymentActionLabel && onPaymentAction);
  const showPaymentDateOnCard =
    paymentStatus === "paid" &&
    Boolean(transaction.paymentDate) &&
    transaction.showPaymentDateOnCard !== false;
  const closeSwipe = () => {
    setSwipeOpen(false);
    animate(x, 0, {
      type: "spring",
      stiffness: 520,
      damping: 34,
      mass: 0.65,
    });
  };

  const snapSwipe = () => {
    setSwipeOpen(true);
    animate(x, -SWIPE_DISTANCE, {
      type: "spring",
      stiffness: 520,
      damping: 34,
      mass: 0.65,
    });
  };

  const handleRowActivate = () => {
    if (searchQuery?.trim()) scrollToSearchResult(transaction.id);
    if (selectable) {
      onSelect?.(transaction.id);
      return;
    }
    if (Math.abs(x.get()) > 10) {
      closeSwipe();
      return;
    }
    setOpen(true);
  };

  const handlePaymentAction = () => {
    if (!onPaymentAction) return;
    onPaymentAction();
    closeSwipe();
    toast.success("Status atualizado");
  };

  const handleStatusBadgeClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!hasPaymentAction) return;
    setOpen(false);
    setStatusDialogOpen(true);
  };

  const confirmStatusChange = () => {
    setStatusDialogOpen(false);
    handlePaymentAction();
  };

  const handleDelete = () => {
    if (isSyntheticLoan) {
      toast.info("Movimentações de empréstimos são gerenciadas em Empréstimos.");
      closeSwipe();
      return;
    }
    if (!window.confirm("Deseja excluir esta transação?")) {
      closeSwipe();
      return;
    }
    deleteTransaction(transaction.id);
    toast.success("Transação excluída");
  };

  const handlePrimaryAction = () => {
    if (!hasPaymentAction) {
      closeSwipe();
      return;
    }
    handlePaymentAction();
  };

  const handleSecondaryAction = () => {
    handleDelete();
  };

  const primaryActionLabel = paymentActionLabel ?? "Alterar status";
  const secondaryActionLabel = isSyntheticLoan ? "Empréstimos" : "Excluir";
  const primaryActionClass =
    paymentStatus === "paid"
      ? "bg-[#FF9F0A] text-[#4A2A00]"
      : "bg-[#1FBF4F] text-white";
  const rowContent = (
    <>
      {selectable && (
        <button
          type="button"
          aria-label={selected ? "Desmarcar transação" : "Selecionar transação"}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(transaction.id);
          }}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            selected
              ? "border-primary bg-primary text-white"
              : "border-glass-ink/25 text-transparent dark:border-white/25",
          )}
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </button>
      )}
      <div className="min-w-0 flex-1 px-0.5">
        {/* Linha 1: título */}
        <p className="min-w-0 truncate text-[14px] font-semibold leading-5 tracking-[-0.01em] text-glass-ink lg:text-[17px]">
          <SearchHighlight query={searchQuery}>{transaction.title}</SearchHighlight>
        </p>

        {/* Linha 2: todas as tags em um único agrupamento */}
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold text-glass-ink/80 dark:text-white/80 lg:text-[13px]"
            style={{
              borderColor: `${category.color}55`,
              backgroundColor: `${category.color}18`,
            }}
          >
            <CategoryIcon
              categoryId={transaction.categoryId}
              size="size-4"
              iconSize="size-2.5"
            />
            <span className="truncate">{category.label}</span>
          </span>
          {paymentPresentation && (
            <span
              className="inline-flex min-h-6 min-w-0 max-w-[12rem] items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold lg:max-w-[16rem] lg:text-[12px]"
              style={{
                color: paymentPresentation.color,
                borderColor: `${paymentPresentation.color}45`,
                backgroundColor: `${paymentPresentation.color}12`,
              }}
              title={paymentPresentation.label}
            >
              {PaymentIcon && <PaymentIcon className="size-3 shrink-0" strokeWidth={2.4} />}
              <span className="truncate">{paymentPresentation.label}</span>
            </span>
          )}
          {hasAttachments && (
            <span className="flex min-h-6 shrink-0 items-center gap-1 rounded-lg bg-glass-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-glass-sub">
              <Paperclip className="size-3" strokeWidth={2.6} />
              {transaction.attachments!.length}
            </span>
          )}
          {transaction.recurrence === "recorrente" && (
            <span className="flex min-h-6 shrink-0 items-center gap-1 rounded-lg bg-glass-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-glass-sub">
              <Repeat className="size-3" strokeWidth={2.6} />
              <span className="truncate">{frequencyLabel(
                transaction.frequency,
                transaction.frequencyInterval,
              )}</span>
            </span>
          )}
          {transaction.recurrence === "parcelada" && (
            <span className="flex min-h-6 shrink-0 items-center gap-1 rounded-lg bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-200">
              <Layers className="size-3" strokeWidth={2.6} />
              <span className="whitespace-nowrap">{transaction.currentInstallment ?? 1}/{transaction.installments ?? 2}</span>
            </span>
          )}
        </div>

        {/* Linha 3: rascunho/anotação */}
        {showDraftOnCard && (
          <div className="mt-2 overflow-hidden rounded-r-md rounded-l-[3px] bg-[#dfe4ff]/90 px-3 py-1 shadow-sm ring-1 ring-inset ring-[#7C6FF2]/12 dark:bg-[#1c2542]/80 dark:ring-[#A79BFF]/20">
            <p className="line-clamp-2 border-l-2 border-[#7C6FF2] pl-2.5 text-[11px] font-medium leading-snug text-glass-ink/85 dark:text-white/85 lg:text-[13px]">
              <SearchHighlight query={searchQuery}>{transaction.note}</SearchHighlight>
            </p>
          </div>
        )}
      </div>
      <div className="ml-auto flex min-w-[68px] shrink-0 flex-col items-end gap-1 pt-0.5 lg:min-w-[112px] lg:gap-1.5">
        <p
          className={cn(
            "amount-tabular text-right text-[14px] font-bold leading-5 lg:text-[18px]",
            isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
          )}
        >
          {isIncome ? "+" : "−"}
          {formatCurrency(transaction.amount)}
        </p>
        {paymentLabel && paymentStatus && (
          <button
            type="button"
            aria-label={`Alterar status para ${paymentStatus === "paid" ? "Pendente" : "Pago"}`}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={handleStatusBadgeClick}
            className={cn(
              "flex max-w-full items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[9px] font-extrabold tracking-tight transition-transform active:scale-95 lg:text-[11px]",
              paymentStatus === "paid"
                ? "border-[#1FBF4F] bg-[#1FBF4F] text-white"
                : "border-[#FF9F0A] bg-[#FF9F0A] text-[#4A2A00]",
            )}
          >
            {paymentStatus === "paid" ? (
              <Check className="size-2.5" strokeWidth={2.8} />
            ) : (
              <Clock3 className="size-2.5" strokeWidth={2.8} />
            )}
            <span className="truncate">{paymentLabel}</span>
          </button>
        )}
        {showPaymentDateOnCard && transaction.paymentDate && (
          <span className="text-right text-[9px] font-semibold text-glass-faint lg:text-[11px]">
            Pago em {shortDate(transaction.paymentDate)}
          </span>
        )}
      </div>
    </>
  );

  return (
    <>
      {swipeable && !selectable ? (
        <div
          className="relative isolate w-full min-w-0 max-w-full border-0 outline-none shadow-none ring-0 before:hidden after:hidden"
          data-search-result-id={transaction.id}
          data-search-match-result={searchQuery?.trim() ? "true" : undefined}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 flex w-[208px] items-stretch overflow-hidden rounded-r-2xl border-0 outline-none shadow-none ring-0 before:hidden after:hidden",
              swipeOpen && "pointer-events-auto",
            )}
          >
            <motion.button
              type="button"
              aria-label={secondaryActionLabel}
              onClick={handleSecondaryAction}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "flex w-1/2 shrink-0 items-center justify-center gap-1.5 border-0 px-2 text-[10.5px] font-bold leading-tight text-white outline-none shadow-none ring-0 lg:text-[12px]",
                isSyntheticLoan ? "bg-glass-ink/60" : "bg-[#E5484D]",
              )}
            >
              {isSyntheticLoan ? (
                <Layers className="size-3.5" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {secondaryActionLabel}
            </motion.button>
            <motion.button
              type="button"
              aria-label={primaryActionLabel}
              onClick={handlePrimaryAction}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "flex w-1/2 shrink-0 items-center justify-center gap-1.5 border-0 px-2 text-[10.5px] font-bold leading-tight outline-none shadow-none ring-0 lg:text-[12px]",
                primaryActionClass,
              )}
            >
              {paymentStatus === "paid" ? (
                <Clock3 className="size-3.5" />
              ) : (
                <Check className="size-3.5" />
              )}
              {primaryActionLabel}
            </motion.button>
          </div>

          <motion.div
            drag="x"
            dragConstraints={{ left: -SWIPE_DISTANCE, right: 0 }}
            dragElastic={0.08}
            dragDirectionLock
            dragMomentum={false}
            style={{ x }}
            onDragEnd={(_, info) => {
              const offset = info.offset.x;
              const velocity = info.velocity.x;
              const shouldClose =
                swipeOpen &&
                (offset >= SWIPE_CLOSE_THRESHOLD || velocity >= SWIPE_CLOSE_VELOCITY);
              const shouldOpen =
                !swipeOpen &&
                (offset <= -SWIPE_OPEN_THRESHOLD || velocity <= SWIPE_OPEN_VELOCITY);

              if (shouldClose) {
                closeSwipe();
              } else if (shouldOpen || swipeOpen) {
                snapSwipe();
              } else {
                closeSwipe();
              }
            }}
            onTap={handleRowActivate}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleRowActivate();
              }
            }}
            className={cn(
              "relative z-10 flex w-full min-w-0 max-w-full items-start gap-2.5 overflow-hidden rounded-2xl border-0 bg-[#f4f8ff] px-3.5 py-3 text-left outline-none shadow-none ring-0 transition-colors dark:bg-[#0d1b3e] lg:gap-5 lg:px-5 lg:py-4",
            )}
          >
            {rowContent}
          </motion.div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          data-search-result-id={transaction.id}
          data-search-match-result={searchQuery?.trim() ? "true" : undefined}
          onClick={handleRowActivate}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleRowActivate();
            }
          }}
          className={cn(
            "flex w-full min-w-0 max-w-full items-start gap-2.5 overflow-hidden rounded-2xl bg-[#f4f8ff] px-3.5 py-3 text-left transition-colors dark:bg-[#0d1b3e] lg:gap-5 lg:px-5 lg:py-4",
          )}
        >
          {rowContent}
        </div>
      )}

      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent className="glass-strong z-[80] max-w-[calc(100%-2rem)] rounded-2xl border-glass-ink/10 p-5 text-glass-ink dark:border-white/10 dark:text-white sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar status?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja alterar o status para {paymentStatus === "paid" ? "Pendente" : "Pago"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel className="mt-0 rounded-xl border-glass-ink/10 bg-transparent text-glass-sub hover:bg-glass-ink/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/5">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStatusChange}
              className="rounded-xl bg-primary text-white hover:bg-primary/90"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TransactionDetailsSheet
        transaction={transaction}
        open={open && !statusDialogOpen}
        onClose={() => setOpen(false)}
        onEdit={
          onEdit
            ? () => {
                setOpen(false);
                onEdit();
              }
            : undefined
        }
      />
    </>
  );
}
