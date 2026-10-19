import { useId, useMemo, useState } from "react";
import { BellRing, ChevronDown, CreditCard } from "lucide-react";
import { Link } from "react-router";
import { useAppStore } from "@/lib/app-store";
import { formatCurrency, monthLabel, type Transaction } from "@/lib/mock-data";
import { getPreviousMonthDebts } from "@/lib/previous-month-debts";
import { TransactionRow } from "./TransactionRow";

export function PreviousMonthDebtReminder({ today, referenceMonth, sourceTransactions }: { today: string; referenceMonth?: string; sourceTransactions?: Transaction[] }) {
  const { cards, visibleTransactions, loanReceivables, setTransactionPaymentStatus } = useAppStore();
  const transactions = sourceTransactions ?? visibleTransactions;
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const { items, total } = useMemo(
    () => getPreviousMonthDebts(cards, transactions, loanReceivables, today, referenceMonth),
    [cards, transactions, loanReceivables, today, referenceMonth],
  );
  if (!items.length) return null;

  return (
    <section aria-label="Contas de meses anteriores em aberto" className="rounded-2xl border border-amber-200 bg-amber-50/95 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-100 lg:p-4">
      <div className="flex items-start gap-2.5">
        <BellRing aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1">
          <div role="status" aria-live="polite" aria-atomic="true">
            <h2 className="text-[13px] font-bold lg:text-[15px]">Há contas de meses anteriores em aberto</h2>
            <p className="mt-1 text-[12px] leading-5 lg:text-[13px]">
              {items.length} {items.length === 1 ? "pendência" : "pendências"} · <strong className="amount-tabular whitespace-nowrap">{formatCurrency(total)}</strong>
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-amber-900/80 dark:text-amber-100/80 lg:text-[12px]">Confira as contas e faturas que ainda precisam de pagamento.</p>
          <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((value) => !value)} className="mt-1 flex min-h-11 items-center gap-1.5 text-[12px] font-bold underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
            {expanded ? "Recolher pendências" : "Ver pendências"}
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <div id={contentId} hidden={!expanded}>
        {expanded && <div className="mt-2 max-h-[55vh] space-y-2 overflow-y-auto overscroll-contain border-t border-amber-200 pt-3 dark:border-amber-800">
          {items.map((item) => item.kind === "transaction" ? (
            <TransactionRow key={item.id} transaction={item.transaction} searchResultId={item.id} paymentStatus="overdue" paymentLabel="Vencida" paymentActionLabel="Marcar como pago" onPaymentAction={() => setTransactionPaymentStatus(item.transaction.id, "paid")} />
          ) : (
            <div key={item.id} className="rounded-2xl bg-[#f4f8ff] p-3 text-glass-ink dark:bg-[#0d1b3e] dark:text-slate-100">
              <div className="flex items-start gap-2">
                <CreditCard aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-glass-sub dark:text-slate-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold">Fatura de {item.cardName} ····{item.last4}</p>
                  <p className="mt-0.5 text-[11px] text-glass-sub dark:text-slate-300">{monthLabel(item.month)}</p>
                  <p className="mt-1 whitespace-nowrap text-[11px] font-semibold text-[#C62828] dark:text-red-300">Venceu em <time dateTime={item.dueDate}>{item.dueDate.split("-").reverse().join("/")}</time></p>
                </div>
                <p className="amount-tabular whitespace-nowrap text-[12px] font-bold">{formatCurrency(item.amount)}</p>
              </div>
              <Link to="/dashboard/compras-cartao" state={{ cardId: item.cardId, invoiceMonth: item.month }} className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-primary/10 px-3 py-2 text-[12px] font-bold text-primary">Ver fatura</Link>
            </div>
          ))}
        </div>}
      </div>
    </section>
  );
}
