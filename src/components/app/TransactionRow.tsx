import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  Check,
  Clock3,
  Eye,
  Layers,
  Pencil,
  Paperclip,
  Repeat,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatCurrency,
  frequencyLabel,
  shortDate,
  type Transaction,
} from "@/lib/mock-data";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { TransactionDetailsSheet } from "./TransactionDetailsSheet";

const fallback = { label: "Outros", color: "#8E8E93", icon: "outros" };
const SWIPE_DISTANCE = 208;
const SWIPE_THRESHOLD = 52;

export function TransactionRow({
  transaction,
  showDate = true,
  swipeable = false,
  paymentLabel,
  paymentStatus,
  paymentActionLabel,
  onPaymentAction,
  selectable = false,
  selected = false,
  onSelect,
  onEdit,
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
}) {
  const { categoryById, deleteTransaction } = useAppStore();
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);
  const isIncome = transaction.amount > 0;
  const category = categoryById[transaction.categoryId] ?? fallback;
  const hasAttachments = (transaction.attachments?.length ?? 0) > 0;
  const showDraftOnCard =
    transaction.draftDisplay === "multipleMedia" &&
    Boolean(transaction.note?.trim()) &&
    (transaction.attachments?.length ?? 0) > 1;
  const isSyntheticLoan = transaction.id.startsWith("loan-receivable-");
  const hasPaymentAction = Boolean(paymentActionLabel && onPaymentAction);
  const actionOpacity = useTransform(
    x,
    [0, -SWIPE_THRESHOLD, -SWIPE_DISTANCE],
    [0, 0.7, 1],
  );
  const actionScale = useTransform(x, [0, -SWIPE_DISTANCE], [0.96, 1]);

  useEffect(() => {
    if (!swipeable || selectable) return;
    let cancelled = false;
    let restoreTimer: number | undefined;
    const hintTimer = window.setTimeout(() => {
      if (cancelled || Math.abs(x.get()) > 1) return;
      animate(x, -18, { duration: 0.22, ease: "easeOut" });
      restoreTimer = window.setTimeout(() => {
        if (!cancelled) animate(x, 0, { type: "spring", stiffness: 420, damping: 32 });
      }, 240);
    }, 650);
    return () => {
      cancelled = true;
      window.clearTimeout(hintTimer);
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
    };
  }, [selectable, swipeable, x]);

  const closeSwipe = () => {
    animate(x, 0, { type: "spring", stiffness: 420, damping: 32 });
  };

  const snapSwipe = () => {
    animate(x, -SWIPE_DISTANCE, {
      type: "spring",
      stiffness: 420,
      damping: 32,
    });
  };

  const handleRowActivate = () => {
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

  const handleDelete = () => {
    if (isSyntheticLoan) {
      toast.info("Movimentações de empréstimos são gerenciadas em Empréstimos.");
      closeSwipe();
      return;
    }
    deleteTransaction(transaction.id);
    toast.success("Transação excluída");
  };

  const handlePrimaryAction = () => {
    if (onEdit) {
      onEdit();
      closeSwipe();
      return;
    }
    handleRowActivate();
  };

  const handleSecondaryAction = () => {
    if (hasPaymentAction) {
      handlePaymentAction();
      return;
    }
    handleDelete();
  };

  const primaryActionLabel = onEdit ? "Editar" : "Detalhes";
  const secondaryActionLabel = hasPaymentAction ? paymentActionLabel : isSyntheticLoan ? "Empréstimos" : "Excluir";
  const statusAccent =
    paymentStatus === "paid"
      ? "border-l-2 border-l-[#1FBF4F]"
      : paymentStatus === "pending"
        ? "border-l-2 border-l-[#FF9F0A]"
        : "";

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
      <CategoryIcon
        categoryId={transaction.categoryId}
        size="size-12"
        iconSize="size-5"
      />
      <div className="min-w-0 flex-1 pr-1">
        <p className="truncate text-[15px] font-semibold text-glass-ink">
          {transaction.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-glass-sub">
          <span className="truncate">
            {category.label}
            {showDate && ` · ${shortDate(transaction.date)}`}
          </span>
          {hasAttachments && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-glass-ink/10 px-1.5 py-0.5 text-[10.5px] font-bold text-glass-sub">
              <Paperclip className="size-2.5" strokeWidth={2.6} />
              {transaction.attachments!.length}
            </span>
          )}
          {transaction.recurrence === "recorrente" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-glass-ink/10 px-1.5 py-0.5 text-[10.5px] font-bold text-glass-sub">
              <Repeat className="size-2.5" strokeWidth={2.6} />
              {frequencyLabel(
                transaction.frequency,
                transaction.frequencyInterval,
              )}
            </span>
          )}
          {transaction.recurrence === "parcelada" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-glass-ink/10 px-1.5 py-0.5 text-[10.5px] font-bold text-glass-sub">
              <Layers className="size-2.5" strokeWidth={2.6} />
              {transaction.currentInstallment ?? 1}/{transaction.installments ?? 2}
            </span>
          )}
        </p>
        {showDraftOnCard && (
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-glass-sub">
            {transaction.note}
          </p>
        )}
        {paymentLabel && paymentStatus && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-xl border px-2 py-1 text-[10.5px] font-extrabold tracking-tight",
                paymentStatus === "paid"
                  ? "border-[#1FBF4F]/30 border-l-2 border-l-[#1FBF4F] bg-[#1FBF4F]/15 text-[#168A39]"
                  : "border-[#FF9F0A]/35 border-l-2 border-l-[#FF9F0A] bg-[#FF9F0A]/15 text-[#B56B00]",
              )}
            >
              {paymentStatus === "paid" ? (
                <Check className="size-2.5" strokeWidth={2.8} />
              ) : (
                <Clock3 className="size-2.5" strokeWidth={2.8} />
              )}
              {paymentLabel}
              {paymentStatus === "paid" && transaction.paymentDate && (
                <span className="font-semibold">· {shortDate(transaction.paymentDate)}</span>
              )}
            </span>

          </div>
        )}
      </div>
      <p
        className={cn(
          "amount-tabular ml-auto min-w-[78px] shrink-0 text-right text-[15px] font-bold",
          isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
        )}
      >
        {isIncome ? "+" : "−"}
        {formatCurrency(transaction.amount)}
      </p>
    </>
  );

  return (
    <>
      {swipeable && !selectable ? (
        <div className="relative isolate overflow-hidden rounded-2xl">
          <div className="absolute inset-y-0 right-0 flex w-[208px] items-stretch overflow-hidden rounded-r-2xl">
            <motion.button
              type="button"
              aria-label={primaryActionLabel}
              onClick={handlePrimaryAction}
              style={{ opacity: actionOpacity, scale: actionScale }}
              whileTap={{ scale: 0.96 }}
              className="flex w-1/2 shrink-0 items-center justify-center gap-1.5 bg-[#2F6BFF] px-2 text-[10.5px] font-bold leading-tight text-white"
            >
              {onEdit ? <Pencil className="size-3.5" /> : hasPaymentAction ? <Check className="size-3.5" /> : <Eye className="size-3.5" />}
              {primaryActionLabel}
            </motion.button>
            <motion.button
              type="button"
              aria-label={secondaryActionLabel}
              onClick={handleSecondaryAction}
              style={{ opacity: actionOpacity, scale: actionScale }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "flex w-1/2 shrink-0 items-center justify-center gap-1.5 px-2 text-[10.5px] font-bold leading-tight text-white",
                hasPaymentAction
                  ? "bg-[#2F6BFF]"
                  : isSyntheticLoan
                    ? "bg-glass-ink/60"
                    : "bg-[#E5484D]",
              )}
            >
              {hasPaymentAction ? <Check className="size-3.5" /> : <Trash2 className="size-3.5" />}
              {secondaryActionLabel}
            </motion.button>
          </div>

          <motion.div
            drag="x"
            dragConstraints={{ left: -SWIPE_DISTANCE, right: 0 }}
            dragElastic={0.12}
            dragMomentum={false}
            style={{ x }}
            onDragEnd={(_, info) => {
              const offset = info.offset.x;
              if (offset <= -SWIPE_THRESHOLD) {
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
              "relative z-10 flex w-full items-center gap-3.5 bg-[#f4f8ff] py-3 text-left transition-colors hover:bg-white/30 active:bg-white/50 dark:bg-[#0d1b3e]",
              statusAccent,
            )}
          >
            {rowContent}
          </motion.div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={handleRowActivate}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleRowActivate();
            }
          }}
          className={cn(
            "flex w-full items-center gap-3.5 bg-[#f4f8ff] py-3 text-left transition-colors hover:bg-white/30 active:bg-white/50 dark:bg-[#0d1b3e]",
            statusAccent,
          )}
        >
          {rowContent}
        </div>
      )}

      <TransactionDetailsSheet
        transaction={transaction}
        open={open}
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
