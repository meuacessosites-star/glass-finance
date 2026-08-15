import { useMemo, useState } from "react";
import { CreditCard, ReceiptText } from "lucide-react";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { TransactionRow } from "@/components/app/TransactionRow";
import { useAppStore } from "@/lib/app-store";
import { formatCurrency, monthKey, monthShortLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function CardPurchasesPage() {
  const { transactions, cards } = useAppStore();

  const cardTransactions = useMemo(
    () =>
      transactions
        .filter(
          (t) => t.amount < 0 && (t.paymentMethod === "cartao" || t.cardId),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );

  const allMonths = useMemo(
    () =>
      [...new Set(cardTransactions.map((t) => monthKey(t.date)))].sort((a, b) =>
        b.localeCompare(a),
      ),
    [cardTransactions],
  );
  const [month, setMonth] = useState<string>(allMonths[0]);
  const [cardFilter, setCardFilter] = useState<string>("todas");

  const cardById = useMemo(
    () => Object.fromEntries(cards.map((c) => [c.id, c])),
    [cards],
  );

  const filtered = useMemo(
    () =>
      cardTransactions
        .filter((t) => monthKey(t.date) === month)
        .filter((t) => {
          if (cardFilter === "todas") return true;
          if (cardFilter === "sem") return !t.cardId;
          return t.cardId === cardFilter;
        }),
    [cardTransactions, month, cardFilter],
  );

  const monthTotal = filtered.reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="space-y-4">
      <SettingsHeader title="Compras no Cartão" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Somente compras feitas nos cartões — separadas do resto do histórico.
      </p>

      {/* Month filter */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {allMonths.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMonth(key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all",
              month === key
                ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                : "glass text-glass-sub",
            )}
          >
            {monthShortLabel(key)}
          </button>
        ))}
      </div>

      {/* Card filter */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        <button
          type="button"
          onClick={() => setCardFilter("todas")}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
            cardFilter === "todas"
              ? "bg-glass-ink text-white"
              : "glass text-glass-sub",
          )}
        >
          Todos
        </button>
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCardFilter(c.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
              cardFilter === c.id
                ? "text-white shadow-[0_6px_16px_-6px_rgba(15,40,90,0.45)]"
                : "glass text-glass-sub",
            )}
            style={cardFilter === c.id ? { backgroundColor: c.color } : undefined}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            {c.name} ····{c.last4}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCardFilter("sem")}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
            cardFilter === "sem"
              ? "bg-glass-ink text-white"
              : "glass text-glass-sub",
          )}
        >
          Sem cartão
        </button>
      </div>

      {/* Summary */}
      <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <p className="text-[12.5px] text-glass-sub">
          {filtered.length} {filtered.length === 1 ? "compra" : "compras"}
        </p>
        <p className="amount-tabular text-[13px] font-bold text-[#FF3B30]">
          −{formatCurrency(monthTotal)} no mês
        </p>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <CreditCard className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma compra no cartão
            </p>
            <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-glass-sub">
              Compras feitas com cartão aparecem aqui — registre pelo "+"
              escolhendo Cartão, ou aprove as notificações de banco.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-primary">
            <ReceiptText className="size-3.5" />
            Veja Notificações no menu lateral
          </div>
        </div>
      ) : (
        <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
          {filtered.map((t) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
          Toque em uma compra para ver detalhes, categoria e forma de pagamento.
        </p>
      )}
    </div>
  );
}
