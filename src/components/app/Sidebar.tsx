import { preloadRoute } from '@/lib/route-preload';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Check,
  ChevronRight,
  ContactRound,
  CreditCard,
  Landmark,
  LockKeyhole,
  LogOut,
  Menu,
  PiggyBank,
  ReceiptText,
  Settings,
  Share2,
  Sparkles,
  Tags,
  Target,
  Users,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAppStore, type AppProfile } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";
import { PinUsageSelector } from "./PinUsageSelector";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfilePinGate } from "./ProfilePinGate";
import { SquircleIcon } from "./ThemeToggle";

// ---------------------------------------------------------------------------
// Slide-in sidebar (iOS settings style): navigation, an inline profile
// switcher (PIN-gated when the target profile is protected) and sign out.
// Full profile/PIN configuration lives on the Perfis screen.
// ---------------------------------------------------------------------------

const SidebarContext = createContext<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
} | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const overlay = useExclusiveOverlay({ name: "sidebar" });
  return (
    <SidebarContext.Provider
      value={{
        isOpen: overlay.open,
        open: overlay.requestOpen,
        close: () => overlay.setOpen(false),
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
        "glass glass-soft flex size-11 shrink-0 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90",
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
    to: "/dashboard/compras-cartao",
    label: "Compras no Cartão",
    desc: "Só os gastos feitos no cartão",
    icon: ReceiptText,
    color: "#0A84FF",
  },
  {
    to: "/dashboard/notificacoes",
    label: "Notificações",
    desc: "Aprove avisos dos bancos",
    icon: Bell,
    color: "#FF9500",
  },
  {
    to: "/dashboard/reservas",
    label: "Reservas",
    desc: "Dinheiro separado e rendimentos",
    icon: PiggyBank,
    color: "#AF52DE",
  },
  {
    to: "/dashboard/financiamentos",
    label: "Financiamentos",
    desc: "Parcelas e saldo devedor",
    icon: Landmark,
    color: "#5856D6",
  },
  {
    to: "/dashboard/metas",
    label: "Metas",
    desc: "Objetivos e quanto guardar",
    icon: Target,
    color: "#FF9500",
  },
  {
    to: "/dashboard/analise",
    label: "Análise",
    desc: "Perfil geral e dicas",
    icon: Sparkles,
    color: "#32ADE6",
  },
  {
    to: "/dashboard/pessoas",
    label: "Pessoas",
    desc: "Contatos e cobrança no WhatsApp",
    icon: ContactRound,
    color: "#1FBF4F",
  },
  {
    to: "/dashboard/perfis",
    label: "Perfis",
    desc: "Perfis e PIN de segurança",
    icon: Users,
    color: "#00C7BE",
  },
  {
    to: "/dashboard/conta",
    label: "Conta",
    desc: "Exportar e compartilhar",
    icon: Share2,
    color: "#8E8E93",
  },
];

export function Sidebar() {
  const { isOpen, close } = useSidebar();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { activeProfile, profiles, activeProfileId, setActiveProfile } =
    useAppStore();
  const { signOut } = useAuth();

  const [showProfiles, setShowProfiles] = useState(false);
  const [gateProfile, setGateProfile] = useState<AppProfile | null>(null);

  // Collapse the profile list whenever the sidebar closes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) setShowProfiles(false);
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const go = (to: string) => {
    close();
    navigate(to);
  };

  const handleSwitch = (profile: AppProfile) => {
    if (profile.id === activeProfileId) return;
    if (profile.data.pin) {
      setGateProfile(profile);
      return;
    }
    setActiveProfile(profile.id);
    toast(`Agora usando "${profile.name}"`);
  };

  const handleSignOut = async () => {
    close();
    await signOut();
    navigate("/");
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={close}
            className="fixed inset-0 z-[210] bg-[#0b1630]/45 backdrop-blur-[2px]"
          />
        )}
        {isOpen && (
          <motion.aside
            key="sidebar-panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="glass glass-strong fixed inset-y-2 left-2 z-[220] flex w-[286px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.9rem] bg-white p-4 dark:bg-[#202631] md:inset-y-3 md:left-3"
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
                  className="glass glass-soft flex size-11 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Active profile — expands into the profile switcher */}
              <button
                type="button"
                onClick={() => setShowProfiles((v) => !v)}
                className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-white/50 p-3 text-left transition-colors hover:bg-white/70"
              >
                <ProfileAvatar
                  profile={activeProfile}
                  className="size-11 shadow-[0_6px_16px_-4px_rgba(47,107,255,0.5)]"
                  emojiClassName="text-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-glass-ink">
                    {activeProfile?.name ?? "Meu perfil"}
                  </p>
                  <p className="text-[12px] text-glass-sub">
                    {profiles.length}{" "}
                    {profiles.length === 1 ? "perfil" : "perfis"} na conta
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0 text-glass-faint transition-transform duration-200",
                    showProfiles && "rotate-90",
                  )}
                />
              </button>

              {/* Inline profile switcher */}
              {showProfiles && (
                <div className="mt-2 space-y-0.5 rounded-2xl bg-white/30 p-1.5">
                  <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-glass-faint">
                    Trocar de perfil
                  </p>
                  {profiles.map((profile) => {
                    const active = profile.id === activeProfileId;
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => handleSwitch(profile)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
                          active ? "bg-primary/10" : "hover:bg-white/50",
                        )}
                      >
                        <ProfileAvatar
                          profile={profile}
                          className={cn(
                            "size-9",
                            active &&
                              "ring-2 ring-primary ring-offset-2 ring-offset-white/60",
                          )}
                          emojiClassName="text-base"
                        />
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate text-[14px] font-semibold",
                            active ? "text-primary" : "text-glass-ink",
                          )}
                        >
                          {profile.name}
                        </p>
                        {profile.data.pin && (
                          <LockKeyhole
                            className="size-3.5 shrink-0 text-glass-faint"
                            strokeWidth={2.4}
                          />
                        )}
                        {active && (
                          <Check
                            className="size-4 shrink-0 text-primary"
                            strokeWidth={3}
                          />
                        )}
                      </button>
                    );
                  })}
                  <div className="mt-1.5 border-t border-black/5 pt-2">
                    <PinUsageSelector compact />
                  </div>
                  <button
                    type="button"
                    onClick={() => go("/dashboard/perfis")}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/50"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-glass-ink/10">
                      <Settings className="size-4 text-glass-ink" />
                    </div>
                    <p className="text-[13.5px] font-semibold text-glass-ink">
                      Configurar perfis e PIN
                    </p>
                  </button>
                </div>
              )}

              {/* Nav */}
              <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain no-scrollbar">
                {items.map((item) => {
                  const active = pathname.startsWith(item.to);
                  return (
                    <button
                      key={item.to}
                      type="button"
                      onPointerEnter={()=>preloadRoute(item.to)} onFocus={()=>preloadRoute(item.to)} onTouchStart={()=>preloadRoute(item.to)} onClick={() => go(item.to)}
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
                className="mt-3 flex w-full shrink-0 items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-[#FF3B30]/10"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#FF3B30]/15">
                  <LogOut
                    className="size-[18px] text-[#FF3B30]"
                    strokeWidth={2.2}
                  />
                </div>
                <p className="text-[14.5px] font-semibold text-[#FF3B30]">
                  Sair da conta
                </p>
              </button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* PIN gate for protected profiles (covers the open sidebar) */}
      {gateProfile && (
        <ProfilePinGate
          profile={gateProfile}
          onVerified={() => {
            const target = gateProfile;
            setGateProfile(null);
            setActiveProfile(target.id);
            toast(`Agora usando "${target.name}"`);
          }}
          onCancel={() => setGateProfile(null)}
        />
      )}
    </>
  );
}
