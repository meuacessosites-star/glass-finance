import { categoryById, formatCurrency, shortDate, type Transaction } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";

export function TransactionRow({
  transaction,
  showDate = true,
}: {
  transaction: Transaction;
  showDate?: boolean;
}) {
  const isIncome = transaction.amount > 0;
  const category = categoryById[transaction.categoryId] ?? categoryById.outros;

  return (
    <div className="flex items-center gap-3.5 py-3">
      <CategoryIcon categoryId={transaction.categoryId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-glass-ink">
          {transaction.title}
        </p>
        <p className="mt-0.5 text-[13px] text-glass-sub">
          {category.label}
          {showDate && ` · ${shortDate(transaction.date)}`}
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
    </div>
  );
}
