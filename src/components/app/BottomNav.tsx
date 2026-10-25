import { preloadRoute } from '@/lib/route-preload';
import { useMemo } from "react";
import {
  ArrowLeftRight,
  ChartPie,
  Handshake,
  Home,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { getTransactionPaymentStatus } from "@/lib/transaction-status";
import { countUnpaidTransactions } from "@/lib/transaction-view";
import { selectLoanReceivablesForMonth } from "@/lib/loan-repayments";
import { useNavigationPendingCount } from "./NavigationPendingContext";
import { useAppStore } from "@/lib/app-store";
import { useLocalDate } from "@/hooks/use-local-date";
import { cn } from "@/lib/utils";

const tabs: {
  to: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/dashboard/transacoes", label: "Transações", icon: ArrowLeftRight },
  { to: "/dashboard/emprestimos", label: "Empréstimos", icon: Handshake },
  { to: "/dashboard/relatorios", label: "Relatórios", icon: ChartPie },
];

export function BottomNav({
  addOpen,
  onToggleAdd,
}: {
  addOpen: boolean;
  onToggleAdd: () => void;
}) {
  const { pathname } = useLocation();
  const { cards, visibleTransactions, loanReceivables } = useAppStore();
  const today = useLocalDate();
  const defaultCounts = useMemo(
    () => ({
      transactions: countUnpaidTransactions(visibleTransactions.filter((item) => item.date.startsWith(`${today.slice(0, 7)}-`)), (item) => getTransactionPaymentStatus(item, cards, loanReceivables, today)),
      loans: selectLoanReceivablesForMonth(loanReceivables, today.slice(0, 7)).filter((item) => item.operationType !== "card" && item.status !== "paid").length,
    }),
    [cards, loanReceivables, visibleTransactions, today],
  );
  const transactionPendingCount = useNavigationPendingCount("transactions", defaultCounts.transactions);
  const loanPendingCount = useNavigationPendingCount("loans", defaultCounts.loans);

  const isActive = (to: string) =>
    to === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(to);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 md:px-5">
      <div className="pointer-events-auto glass glass-strong flex w-full max-w-[640px] items-center justify-between rounded-[1.8rem] px-1.5 py-1.5 sm:rounded-[2.1rem] sm:px-3 sm:py-2">
        {tabs.slice(0, 2).map((tab) => (
          <TabButton
            key={tab.to}
            tab={tab}
            active={isActive(tab.to)}
            pendingCount={tab.to === "/dashboard/transacoes" ? transactionPendingCount : 0}
          />
        ))}

        {/* Center add button */}
        <div className="relative flex w-14 shrink-0 justify-center sm:w-16">
          <button
            type="button"
            aria-label="Adicionar transação"
            onClick={onToggleAdd}
            className={cn(
              "absolute -top-[1.625rem] flex size-[3.25rem] items-center justify-center rounded-full bg-gradient-to-b from-[#5b9dff] to-[#2f6bff] text-white shadow-[0_10px_24px_-6px_rgba(47,107,255,0.55),inset_0_1px_0_rgba(255,255,255,0.5)] ring-4 ring-white/80 transition-transform duration-300 active:scale-90 dark:ring-[#17263c]/95",
              addOpen && "rotate-45",
            )}
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </button>
        </div>

        {tabs.slice(2).map((tab) => (
          <TabButton
            key={tab.to}
            tab={tab}
            active={isActive(tab.to)}
            pendingCount={tab.to === "/dashboard/emprestimos" ? loanPendingCount : 0}
          />
        ))}
      </div>
    </nav>
  );
}

function TabButton({
  tab,
  active,
  pendingCount = 0,
}: {
  tab: { to: string; label: string; icon: LucideIcon };
  active: boolean;
  pendingCount?: number;
}) {
  const Icon = tab.icon;
  const badgeLabel = pendingCount > 9 ? "9+" : String(pendingCount);
  return (
    <NavLink
      to={tab.to}
      onPointerEnter={()=>preloadRoute(tab.to)} onFocus={()=>preloadRoute(tab.to)} onTouchStart={()=>preloadRoute(tab.to)}
      aria-label={pendingCount > 0 ? `${tab.label}: ${pendingCount} pendência(s)` : tab.label}
      className={cn(
        "relative flex min-h-11 w-14 flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors duration-200 sm:w-16 sm:gap-1 sm:py-2",
        active ? "bg-primary/10" : "hover:bg-primary/5",
      )}
    >
      <Icon
        className={cn(
          "size-[21px] transition-colors duration-200",
          active ? "text-primary" : "text-glass-faint",
        )}
        strokeWidth={active ? 2.4 : 2}
      />
      {pendingCount > 0 && (
        <span
          aria-live="polite"
          className="absolute right-1 top-0 flex min-w-4 items-center justify-center rounded-full bg-[#FF9500] px-1 text-[9px] font-bold leading-4 text-white shadow-sm"
        >
          {badgeLabel}
        </span>
      )}
      <span
        className={cn(
          "text-[10px] font-semibold leading-none transition-colors duration-200",
          active ? "text-primary" : "text-glass-faint",
        )}
      >
        {tab.label}
      </span>
    </NavLink>
  );
}
