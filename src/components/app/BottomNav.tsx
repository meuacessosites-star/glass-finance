import type { LucideIcon } from "lucide-react";
import { Home, ArrowLeftRight, Handshake, ChartPie, Plus } from "lucide-react";
import { NavLink, useLocation } from "react-router";
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

  const isActive = (to: string) =>
    to === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(to);

  return (
    <nav className="absolute inset-x-0 bottom-5 z-30 flex justify-center px-5">
      <div className="glass glass-strong flex w-full items-center justify-between rounded-[2.1rem] py-2 pl-3 pr-3">
        {tabs.slice(0, 2).map((tab) => (
          <TabButton
            key={tab.to}
            tab={tab}
            active={isActive(tab.to)}
          />
        ))}

        {/* Center add button */}
        <div className="relative flex w-16 shrink-0 justify-center">
          <button
            type="button"
            aria-label="Adicionar transação"
            onClick={onToggleAdd}
            className={cn(
              "absolute -top-7 flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-[#5b9dff] to-[#2f6bff] text-white shadow-[0_10px_24px_-6px_rgba(47,107,255,0.55),inset_0_1px_0_rgba(255,255,255,0.5)] ring-4 ring-white/80 transition-transform duration-300 active:scale-90 dark:ring-[#f4f8ff]/80",
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
          />
        ))}
      </div>
    </nav>
  );
}

function TabButton({
  tab,
  active,
}: {
  tab: { to: string; label: string; icon: LucideIcon };
  active: boolean;
}) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      className={cn(
        "flex w-16 flex-col items-center gap-1 rounded-2xl py-1.5 transition-colors duration-200",
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
