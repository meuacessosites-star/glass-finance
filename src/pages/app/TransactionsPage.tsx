import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ReceiptText } from "lucide-react";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { TransactionRow } from "@/components/app/TransactionRow";
import { useAppStore } from "@/lib/app-store";
import {
  dayLabel,
  formatCurrency,
  monthKey,
  monthShortLabel,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function TransactionsPage() {
  const { categories, transactions } = useAppStore();

  const allMonths = useMemo(
    () =>
      [...new Set(transactions.map((t) => monthKey(t.date)))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [transactions],
  );
  const [month, setMonth] = useState<string>(allMonths[0]);
  const [category, setCategory] = useState<string>("todas");

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => monthKey(t.date) === month)
      .filter((t) => category === "todas" || t.categoryId === category)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [month, category, transactions]);

  const expenseTotal = filtered
    .filter((t) => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const incomeTotal = filtered
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const key = dayLabel(t.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-foreground">
              Transações
            </h1>
            <p className="text-[13px] text-muted-foreground">Histórico completo de gastos e ganhos</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Month filter */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {allMonths.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMonth(key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all",
              month === key
                ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                : "glass text-glass-sub",
            )}
          >
            {monthShortLabel(key)}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        <button
          type="button"
          onClick={() => setCategory("todas")}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all",
            category === "todas"
              ? "bg-glass-ink text-white"
              : "glass text-glass-sub",
          )}
        >
          Todas
        </button>
        {categories
          .filter((c) => c.id !== "salario" && c.id !== "freelance")
          .map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
                category === c.id ? "glass text-glass-ink" : "glass-soft text-glass-faint",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.label}
            </button>
          ))}
      </div>

      {/* Summary of the filter */}
      <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <p className="text-[12.5px] text-glass-sub">
          {filtered.length} transações
        </p>
        <div className="flex items-center gap-3">
          <p className="text-[12.5px] font-bold text-[#1FBF4F]">
            +{formatCurrency(incomeTotal)}
          </p>
          <p className="text-[12.5px] font-bold text-[#FF3B30]">
            −{formatCurrency(expenseTotal)}
          </p>
        </div>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <ReceiptText className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma transação
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Nada registrado em {monthShortLabel(month)} para essa categoria.
            </p>
          </div>
        </div>
      ) : (
        grouped.map(([label, list], groupIndex) => (
          <motion.section
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.05 }}
          >
            <p className="mb-1 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {label}
            </p>
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {list.map((t) => (
                <TransactionRow key={t.id} transaction={t} showDate={false} />
              ))}
            </div>
          </motion.section>
        ))
      )}
    </div>
  );
}
