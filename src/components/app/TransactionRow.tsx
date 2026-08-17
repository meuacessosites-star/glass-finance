import { useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  Check,
  Clock3,
  Eye,
  Layers,
  MoveHorizontal,
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
const SWIPE_DISTANCE = 104;
const SWIPE_THRESHOLD = 52;

export function TransactionRow({
  transaction,
  showDate = true,
  swipeable = false,
  paymentLabel,
  paymentStatus,
  paymentActionLabel,
  onPaymentAction,
}: {
  transaction: Transaction;
  showDate?: boolean;
  swipeable?: boolean;
  paymentLabel?: "Fatura paga" | "Pago" | "Pendente";
  paymentStatus?: "paid" | "pending";
  paymentActionLabel?: string;
  onPaymentAction?: () => void;
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
    [0, SWIPE_THRESHOLD, SWIPE_DISTANCE],
    [0, 0.65, 1],
  );
  const rightActionOpacity = useTransform(
    x,
    [-SWIPE_DISTANCE, -SWIPE_THRESHOLD, 0],
    [1, 0.65, 0],
  );
  const leftActionScale = useTransform(x, [0, SWIPE_DISTANCE], [0.94, 1]);
  const rightActionScale = useTransform(x, [-SWIPE_DISTANCE, 0], [1, 0.94]);

  const closeSwipe = () => {
    animate(x, 0, { type: "spring", stiffness: 420, damping: 32 });
  };

  const snapSwipe = (direction: "left" | "right") => {
    animate(x, direction === "left" ? -SWIPE_DISTANCE : SWIPE_DISTANCE, {
      type: "spring",
      stiffness: 420,
      damping: 32,
    });
  };

  const handleRowActivate = () => {
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

  const rowContent = (
    <>
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
      {swipeable && (
        <MoveHorizontal
          aria-hidden="true"
          className="size-3 shrink-0 text-glass-faint/60"
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
      {swipeable ? (
        <div className="relative isolate overflow-hidden rounded-2xl">
          <div className="absolute inset-0 flex items-stretch justify-between">
            <motion.button
              type="button"
              aria-label={hasPaymentAction ? paymentActionLabel : "Abrir detalhes da transação"}
              onClick={hasPaymentAction ? handlePaymentAction : handleRowActivate}
              style={{ opacity: leftActionOpacity, scale: leftActionScale }}
              whileTap={{ scale: 0.96 }}
              className="flex w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-l-2xl bg-[#2F6BFF] px-2 text-[11px] font-bold text-white"
            >
              {hasPaymentAction ? <Check className="size-3.5" /> : <Eye className="size-3.5" />}
              {hasPaymentAction ? paymentActionLabel : "Detalhes"}
            </motion.button>
            <motion.button
              type="button"
              aria-label={isSyntheticLoan ? "Gerenciar em empréstimos" : "Excluir transação"}
              onClick={handleDelete}
              style={{ opacity: rightActionOpacity, scale: rightActionScale }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "flex w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-r-2xl px-2 text-[11px] font-bold text-white",
                isSyntheticLoan ? "bg-glass-ink/60" : "bg-[#E5484D]",
              )}
            >
              <Trash2 className="size-3.5" />
              {isSyntheticLoan ? "Empréstimos" : "Excluir"}
            </motion.button>
          </div>

          <motion.div
            drag="x"
            dragConstraints={{ left: -SWIPE_DISTANCE, right: SWIPE_DISTANCE }}
            dragElastic={0.12}
            dragMomentum={false}
            style={{ x }}
            onDragEnd={(_, info) => {
              const offset = info.offset.x;
              if (offset <= -SWIPE_THRESHOLD) {
                snapSwipe("left");
              } else if (offset >= SWIPE_THRESHOLD) {
                snapSwipe("right");
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
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
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
      />
    </>
  );
}
