import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { ChevronDown, ReceiptText, X } from "lucide-react";
import type { getInvoiceSummary } from "@/lib/card-invoice-summary";
import { formatCurrency, monthShortLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function CardStatementSummary({
  summary,
  cardName,
  last4,
  periodLabel,
  displayedTotal,
  includeBorrowed,
  allMonths,
  onClose,
}: {
  summary: ReturnType<typeof getInvoiceSummary>;
  cardName: string;
  last4: string;
  periodLabel: string;
  displayedTotal: number;
  includeBorrowed: boolean;
  allMonths: boolean;
  onClose: () => void;
}) {
  const formatCurrency = usePrivateCurrency();
  return (
    <section aria-label={`Extrato e resumo de ${cardName}`} className="glass rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-glass-sub">
            <ReceiptText aria-hidden="true" className="size-4 shrink-0 text-primary" />
            {allMonths ? "Histórico de compras" : "Extrato do período"}
          </h2>
          <p className="mt-1 text-[15px] font-bold text-glass-ink [overflow-wrap:anywhere]">{cardName} ····{last4}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-glass-sub [overflow-wrap:anywhere]">
            {periodLabel} · {includeBorrowed ? "Inclui cartão emprestado" : "Só compras pessoais"}
          </p>
        </div>
        <button type="button" aria-label="Fechar extrato e voltar aos cartões" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/60 text-glass-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-white/10">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid min-w-0 grid-cols-2 gap-3 border-t border-glass-ink/10 pt-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-glass-sub">Falta pagar no período</p>
          <p aria-live="polite" aria-atomic="true" className={cn("amount-tabular mt-1 break-words text-[24px] font-bold leading-tight tracking-tight", summary.openAmount > 0 ? "text-[#B42338] dark:text-[#FF98A5]" : "text-[#166534] dark:text-[#69D696]")}>{formatCurrency(summary.openAmount)}</p>
          {allMonths && <p className="mt-1 text-[10px] text-glass-sub">Saldo de {periodLabel}</p>}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[11px] font-semibold text-glass-sub">Total do extrato</p>
          <p aria-live="polite" aria-atomic="true" className="amount-tabular mt-1 break-words text-[20px] font-bold leading-tight tracking-tight text-glass-ink">{displayedTotal > 0 ? "−" : ""}{formatCurrency(displayedTotal)}</p>
          <p className="mt-1 text-[10px] text-glass-sub">{allMonths ? "Todos os meses da busca" : "Compras exibidas abaixo"}</p>
        </div>
      </div>

      <details className="group mt-3 border-t border-glass-ink/10">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-semibold text-primary focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          Composição da fatura no período
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="space-y-2 pb-2 text-[11px]">
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-glass-sub">Total das faturas</dt><dd className="amount-tabular font-semibold text-glass-ink">{formatCurrency(summary.invoiceTotal)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-glass-sub">Já pago ao banco</dt><dd className="amount-tabular font-semibold text-[#166534] dark:text-[#69D696]">{formatCurrency(summary.paidAmount)}</dd></div>
          {summary.monthly.length > 1 && summary.monthly.map((row) => <div key={row.month} className="flex flex-wrap justify-between gap-2 border-t border-glass-ink/5 pt-2"><dt className="text-glass-sub">Falta pagar · {monthShortLabel(row.month)} {row.month.slice(0, 4)}</dt><dd className="amount-tabular font-semibold text-glass-ink">{formatCurrency(row.openAmount)}</dd></div>)}
        </dl>
      </details>
      <p className="text-[10px] leading-relaxed text-glass-sub">
        {allMonths ? "No histórico, cada compra pessoal aparece pelo valor completo e o cartão emprestado por parcela. " : "O extrato mostra as parcelas com vencimento neste período. "}
        A busca e a categoria mudam só o total do extrato; o valor que falta pagar continua sendo o da fatura no período.
      </p>
    </section>
  );
}
