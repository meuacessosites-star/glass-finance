import { useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  Check,
  Clock3,
  Eye,
  Layers,
  Pencil,
  MoreHorizontal,
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
  const isSyntheticLoan = transaction.id.startsWith("loan-receivable-");
  const hasPaymentAction = Boolean(paymentActionLabel && onPaymentAction);
  const leftActionOpacity = useTransform(
    x,
    [0, -SWIPE_THRESHOLD, -SWIPE_DISTANCE],
    [0, 0.7, 1],
  );
  const leftActionScale = useTransform(x, [0, -SWIPE_DISTANCE], [0.96, 1]);

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
      <CategoryIcon categoryId={transaction.categoryId} />
      <div className="min-w-0 flex-1">
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
        {paymentLabel && paymentStatus && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                paymentStatus === "paid"
                  ? "bg-[#1FBF4F]/10 text-[#168A39]"
                  : "bg-[#FF9F0A]/10 text-[#B56B00]",
              )}
            >
              {paymentStatus === "paid" ? (
                <Check className="size-2.5" strokeWidth={2.8} />
              ) : (
                <Clock3 className="size-2.5" strokeWidth={2.8} />
              )}
              {paymentLabel}
            </span>

          </div>
        )}
      </div>
      {swipeable && !selectable && (
        <MoreHorizontal
          aria-hidden="true"
          className="size-4 shrink-0 text-glass-faint/60"
        />
      )}
      <p
        className={cn(
          "amount-tabular shrink-0 text-[15px] font-bold",
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
          <div className="absolute inset-y-0 left-0 flex w-[208px] items-stretch overflow-hidden rounded-l-2xl">
            <motion.button
              type="button"
              aria-label={primaryActionLabel}
              onClick={handlePrimaryAction}
              style={{ opacity: leftActionOpacity, scale: leftActionScale }}
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
              style={{ opacity: leftActionOpacity, scale: leftActionScale }}
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
            className="relative z-10 flex w-full items-center gap-3.5 bg-transparent py-3 text-left transition-colors hover:bg-white/30 active:bg-white/50"
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
          className="flex w-full items-center gap-3.5 py-3 text-left transition-colors hover:bg-white/30 active:bg-white/50"
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
