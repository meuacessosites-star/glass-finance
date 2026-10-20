import { CalendarDays, CreditCard } from "lucide-react";
import { formatCurrency, monthShortLabel } from "@/lib/mock-data";
import type { getInvoiceSummary, InvoiceStatusFilter } from "@/lib/card-invoice-summary";
import { cn } from "@/lib/utils";

export function CardInvoiceSummary({ summary, periodLabel, status, cardName, includeBorrowed, compact = false }: {
  summary: ReturnType<typeof getInvoiceSummary>; periodLabel: string; status: InvoiceStatusFilter; cardName?: string; includeBorrowed: boolean; compact?: boolean;
}) {
  const paidOnly = status === "paid";
  return (
    <section aria-label="Resumo mensal dos cartões" className="glass rounded-3xl px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-glass-sub"><CreditCard className="size-3.5 shrink-0 text-primary" />{paidOnly ? "Já pago no período" : "Falta pagar no período"}</p>
          <p aria-live="polite" aria-atomic="true" className={cn("amount-tabular mt-1 break-words text-[26px] font-bold leading-tight tracking-tight", paidOnly ? "text-[#166534] dark:text-[#69D696]" : "text-[#B42338] dark:text-[#FF98A5]")}>
            {formatCurrency(paidOnly ? summary.paidAmount : summary.openAmount)}
          </p>
        </div>
        <div className="max-w-[48%] text-right text-[10px] leading-relaxed text-glass-sub">
          <p className="font-semibold [overflow-wrap:anywhere]">{periodLabel}</p>
          <p>{cardName ?? `Soma de ${summary.cardCount} ${summary.cardCount === 1 ? "cartão" : "cartões"}`}</p>
          <p>{includeBorrowed ? "Com cartão emprestado" : "Só compras pessoais"}</p>
          {status !== "all" && <p className="font-semibold text-primary">{paidOnly ? "Faturas pagas" : "Faturas em aberto"}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-glass-ink/10 pt-2 text-[10px] text-glass-sub">
        <span>Faturas <strong className="font-semibold text-glass-ink">{formatCurrency(summary.invoiceTotal)}</strong></span>
        <span>Já pago <strong className="font-semibold text-[#166534] dark:text-[#69D696]">{formatCurrency(summary.paidAmount)}</strong></span>
      </div>
      {!compact && summary.monthly.length > 1 && <div className="mt-2 space-y-1.5 border-t border-glass-ink/10 pt-2">
        {summary.monthly.map((row) => <div key={row.month} className="flex items-center justify-between gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-glass-sub"><CalendarDays className="size-3.5 text-primary" />{monthShortLabel(row.month)} {row.month.slice(0, 4)}</span>
          <strong className={cn("amount-tabular", paidOnly ? "text-[#166534] dark:text-[#69D696]" : "text-[#B42338] dark:text-[#FF98A5]")}>{formatCurrency(paidOnly ? row.paidAmount : row.openAmount)}</strong>
        </div>)}
      </div>}
    </section>
  );
}
