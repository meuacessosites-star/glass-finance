import { useState } from "react";
import { Layers, Paperclip, Repeat } from "lucide-react";
import {
  FREQUENCY_LABELS,
  formatCurrency,
  shortDate,
  type Transaction,
} from "@/lib/mock-data";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { TransactionDetailsSheet } from "./TransactionDetailsSheet";

const fallback = { label: "Outros", color: "#8E8E93", icon: "outros" };

export function TransactionRow({
  transaction,
  showDate = true,
}: {
  transaction: Transaction;
  showDate?: boolean;
}) {
  const { categoryById } = useAppStore();
  const [open, setOpen] = useState(false);
  const isIncome = transaction.amount > 0;
  const category = categoryById[transaction.categoryId] ?? fallback;
  const hasAttachments = (transaction.attachments?.length ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3.5 py-3 text-left transition-colors hover:bg-white/30 active:bg-white/50"
      >
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
                {FREQUENCY_LABELS[transaction.frequency ?? "mensal"]}
              </span>
            )}
            {transaction.recurrence === "parcelada" && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-glass-ink/10 px-1.5 py-0.5 text-[10.5px] font-bold text-glass-sub">
                <Layers className="size-2.5" strokeWidth={2.6} />
                {transaction.currentInstallment ?? 1}/{transaction.installments ?? 2}
              </span>
            )}
          </p>
        </div>
        <p
          className={cn(
            "amount-tabular shrink-0 text-[15px] font-bold",
            isIncome ? "text-[#1FBF4F]" : "text-glass-ink",
          )}
        >
          {isIncome ? "+" : "−"}
          {formatCurrency(transaction.amount)}
        </p>
      </button>

      <TransactionDetailsSheet
        transaction={transaction}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
