import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import {
  Banknote,
  AlertTriangle,
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
import { getTransactionDueDate, type TransactionPaymentStatus } from "@/lib/transaction-status";
import { cardPaymentStyle, cardPaymentTone, paymentMethodTone } from "@/lib/payment-method-theme";
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

const paymentBadgeClass = "inline-flex min-h-7 w-fit min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold lg:min-h-8 lg:py-1 lg:text-[13px]";

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
  categoryColors: string[],
): { label: string; icon: LucideIcon; tone: string; style?: CSSProperties } | null {
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
  const style = card ? cardPaymentStyle(card.color, categoryColors) : undefined;
  return { label, icon, tone: style ? cardPaymentTone : paymentMethodTone(methodId), style };
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
  searchResultId,
}: {
  transaction: Transaction;
  showDate?: boolean;
  swipeable?: boolean;
  paymentLabel?: "Fatura paga" | "Pago" | "Pendente" | "Vencida";
  paymentStatus?: TransactionPaymentStatus;
  paymentActionLabel?: string;
  onPaymentAction?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: () => void;
  searchQuery?: string;
  searchResultId?: string;
}) {
  const { categoryById, cards, loanReceivables, deleteTransaction, showCategoryNameOnCard } = useAppStore();
  const dueDate = getTransactionDueDate(transaction, cards, loanReceivables);
  const [open, setOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const lastDragAt = useRef(0);
  const x = useMotionValue(0);
  const isIncome = transaction.amount > 0;
  const category = categoryById[transaction.categoryId] ?? fallback;
  const categoryLabelFontSize =
    category.label.length > 12 ? "5px" : category.label.length > 8 ? "6px" : "7px";
  const titleNeedsMobileWrap = transaction.title.trim().length > 22;
  const paymentPresentation = getPaymentPresentation(transaction, cards, Object.values(categoryById).map((item) => item.color));
  const formattedAmount = formatCurrency(transaction.amount);
  const amountTextSizeClass =
    formattedAmount.length > 15
      ? "text-[11px] lg:text-[18px]"
      : formattedAmount.length > 12
        ? "text-[12px] lg:text-[19px]"
        : "text-[14px] lg:text-[21px]";
  const PaymentIcon = paymentPresentation?.icon;
  const hasAttachments = (transaction.attachments?.length ?? 0) > 0;
  const installmentLabel =
    transaction.recurrence === "parcelada"
      ? `${transaction.currentInstallment ?? 1}/${transaction.installments ?? 2}`
      : transaction.recurrence === "recorrente"
        ? frequencyLabel(transaction.frequency, transaction.frequencyInterval)
        : null;
  const hasSecondaryMeta = Boolean(installmentLabel || hasAttachments);
  const showDraftOnCard =
    transaction.draftDisplay === "multipleMedia" &&
    Boolean(transaction.note?.trim());
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

  // Use o clique da linha: onTap pode executar após o botão de status e
  // deixar os detalhes abertos atrás da confirmação, apesar de stopPropagation.
  const handleRowActivate = () => {
    // Ignore o clique residual após arrastar para preservar o estado do swipe.
    if (Date.now() - lastDragAt.current < 350) return;
    if (searchQuery?.trim()) scrollToSearchResult(searchResultId ?? transaction.id);
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
    setOpen(false);
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
        {/* Cabeçalho: bloco único da categoria, título e valor */}
        <div className="flex min-w-0 items-start justify-between gap-1.5 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:gap-3.5">
            <div className="flex w-9 shrink-0 translate-y-1 flex-col items-center gap-0.5 sm:w-11 sm:gap-1">
              <div
                className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border px-0.5 py-0.5 sm:h-11 sm:w-11 sm:px-1 sm:py-1"
                style={{
                  backgroundColor: `${category.color}2B`,
                  borderColor: `${category.color}66`,
                }}
                aria-label={`Categoria: ${category.label}`}
              >
                <CategoryIcon
                  categoryId={transaction.categoryId}
                  size="size-5 sm:size-7"
                  iconSize="size-4 sm:size-5"
                  strokeWidth={2.8}
                  useImage={false}
                  backgroundColor="transparent"
                  className="relative z-0 rounded-none bg-transparent shadow-none ring-0"
                />
              </div>
              {showCategoryNameOnCard && (
                <span
                  className="pointer-events-none block w-[calc(100%+18px)] max-w-[calc(100%+18px)] truncate whitespace-nowrap text-center leading-none opacity-60"
                  style={{
                    color: category.color,
                    fontFamily: "'Caveat', 'Segoe Script', 'Bradley Hand', cursive",
                    fontSize: categoryLabelFontSize,
                    fontStyle: "normal",
                    fontWeight: 400,
                    letterSpacing: "0.01em",
                  }}
                >
                  {category.label.toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 translate-y-2 pt-0.5 sm:pt-1">
              <p
                className={cn(
                  "min-w-0 whitespace-normal break-words text-[14px] font-semibold leading-5 tracking-[-0.02em] text-glass-ink lg:text-[21px]",
                  titleNeedsMobileWrap ? "max-w-[10rem] sm:max-w-none" : "max-w-full",
                )}
              >
                <SearchHighlight query={searchQuery}>{transaction.title}</SearchHighlight>
              </p>
            </div>
          </div>

          <div className="min-w-0 max-w-[48%] shrink-0 translate-y-2 pt-0 text-right">
            <span className="block text-[8px] font-medium text-glass-faint lg:text-xs">Valor</span>
            <p
              className={cn(
                "amount-tabular whitespace-nowrap text-right font-bold leading-5 tracking-[-0.04em]",
                amountTextSizeClass,
                isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
              )}
            >
              {isIncome ? "+" : "−"}
              {formattedAmount}
            </p>
          </div>
        </div>

        {/* Painel de metadados: o status permanece na coluna direita */}
        <div className="mt-2.5 grid min-w-0 grid-cols-4 gap-x-1.5 gap-y-1 border-t border-glass-ink/10 pt-1.5 dark:border-white/10 sm:mt-3 sm:gap-x-4 sm:gap-y-2.5 sm:pt-3">
          {hasSecondaryMeta ? (
            <>
              {paymentPresentation ? (
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[8px] font-medium text-glass-faint lg:text-xs">Pagamento</p>
                  <span
                    className={cn(paymentBadgeClass, paymentPresentation.tone)}
                    style={paymentPresentation.style}
                    title={paymentPresentation.label}
                  >
                    {PaymentIcon && <PaymentIcon className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.2} />}
                    <span className="truncate">{paymentPresentation.label}</span>
                  </span>
                </div>
              ) : (
                <div aria-hidden="true" className="invisible min-w-0" />
              )}

              {installmentLabel ? (
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[9px] font-medium text-glass-faint lg:text-xs">
                    {transaction.recurrence === "parcelada" ? "Parcelamento" : "Recorrência"}
                  </p>
                  <span className="inline-flex min-h-7 w-fit items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-700 dark:text-violet-200 lg:min-h-8 lg:py-1 lg:text-[13px]">
                    {transaction.recurrence === "parcelada" ? (
                      <Layers className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.4} />
                    ) : (
                      <Repeat className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.4} />
                    )}
                    <span className="whitespace-nowrap">{installmentLabel}</span>
                  </span>
                </div>
              ) : (
                <div aria-hidden="true" className="invisible min-w-0" />
              )}

              {hasAttachments ? (
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[8px] font-medium text-glass-faint lg:text-xs">Anexos</p>
                  <span className="inline-flex min-h-7 w-fit items-center gap-1 rounded-full bg-glass-ink/10 px-2 py-0.5 text-[9px] font-semibold text-glass-sub lg:min-h-8 lg:py-1 lg:text-[13px]">
                    <Paperclip className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.4} />
                    {transaction.attachments!.length}
                  </span>
                </div>
              ) : (
                <div aria-hidden="true" className="invisible min-w-0" />
              )}
            </>
          ) : (
            paymentPresentation && (
              <div className="min-w-0 space-y-0.5">
                <p className="text-[9px] font-medium text-glass-faint lg:text-xs">Pagamento</p>
                <span
                  className={cn(paymentBadgeClass, paymentPresentation.tone)}
                  style={paymentPresentation.style}
                  title={paymentPresentation.label}
                >
                  {PaymentIcon && <PaymentIcon className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.2} />}
                  <span className="truncate">{paymentPresentation.label}</span>
                </span>
              </div>
            )
          )}

          {paymentStatus && (
            <div className={cn(
              "col-start-4 row-start-1 flex min-w-0 flex-col items-center space-y-0.5",
              "sm:border-l sm:border-glass-ink/10 sm:pl-4 sm:dark:border-white/10",
            )}>
              <p className="w-full text-center text-[8px] font-medium text-glass-faint lg:text-xs">Status</p>
              <button
                type="button"
                aria-label={paymentStatus === "paid" ? (paymentLabel === "Fatura paga" ? "Reabrir fatura" : "Reabrir lançamento") : "Alterar status para Pago"}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={handleStatusBadgeClick}
                className="flex min-h-11 w-full min-w-0 max-w-full items-start justify-center rounded-full p-0 transition-transform active:scale-95 lg:w-fit"
              >
                <span
                  className={cn(
                    "inline-flex min-h-7 min-w-0 max-w-full items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold tracking-tight lg:min-h-8 lg:gap-1 lg:px-2 lg:py-1 lg:text-[13px]",
                    paymentStatus === "paid"
                      ? "w-full justify-center border-[#1FBF4F] bg-[#1FBF4F] text-white lg:w-fit lg:min-w-[10rem] lg:px-3"
                      : paymentStatus === "overdue"
                        ? "border-[#C62828] bg-[#C62828] text-white"
                        : "border-[#FF9F0A] bg-[#FF9F0A] text-[#4A2A00]",
                  )}
                >
                  {paymentStatus === "paid" ? (
                    <Check className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.8} />
                  ) : paymentStatus === "overdue" ? (
                    <AlertTriangle className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.8} />
                  ) : (
                    <Clock3 className="size-3 shrink-0 lg:size-3.5" strokeWidth={2.8} />
                  )}
                  <span className="truncate">{paymentLabel ?? (paymentStatus === "paid" ? "Pago" : paymentStatus === "overdue" ? "Vencida" : "Pendente")}</span>
                </span>
              </button>
              {showPaymentDateOnCard && transaction.paymentDate && (
                <span className="-mt-3 block whitespace-nowrap text-center text-[9px] font-semibold leading-4 text-glass-faint lg:-mt-2 lg:text-xs">
                  Pago em {shortDate(transaction.paymentDate)}
                </span>
              )}
              {paymentStatus !== "paid" && dueDate && (
                <span className={cn("-mt-3 block whitespace-nowrap text-center text-[9px] font-semibold leading-4 lg:-mt-2 lg:text-xs", paymentStatus === "overdue" ? "text-[#C62828] dark:text-red-300" : "text-glass-faint")}>
                  {paymentStatus === "overdue" ? "Venceu" : "Vence"} em {shortDate(dueDate)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Observação: faixa de largura total */}
        {showDraftOnCard && (
          <div className="mt-1.5 overflow-hidden rounded-2xl bg-[#dfe4ff]/90 px-2.5 py-1.5 dark:bg-[#1c2542]/80 sm:mt-3 sm:px-3.5 sm:py-2.5">
            <p className="text-[10px] font-extrabold text-[#935C49] dark:text-[#DBAC98] lg:text-[13px]">Observação</p>
            <p className="mt-0.5 line-clamp-2 whitespace-pre-line border-l-2 border-[#7C6FF2] pl-2 text-[11px] leading-4 text-glass-ink/85 dark:text-white/85 lg:pl-2.5 lg:text-[15px]">
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
          data-search-result-id={searchResultId ?? transaction.id}
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
            onDragStart={() => {
              lastDragAt.current = Date.now();
            }}
            dragConstraints={{ left: -SWIPE_DISTANCE, right: 0 }}
            dragElastic={0.08}
            dragDirectionLock
            dragMomentum={false}
            style={{ x }}
            onDragEnd={(_, info) => {
              lastDragAt.current = Date.now();
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
            onClick={handleRowActivate}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleRowActivate();
              }
            }}
            className={cn(
              "relative z-10 flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-2xl border-0 bg-[#f4f8ff] px-3 py-2.5 text-left outline-none shadow-none ring-0 transition-colors dark:bg-[#0d1b3e] lg:gap-5 lg:px-5 lg:py-3",
            )}
          >
            {rowContent}
          </motion.div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          data-search-result-id={searchResultId ?? transaction.id}
          data-search-match-result={searchQuery?.trim() ? "true" : undefined}
          onClick={handleRowActivate}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleRowActivate();
            }
          }}
          className={cn(
            "flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-2xl bg-[#f4f8ff] px-3 py-2.5 text-left transition-colors dark:bg-[#0d1b3e] lg:gap-5 lg:px-5 lg:py-3",
          )}
        >
          {rowContent}
        </div>
      )}

      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent className="glass-strong z-[80] max-w-[calc(100%-2rem)] rounded-2xl border-glass-ink/10 p-5 text-glass-ink dark:border-white/10 dark:text-white sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {paymentStatus === "paid" ? (paymentLabel === "Fatura paga" ? "Reabrir fatura?" : "Reabrir lançamento?") : "Alterar status?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {paymentStatus === "paid"
                ? paymentLabel === "Fatura paga"
                  ? "Deseja reabrir esta fatura e deixar suas compras em aberto?"
                  : "Deseja reabrir este lançamento e deixá-lo em aberto?"
                : "Deseja alterar o status para Pago?"}
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
              {paymentStatus === "paid" ? "Reabrir" : "Confirmar"}
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
