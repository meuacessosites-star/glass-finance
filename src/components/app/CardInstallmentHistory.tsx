import { AlertTriangle, Check, Clock, Layers } from "lucide-react";
import type { CardInstallment } from "@/lib/card-installments";
import { formatCurrency, shortDate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const presentation = {
  paid: { label: "Paga", icon: Check, row: "border-green-200 bg-green-50/70 dark:border-green-900 dark:bg-green-950/30", circle: "bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-200", text: "rounded-full bg-[#1FBF4F] px-2 py-0.5 text-white" },
  pending: { label: "Pendente", icon: Clock, row: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/25", circle: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200", text: "text-amber-700 dark:text-amber-300" },
  overdue: { label: "Vencida", icon: AlertTriangle, row: "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30", circle: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200", text: "text-red-700 dark:text-red-300" },
  scheduled: { label: "Agendada", icon: Clock, row: "border-slate-200 bg-white/70 dark:border-white/10 dark:bg-white/5", circle: "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300", text: "text-slate-500 dark:text-slate-300" },
};

export function CardInstallmentHistory({ installments, accent }: { installments: CardInstallment[]; accent: string }) {
  if (!installments.length) return null;
  return (
    <section aria-label="Histórico de parcelas" className="mt-4 rounded-3xl border border-[#D8D4EC] bg-[#F7F5FF]/90 p-3.5 dark:border-[#483D61] dark:bg-[#19172B]">
      <h4 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-glass-ink dark:text-slate-100">
        <Layers className="size-[18px] shrink-0" style={{ color: accent }} />Histórico de parcelas
      </h4>
      <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-0.5">
        {installments.map((item) => {
          const view = presentation[item.status];
          const Icon = view.icon;
          return (
            <li key={item.number} aria-current={item.isCurrent ? "step" : undefined} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border p-3", view.row)}>
              <span className={cn("flex size-8 items-center justify-center rounded-full", view.circle)}><Icon className="size-4" strokeWidth={2.3} /></span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold leading-4 text-glass-ink dark:text-slate-100">{item.total === 1 ? "Parcela única" : `${item.number}ª parcela de ${item.total}`}</p>
                <p className={cn("mt-1 text-[11px] font-medium leading-4 text-glass-sub dark:text-slate-300", item.dueDate && "whitespace-nowrap")}>
                  {item.dueDate ? <>{item.status === "overdue" ? "Venceu" : "Vence"} em <time dateTime={item.dueDate} title={item.dueDate.split("-").reverse().join("/")}>{shortDate(item.dueDate)}</time></> : "Vencimento não informado"}
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-end gap-1">
                <p className="amount-tabular whitespace-nowrap text-[12px] font-bold text-glass-ink dark:text-slate-100">{formatCurrency(item.amount)}</p>
                <span className={cn("text-[10.5px] font-bold", view.text)}>{view.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {installments.some((item) => !item.dueDate) && <p className="mt-3 text-[11px] leading-4 text-glass-sub dark:text-slate-300">Cadastre o fechamento e o vencimento do cartão para exibir as datas das parcelas.</p>}
    </section>
  );
}
