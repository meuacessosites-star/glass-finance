import { Bell, Check, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import { formatCurrency, shortDate } from "@/lib/mock-data";

const bankColors: Record<string, string> = {
  Nubank: "#AF52DE",
  Inter: "#2F6BFF",
  Itaú: "#FF9500",
  Bradesco: "#FF2D55",
  Santander: "#FF3B30",
  Caixa: "#1FBF4F",
};

const fallbackCategory = { label: "Outros", color: "#8E8E93" };

export default function NotificationsPage() {
  const {
    notifications,
    categoryById,
    approveNotification,
    ignoreNotification,
    resetNotifications,
  } = useAppStore();

  const pending = notifications.filter((n) => n.status === "pending");
  const approved = notifications.filter((n) => n.status === "approved").length;
  const ignored = notifications.filter((n) => n.status === "ignored").length;
  const processed = approved + ignored;

  return (
    <div className="space-y-4">
      <SettingsHeader title="Notificações" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Avisos de compra dos bancos — filtre, revise e aprove para virar
        transação no cartão.
      </p>

      {/* Summary */}
      <div className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[22px] font-bold leading-none text-glass-ink">
              {pending.length}
            </p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-glass-sub">
              pendentes
            </p>
          </div>
          <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
          <div>
            <p className="amount-tabular text-[15px] font-bold leading-none text-[#1FBF4F]">
              {approved}
            </p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-glass-sub">
              aprovadas
            </p>
          </div>
          <div>
            <p className="amount-tabular text-[15px] font-bold leading-none text-glass-faint">
              {ignored}
            </p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-glass-sub">
              ignoradas
            </p>
          </div>
        </div>
        {processed > 0 && (
          <button
            type="button"
            onClick={() => {
              resetNotifications();
              toast("Notificações restauradas");
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-[12px] font-semibold text-glass-sub transition-colors hover:bg-black/10 active:scale-95"
          >
            <RotateCcw className="size-3.5" />
            Restaurar
          </button>
        )}
      </div>

      {/* Pending list */}
      {pending.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#FF9500]/15">
            <Bell className="size-6 text-[#FF9500]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Tudo em dia
            </p>
            <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-glass-sub">
              Nenhuma notificação pendente. Aprovadas viraram transações;
              ignoradas ficam fora do histórico.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((n) => {
            const category =
              (n.categoryId && categoryById[n.categoryId]) || fallbackCategory;
            return (
              <div
                key={n.id}
                className="glass rounded-3xl px-4 py-3.5"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-[14px] font-bold text-white"
                    style={{
                      backgroundColor: bankColors[n.bank] ?? "#8E8E93",
                    }}
                  >
                    {n.bank.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-glass-ink">
                      {n.merchant}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-glass-sub">
                      <span>{n.bank}</span>
                      <span className="text-glass-faint">·</span>
                      <span>
                        {shortDate(n.date)}
                        {n.time ? ` às ${n.time}` : ""}
                      </span>
                      <span className="text-glass-faint">·</span>
                      <span
                        className="flex items-center gap-1 font-semibold"
                        style={{ color: category.color }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        {category.label}
                      </span>
                    </p>
                  </div>
                  <p className="amount-tabular shrink-0 text-[15px] font-bold text-[#FF3B30]">
                    −{formatCurrency(n.amount)}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      approveNotification(n.id);
                      toast("Compra aprovada e adicionada", {
                        description: `${n.merchant} · ${formatCurrency(n.amount)} entrou no histórico.`,
                      });
                    }}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1FBF4F] py-2.5 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(31,191,79,0.7)] transition-all hover:brightness-105 active:scale-[0.98]"
                  >
                    <Check className="size-4" strokeWidth={2.6} />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ignoreNotification(n.id);
                      toast("Notificação ignorada");
                    }}
                    className="glass glass-soft flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-glass-sub transition-all active:scale-[0.98]"
                  >
                    <X className="size-4" strokeWidth={2.4} />
                    Ignorar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
