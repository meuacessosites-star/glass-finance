import { motion } from "framer-motion";
import { ArrowUpRight, Bell, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { TransactionRow } from "@/components/app/TransactionRow";
import { PreviousMonthDebtReminder } from "@/components/app/PreviousMonthDebtReminder";
import { useAuth } from "@/hooks/use-auth";
import { useLocalDate } from "@/hooks/use-local-date";
import { getDueTodayAlerts } from "@/lib/due-today";
import { useAppStore } from "@/lib/app-store";
import {
  formatCurrency,
  monthLabel,
  monthShortLabel,
  monthTotals,
  openingBalance,
} from "@/lib/mock-data";

export default function HomePage() {
  const today = useLocalDate();
  const currentMonthKey = today.slice(0, 7);
  const { user } = useAuth();
  const { activeProfile, cards, visibleTransactions, loanReceivables, reserves, reservesInBalance, notifications } =
    useAppStore();

  const { income, expense } = monthTotals(visibleTransactions, currentMonthKey);
  const balance = openingBalance + income - expense;
  const reservesTotal = reserves.reduce((s, r) => s + r.amount, 0);
  // Reservas aparecem junto com o saldo (total) ou ficam só na aba Reservas
  // (saldo disponível = total − reservado).
  const shownBalance = reservesInBalance
    ? balance
    : Math.max(0, balance - reservesTotal);
  const recent = [...visibleTransactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const name =
    activeProfile?.name?.trim().split(" ")[0] ||
    user?.name?.trim().split(" ")[0] ||
    "pessoa";
  const savingsPct = 12;
  const pendingCount = notifications.filter((n) => n.status === "pending").length + getDueTodayAlerts(cards, visibleTransactions, loanReceivables).length;

  return (
    <div className="space-y-5 pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-0">
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
        <Link
          to="/dashboard/notificacoes"
          aria-label={`Ver notificações${pendingCount > 0 ? ` (${pendingCount} pendentes)` : ""}`}
          className="glass glass-soft relative flex size-11 shrink-0 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90"
        >
          <Bell className="size-[17px]" strokeWidth={2.3} />
          {pendingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[9.5px] font-bold leading-none text-white">
              {pendingCount}
            </span>
          )}
        </Link>
        <ThemeToggle />
      </motion.header>

      <PreviousMonthDebtReminder today={today} />

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
                {reservesInBalance ? "Saldo atual" : "Saldo disponível"}
              </p>
              <span className="rounded-full bg-white/50 px-2.5 py-1 text-[11px] font-semibold text-glass-sub">
                {monthShortLabel(currentMonthKey)} de {currentMonthKey.slice(0, 4)}
              </span>
            </div>
            <p className="amount-tabular mt-2 text-[38px] font-bold leading-none tracking-tight text-glass-ink">
              {formatCurrency(shownBalance)}
            </p>
            {!reservesInBalance && reservesTotal > 0 && (
              <p className="mt-1.5 text-[12px] font-semibold text-[#17a443]">
                {formatCurrency(reservesTotal)} guardados em reservas
              </p>
            )}

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
        <div className="space-y-2 py-1.5">
          {recent.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      </motion.section>
    </div>
  );
}
