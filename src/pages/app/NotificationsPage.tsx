import { Bell, CalendarDays, Check, RotateCcw, X } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import { formatCurrency, shortDate } from "@/lib/mock-data";
import { getCardBillingReminders } from "@/lib/card-billing";
import { useLocalDate } from "@/hooks/use-local-date";
import { getDueTodayAlerts } from "@/lib/due-today";

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
  const navigate = useNavigate();
  useLocalDate();
  const {
    cards,
    visibleTransactions,
    loanReceivables,
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
  const cardReminders = getCardBillingReminders(cards, visibleTransactions);
  const otherDue = getDueTodayAlerts(cards, visibleTransactions, loanReceivables).filter((item) => item.kind !== "invoice");

  return (
    <div className="space-y-4">
      <SettingsHeader title="Notificações" />
      <section className="space-y-3" aria-label="Avisos das faturas">
        <div className="px-1">
          <h2 className="text-[16px] font-bold text-glass-ink">Faturas dos cartões</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-glass-sub">Avisos pelo fechamento e vencimento de cada cartão. Atualizados ao abrir o app e enquanto ele estiver aberto.</p>
        </div>
        {cardReminders.length === 0 ? <p className="glass rounded-2xl px-4 py-4 text-[13px] text-glass-sub">Nenhuma fatura pendente com datas cadastradas.</p> : cardReminders.map((item) => (
          <article key={item.id} className="glass rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-glass-ink">{item.cardName} ···· {item.last4}</p>
                <p className="mt-1 text-[12px] font-semibold text-glass-sub">Fechamento {shortDate(item.closingDate)} · Vencimento {shortDate(item.dueDate)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${item.phase === "overdue" ? "bg-red-100 text-red-800" : item.phase === "due" ? "bg-[#FF9F0A] text-[#4A2A00]" : item.phase === "closing" ? "bg-blue-100 text-blue-900" : "bg-white/70 text-glass-sub"}`}>{item.phase === "overdue" ? "Em atraso" : item.phase === "due" ? "Vence hoje" : item.phase === "closing" ? "Fecha hoje" : "Agendada"}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="amount-tabular text-[18px] font-bold text-glass-ink">{formatCurrency(item.amount)}</p>
              <button className="flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary" onClick={() => navigate("/dashboard/compras-cartao", { state: { cardId: item.cardId, invoiceMonth: item.month } })}><CalendarDays className="size-4" />Ver fatura</button>
            </div>
          </article>
        ))}
      </section>
      {otherDue.length > 0 && <section className="space-y-2" aria-label="Outros vencimentos">
        <h2 className="px-1 text-[16px] font-bold text-glass-ink">Contas a vencer hoje e vencidas</h2>
        {otherDue.map((item) => <button key={item.id} onClick={() => navigate(item.kind === "loan" ? "/dashboard/emprestimos" : "/dashboard/transacoes")} className="glass flex min-h-12 w-full items-center gap-3 rounded-2xl p-3 text-left text-[12px] font-semibold text-glass-ink"><Bell className="size-4 shrink-0 text-primary" />{item.label}</button>)}
      </section>}
      <h2 className="px-1 pt-2 text-[16px] font-bold text-glass-ink">Compras para revisar</h2>
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
