import { createContext, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  CreditCard,
  LogOut,
  Menu,
  Tags,
  Users,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { SquircleIcon } from "./ThemeToggle";

// ---------------------------------------------------------------------------
// Slide-in sidebar (iOS settings style) with the personalization areas:
// Categorias, Cartões, Perfis and PIN — plus the active profile header and
// sign out. Rendered inside the phone screen by the Dashboard shell.
// ---------------------------------------------------------------------------

const SidebarContext = createContext<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
} | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

/** Round hamburger button pages render to open the sidebar. */
export function SidebarTrigger({ className }: { className?: string }) {
  const { open } = useSidebar();
  return (
    <button
      type="button"
      aria-label="Abrir menu"
      onClick={open}
      className={cn(
        "glass glass-soft flex size-9 shrink-0 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90",
        className,
      )}
    >
      <Menu className="size-[17px]" strokeWidth={2.3} />
    </button>
  );
}

const items: {
  to: string;
  label: string;
  desc: string;
  icon: typeof Tags;
  color: string;
}[] = [
  {
    to: "/dashboard/categorias",
    label: "Categorias",
    desc: "Personalize seus gastos",
    icon: Tags,
    color: "#2F6BFF",
  },
  {
    to: "/dashboard/cartoes",
    label: "Cartões",
    desc: "Adicione e gerencie cartões",
    icon: CreditCard,
    color: "#AF52DE",
  },
  {
    to: "/dashboard/perfis",
    label: "Perfis",
    desc: "Perfis e PIN de segurança",
    icon: Users,
    color: "#00C7BE",
  },
];

export function Sidebar() {
  const { isOpen, close } = useSidebar();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeProfile, profiles } = useAppStore();
  const { signOut } = useAuth();

  const go = (to: string) => {
    close();
    navigate(to);
  };

  const handleSignOut = async () => {
    close();
    await signOut();
    navigate("/");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="absolute inset-0 z-40 bg-[#0b1630]/45 backdrop-blur-[2px]"
          />
          <motion.aside
            key="sidebar-panel"
            initial={{ x: "-105%" }}
            animate={{ x: 0 }}
            exit={{ x: "-105%" }}
            transition={{ type: "spring", damping: 30, stiffness: 330 }}
            className="glass glass-strong absolute inset-y-3 left-3 z-50 flex w-[286px] flex-col overflow-hidden rounded-[1.9rem] p-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold tracking-tight text-glass-ink">
                Menu
              </p>
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={close}
                className="glass glass-soft flex size-8 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Active profile */}
            <button
              type="button"
              onClick={() => go("/dashboard/perfis")}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-white/50 p-3 text-left transition-colors hover:bg-white/70"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-lg shadow-[0_6px_16px_-4px_rgba(47,107,255,0.5)]">
                {activeProfile?.emoji ?? "👤"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-glass-ink">
                  {activeProfile?.name ?? "Meu perfil"}
                </p>
                <p className="text-[12px] text-glass-sub">
                  {profiles.length}{" "}
                  {profiles.length === 1 ? "perfil" : "perfis"} na conta
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-glass-faint" />
            </button>

            {/* Nav */}
            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto no-scrollbar">
              {items.map((item) => {
                const active = pathname.startsWith(item.to);
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => go(item.to)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors",
                      active ? "bg-primary/10" : "hover:bg-white/50",
                    )}
                  >
                    <SquircleIcon
                      icon={item.icon}
                      color={item.color}
                      size="size-10"
                      iconSize="size-[18px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[14.5px] font-semibold",
                          active ? "text-primary" : "text-glass-ink",
                        )}
                      >
                        {item.label}
                      </p>
                      <p className="truncate text-[12px] text-glass-sub">
                        {item.desc}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-glass-faint" />
                  </button>
                );
              })}
            </nav>

            {/* Sign out */}
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-[#FF3B30]/10"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#FF3B30]/15">
                <LogOut className="size-[18px] text-[#FF3B30]" strokeWidth={2.2} />
              </div>
              <p className="text-[14.5px] font-semibold text-[#FF3B30]">
                Sair da conta
              </p>
            </button>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
