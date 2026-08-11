import { Check } from "lucide-react";
import { useAppStore, type PinUsage } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const OPTIONS: { id: PinUsage; label: string; desc: string }[] = [
  {
    id: "switch",
    label: "Só ao trocar de perfil",
    desc: "O PIN é pedido apenas ao entrar em um perfil protegido. Abrir o app não pede senha.",
  },
  {
    id: "open",
    label: "Também ao entrar no app",
    desc: "Além da troca de perfil, o app pede o PIN ao abrir com o perfil ativo.",
  },
];

/** "Uso do PIN" picker: when the PIN is asked — only on profile switch, or
 *  also when entering the app. Shared by the sidebar and the Perfis screen. */
export function PinUsageSelector({ compact = false }: { compact?: boolean }) {
  const { pinUsage, setPinUsage } = useAppStore();
  return (
    <div>
      <p
        className={cn(
          "text-[12px] font-semibold uppercase tracking-wide",
          compact ? "text-glass-faint" : "text-glass-sub",
        )}
      >
        Uso do PIN
      </p>
      <div className="mt-2 space-y-1.5">
        {OPTIONS.map((option) => {
          const active = pinUsage === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setPinUsage(option.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-2xl px-3 py-2 text-left transition-colors",
                active
                  ? "bg-primary/10"
                  : compact
                    ? "hover:bg-white/50"
                    : "glass glass-soft hover:brightness-105",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-black/15 text-transparent dark:border-black/30",
                )}
              >
                <Check className="size-3" strokeWidth={3.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[13.5px] font-semibold",
                    active ? "text-primary" : "text-glass-ink",
                  )}
                >
                  {option.label}
                </span>
                {!compact && (
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-glass-sub">
                    {option.desc}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
