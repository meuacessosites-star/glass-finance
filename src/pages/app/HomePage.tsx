import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Settings,
} from "lucide-react";
import { Link } from "react-router";
import { HomeBalanceSettings } from "@/components/app/HomeBalanceSettings";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { TransactionRow } from "@/components/app/TransactionRow";
import { PreviousMonthDebtReminder } from "@/components/app/PreviousMonthDebtReminder";
import { useAuth } from "@/hooks/use-auth";
import { useLocalDate } from "@/hooks/use-local-date";
import { getDueTodayAlerts } from "@/lib/due-today";
import { useAppStore } from "@/lib/app-store";
import { getHomeBalance, shiftBalanceMonth } from "@/lib/home-balance";
import { cn } from "@/lib/utils";
import { formatCurrency, monthLabel, monthShortLabel } from "@/lib/mock-data";

export default function HomePage() {
  const today = useLocalDate();
  const currentMonthKey = today.slice(0, 7);
  const [balanceSettingsOpen, setBalanceSettingsOpen] = useState(false);
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const selectedMonth = chosenMonth ?? currentMonthKey;
  const { user } = useAuth();
  const {
    activeProfile,
    cards,
    transactions,
    loanReceivables,
    homeBalanceMode,
    setHomeBalanceMode,
    notifications,
  } = useAppStore();

  const calculation = getHomeBalance(
    { transactions, loanReceivables },
    selectedMonth,
    homeBalanceMode,
  );
  const {
    income,
    expense,
    balance,
    monthBalance,
    previousMonth,
    expenseChangePercent,
  } = calculation;
  const signedAmount = (value: number) =>
    `${value < 0 ? "−" : ""}${formatCurrency(value)}`;
  const recent = transactions
    .filter((item) => item.date.startsWith(`${selectedMonth}-`))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const name =
    activeProfile?.name?.trim().split(" ")[0] ||
    user?.name?.trim().split(" ")[0] ||
    "pessoa";
  const pendingCount =
    notifications.filter((n) => n.status === "pending").length +
    getDueTodayAlerts(cards, transactions, loanReceivables).length;

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
          <p className="text-[13px] text-muted-foreground">
            Bem-vinda de volta
          </p>
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

      <PreviousMonthDebtReminder
        today={today}
        referenceMonth={selectedMonth}
        sourceTransactions={transactions}
      />

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
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-glass-sub">
                {homeBalanceMode === "monthly"
                  ? "Saldo do mês"
                  : "Saldo acumulado"}
              </p>
              <button
                type="button"
                aria-label="Configurar o saldo e ver os cálculos"
                onClick={() => setBalanceSettingsOpen(true)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/60 text-glass-sub dark:bg-white/10"
              >
                <Settings className="size-[18px]" />
              </button>
            </div>
            <div className="mt-1 flex justify-start">
              <div className="flex items-center gap-0.5 rounded-full bg-white/50 px-1 py-0.5 text-glass-sub">
                <button
                  type="button"
                  aria-label="Mês anterior do saldo"
                  onClick={() =>
                    setChosenMonth(shiftBalanceMonth(selectedMonth, -1))
                  }
                  className="flex size-9 items-center justify-center rounded-full"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-[11px] font-semibold">
                  {monthShortLabel(selectedMonth)} de{" "}
                  {selectedMonth.slice(0, 4)}
                </span>
                <button
                  type="button"
                  aria-label="Próximo mês do saldo"
                  onClick={() =>
                    setChosenMonth(shiftBalanceMonth(selectedMonth, 1))
                  }
                  className="flex size-9 items-center justify-center rounded-full"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <p className="amount-tabular mt-3 break-words text-[clamp(1.8rem,8vw,2.375rem)] font-bold leading-none tracking-tight text-glass-ink">
              {signedAmount(balance)}
            </p>
            {chosenMonth !== null && (
              <button
                type="button"
                onClick={() => setChosenMonth(null)}
                className="mt-2 min-h-9 text-[12px] font-semibold text-primary"
              >
                Voltar para este mês
              </button>
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

      <HomeBalanceSettings
        open={balanceSettingsOpen}
        onOpenChange={setBalanceSettingsOpen}
        mode={homeBalanceMode}
        onModeChange={setHomeBalanceMode}
        calculation={calculation}
        selectedMonth={selectedMonth}
      />

      {/* Insight */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass flex items-center gap-4 rounded-3xl p-4"
      >
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl",
            expenseChangePercent !== null && expenseChangePercent > 0
              ? "bg-[#FF3B30]/15"
              : "bg-[#1FBF4F]/15",
          )}
        >
          <ArrowUpRight
            className={cn(
              "size-5",
              expenseChangePercent !== null && expenseChangePercent > 0
                ? "text-[#FF3B30]"
                : "text-[#1FBF4F]",
            )}
            strokeWidth={2.4}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-glass-ink">
            {expenseChangePercent === null
              ? `Resultado do mês: ${signedAmount(monthBalance)}`
              : expenseChangePercent === 0
                ? `Despesas próximas às de ${monthShortLabel(previousMonth).toLocaleLowerCase("pt-BR")}`
                : `${Math.abs(expenseChangePercent)}% ${expenseChangePercent < 0 ? "menos" : "mais"} que ${monthShortLabel(previousMonth).toLocaleLowerCase("pt-BR")}`}
          </p>
          <p className="text-[12.5px] text-glass-sub">
            {expenseChangePercent === null
              ? `Receitas menos despesas de ${monthLabel(selectedMonth)}.`
              : `Comparação das despesas registradas em Transações com ${monthLabel(previousMonth)}.`}
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
          {!recent.length && (
            <p className="glass rounded-3xl p-5 text-center text-[13px] text-glass-sub">
              Nenhuma transação neste mês.
            </p>
          )}
        </div>
      </motion.section>
    </div>
  );
}
