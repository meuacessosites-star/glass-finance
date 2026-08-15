import { motion } from "framer-motion";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { TransactionRow } from "@/components/app/TransactionRow";
import { useAuth } from "@/hooks/use-auth";
import { useAppStore } from "@/lib/app-store";
import {
  currentMonthKey,
  formatCurrency,
  monthLabel,
  monthShortLabel,
  monthTotals,
  openingBalance,
} from "@/lib/mock-data";

export default function HomePage() {
  const { user } = useAuth();
  const { activeProfile, transactions } = useAppStore();

  const { income, expense } = monthTotals(transactions, currentMonthKey);
  const balance = openingBalance + income - expense;
  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const name =
    activeProfile?.name?.trim().split(" ")[0] ||
    user?.name?.trim().split(" ")[0] ||
    "pessoa";
  const savingsPct = 12;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <SidebarTrigger />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">Bem-vinda de volta</p>
          <p className="truncate text-[17px] font-bold tracking-tight text-foreground">
            Olá, {name} 👋
          </p>
        </div>
        <ThemeToggle />
      </motion.header>

      {/* Balance hero */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <div className="glass glass-strong relative overflow-hidden rounded-[2rem] p-5">
          <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[#5b9dff]/25 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-40 w-40 rounded-full bg-[#7fe0cd]/25 blur-2xl" />

          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-glass-sub">
                Saldo atual
              </p>
              <span className="rounded-full bg-white/50 px-2.5 py-1 text-[11px] font-semibold text-glass-sub">
                {monthShortLabel(currentMonthKey)} de 2026
              </span>
            </div>
            <p className="amount-tabular mt-2 text-[38px] font-bold leading-none tracking-tight text-glass-ink">
              {formatCurrency(balance)}
            </p>

            <div className="mt-5 flex items-center gap-6 border-t border-white/40 pt-4">
              <div>
                <p className="flex items-center gap-1 text-[12px] font-medium text-glass-sub">
                  <TrendingUp className="size-3.5 text-[#1FBF4F]" />
                  Receitas
                </p>
                <p className="amount-tabular mt-1 text-[16px] font-bold text-[#1FBF4F]">
                  +{formatCurrency(income)}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[12px] font-medium text-glass-sub">
                  <TrendingDown className="size-3.5 text-[#FF3B30]" />
                  Despesas
                </p>
                <p className="amount-tabular mt-1 text-[16px] font-bold text-[#FF3B30]">
                  −{formatCurrency(expense)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Insight */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass flex items-center gap-4 rounded-3xl p-4"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#1FBF4F]/15">
          <ArrowUpRight className="size-5 text-[#1FBF4F]" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-glass-ink">
            {savingsPct}% menos que julho
          </p>
          <p className="text-[12.5px] text-glass-sub">
            Suas despesas caíram em {monthLabel(currentMonthKey).split(" ")[0]}. Continue assim!
          </p>
        </div>
      </motion.section>

      {/* Recent transactions */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">
            Transações recentes
          </h2>
          <Link
            to="/dashboard/transacoes"
            className="text-[13px] font-semibold text-primary"
          >
            Ver todas
          </Link>
        </div>
        <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
          {recent.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      </motion.section>
    </div>
  );
}
