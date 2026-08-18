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
  const installmentLabel =
    transaction.recurrence === "parcelada"
      ? `${transaction.currentInstallment ?? 1}/${transaction.installments ?? 2}`
      : transaction.recurrence === "recorrente"
        ? frequencyLabel(transaction.frequency, transaction.frequencyInterval)
        : null;
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
        {/* Cabeçalho: ícone, título, categoria e valor */}
        <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-start gap-2 sm:gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-glass-ink/5 ring-1 ring-glass-ink/10 dark:bg-white/5 dark:ring-white/10 sm:size-14">
              <CategoryIcon
                categoryId={transaction.categoryId}
                size="size-10 sm:size-14"
                iconSize="size-5 sm:size-6"
              />
            </div>
            <div className="min-w-0 pt-0">
              <p className="min-w-0 truncate text-[15px] font-semibold leading-5 tracking-[-0.02em] text-glass-ink lg:text-[21px]">
                <SearchHighlight query={searchQuery}>{transaction.title}</SearchHighlight>
              </p>
              <span
                className="mt-0.5 inline-flex min-h-5 max-w-full items-center gap-1 rounded-full border border-transparent px-1.5 py-0.5 text-[9px] font-semibold text-slate-700 dark:text-slate-200 lg:text-[13px]"
                style={{
                  borderColor: `${category.color}22`,
                  backgroundColor: `${category.color}14`,
                }}
              >
                <CategoryIcon
                  categoryId={transaction.categoryId}
                  size="size-4"
                  iconSize="size-2.5"
                />
                <span className="truncate">{category.label}</span>
              </span>
            </div>
          </div>

          <div className="shrink-0 pt-0 text-right">
            <span className="block text-[9px] font-medium text-glass-faint lg:text-xs">Valor</span>
            <p
              className={cn(
                "amount-tabular text-right text-[15px] font-bold leading-5 lg:text-[21px]",
                isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
              )}
            >
              {isIncome ? "+" : "−"}
              {formatCurrency(transaction.amount)}
            </p>
          </div>
        </div>

        {/* Painel de metadados: colunas nomeadas */}
        <div className="mt-2 grid min-w-0 grid-cols-2 gap-x-2 gap-y-2 border-t border-glass-ink/10 pt-2 dark:border-white/10 sm:mt-3 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-2.5 sm:pt-3">
          {paymentPresentation && (
            <div className="min-w-0 space-y-0.5">
              <p className="text-[10px] font-medium text-glass-faint lg:text-xs">Pagamento</p>
              <span
                className="inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold lg:text-[13px]"
                style={{
                  color: paymentPresentation.color,
                  borderColor: `${paymentPresentation.color}35`,
                  backgroundColor: `${paymentPresentation.color}12`,
                }}
                title={paymentPresentation.label}
              >
                {PaymentIcon && <PaymentIcon className="size-3.5 shrink-0" strokeWidth={2.2} />}
                <span className="truncate">{paymentPresentation.label}</span>
              </span>
            </div>
          )}

          {installmentLabel && (
            <div className="min-w-0 space-y-0.5">
              <p className="text-[10px] font-medium text-glass-faint lg:text-xs">
                {transaction.recurrence === "parcelada" ? "Parcelamento" : "Recorrência"}
              </p>
              <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-700 dark:text-violet-200 lg:text-[13px]">
                {transaction.recurrence === "parcelada" ? (
                  <Layers className="size-3.5 shrink-0" strokeWidth={2.4} />
                ) : (
                  <Repeat className="size-3.5 shrink-0" strokeWidth={2.4} />
                )}
                <span className="whitespace-nowrap">{installmentLabel}</span>
              </span>
            </div>
          )}

          {hasAttachments && (
            <div className="min-w-0 space-y-0.5">
              <p className="text-[10px] font-medium text-glass-faint lg:text-xs">Anexos</p>
              <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-glass-ink/10 px-2 py-1 text-[10px] font-semibold text-glass-sub lg:text-[13px]">
                <Paperclip className="size-3.5 shrink-0" strokeWidth={2.4} />
                {transaction.attachments!.length}
              </span>
            </div>
          )}

          {paymentLabel && paymentStatus && (
            <div className="min-w-0 space-y-0.5 sm:border-l sm:border-glass-ink/10 sm:pl-4 sm:dark:border-white/10">
              <p className="text-[10px] font-medium text-glass-faint lg:text-xs">Status</p>
              <button
                type="button"
                aria-label={`Alterar status para ${paymentStatus === "paid" ? "Pendente" : "Pago"}`}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={handleStatusBadgeClick}
                className={cn(
                  "flex min-h-11 max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-extrabold tracking-tight transition-colors active:scale-95 lg:text-[13px]",
                  paymentStatus === "paid"
                    ? "border-green-200/80 bg-green-50/80 text-green-700 dark:border-green-400/25 dark:bg-green-400/10 dark:text-green-300"
                    : "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
                )}
              >
                {paymentStatus === "paid" ? (
                  <Check className="size-3.5 shrink-0" strokeWidth={2.8} />
                ) : (
                  <Clock3 className="size-3.5 shrink-0" strokeWidth={2.8} />
                )}
                <span className="truncate">{paymentLabel}</span>
              </button>
              {showPaymentDateOnCard && transaction.paymentDate && (
                <span className="block text-[10px] font-semibold leading-4 text-glass-faint lg:text-xs">
                  Pago em {shortDate(transaction.paymentDate)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Observação: faixa de largura total */}
        {showDraftOnCard && (
          <div className="mt-2 overflow-hidden rounded-2xl bg-[#dfe4ff]/90 px-3 py-2 dark:bg-[#1c2542]/80 dark:bg-[#1c2542]/80">
            <p className="text-[10px] font-medium text-glass-faint lg:text-xs">Observação</p>
            <p className="mt-0.5 line-clamp-2 border-l-2 border-[#7C6FF2] pl-2.5 text-[12px] leading-4 text-glass-ink/85 dark:text-white/85 lg:text-[15px]">
              <SearchHighlight query={searchQuery}>{transaction.note}</SearchHighlight>
            </p>
          </div>
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
              "relative z-10 flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-2xl border-0 bg-[#f4f8ff] px-3 py-2 text-left outline-none shadow-none ring-0 transition-colors dark:bg-[#0d1b3e] lg:gap-5 lg:px-5 lg:py-3",
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
            "flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-2xl bg-[#f4f8ff] px-3 py-2 text-left transition-colors dark:bg-[#0d1b3e] lg:gap-5 lg:px-5 lg:py-3",
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
