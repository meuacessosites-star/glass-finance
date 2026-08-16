import { useMemo, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  CreditCard,
  ReceiptText,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { TransactionRow } from "@/components/app/TransactionRow";
import { useAppStore, type AppCard } from "@/lib/app-store";
import {
  currentMonthKey,
  formatCurrency,
  monthKey,
  monthShortLabel,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

type InvoiceSummaryCardProps = {
  card: AppCard;
  openAmount: number;
  selected: boolean;
  onSelect: () => void;
  onToggleInvoice: () => void;
};

function InvoiceSummaryCard({
  card,
  openAmount,
  selected,
  onSelect,
  onToggleInvoice,
}: InvoiceSummaryCardProps) {
  const safeColor = isHexColor(card.color) ? card.color : "#2F6BFF";
  const limit = card.totalLimit;
  const availableLimit =
    typeof limit === "number" ? Math.max(0, limit - openAmount) : undefined;
  const usagePercent =
    typeof limit === "number" && limit > 0
      ? Math.min(100, Math.max(0, (openAmount / limit) * 100))
      : 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        "glass relative overflow-hidden rounded-3xl p-4 text-white transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
      )}
      style={{
        background: `linear-gradient(145deg, ${safeColor} 0%, ${safeColor}e6 48%, ${safeColor}b8 100%)`,
      }}
    >
      <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-black/15 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
            <CreditCard className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold tracking-wide">
              {card.name}
            </p>
            <p className="truncate text-[10px] font-medium text-white/70">
              {card.institution || "Banco / instituição"} ····{card.last4}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/25 bg-black/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/85">
          Fatura
        </span>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide text-white/65">
            Limite total
          </p>
          <p className="amount-tabular mt-0.5 text-[12px] font-bold">
            {typeof limit === "number" ? formatCurrency(limit) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-medium uppercase tracking-wide text-white/65">
            Em aberto
          </p>
          <p className="amount-tabular mt-0.5 text-[12px] font-bold">
            {formatCurrency(openAmount)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-medium uppercase tracking-wide text-white/65">
            Disponível
          </p>
          <p className="amount-tabular mt-0.5 text-[12px] font-bold">
            {typeof availableLimit === "number"
              ? formatCurrency(availableLimit)
              : "—"}
          </p>
        </div>
      </div>

      <div className="relative mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-black/15">
          <div
            className="h-full rounded-full bg-white/85 transition-[width] duration-300"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <p className="mt-1 text-right text-[9px] font-medium text-white/65">
          {typeof limit === "number" && limit > 0
            ? `${Math.round(usagePercent)}% utilizado`
            : "Limite não informado"}
        </p>
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-2 text-[10px] font-medium text-white/75">
        <span>
          Fechamento: {card.closingDay ? `Dia ${card.closingDay}` : "—"}
        </span>
        <span className="text-right">
          Vencimento: {card.dueDay ? `Dia ${card.dueDay}` : "—"}
        </span>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleInvoice();
        }}
        aria-pressed={card.invoicePaid === true}
        className="relative mt-3 flex items-center gap-1.5 rounded-full border border-white/25 bg-black/10 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md transition-colors hover:bg-white/20 active:scale-95"
      >
        <CheckCircle2 className="size-3.5" />
        Fatura {card.invoicePaid === true ? "paga" : "em aberto"}
      </button>
    </div>
  );
}

export default function CardPurchasesPage() {
  const { transactions, cards, updateCard } = useAppStore();
  const [month, setMonth] = useState<string>("");
  const [selectedCardId, setSelectedCardId] = useState<string>("");

  const cardTransactions = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            transaction.amount < 0 &&
            transaction.cardMode === "credito" &&
            Boolean(transaction.cardId),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );

  const monthOptions = useMemo(() => {
    const months = [
      ...new Set(cardTransactions.map((transaction) => monthKey(transaction.date))),
    ].sort((a, b) => b.localeCompare(a));
    return months.length > 0 ? months : [currentMonthKey];
  }, [cardTransactions]);

  const selectedMonth = monthOptions.includes(month)
    ? month
    : monthOptions[0];
  const selectedCard = cards.find((card) => card.id === selectedCardId);

  const openAmountByCard = useMemo(
    () =>
      cards.reduce<Record<string, number>>((totals, card) => {
        totals[card.id] = cardTransactions
          .filter(
            (transaction) =>
              transaction.cardId === card.id &&
              monthKey(transaction.date) === selectedMonth,
          )
          .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
        return totals;
      }, {}),
    [cards, cardTransactions, selectedMonth],
  );

  const selectedCardTransactions = useMemo(
    () =>
      selectedCard
        ? cardTransactions.filter(
            (transaction) =>
              transaction.cardId === selectedCard.id &&
              monthKey(transaction.date) === selectedMonth,
          )
        : [],
    [cardTransactions, selectedCard, selectedMonth],
  );

  const selectedCardTotal = selectedCardTransactions.reduce(
    (total, transaction) => total + Math.abs(transaction.amount),
    0,
  );

  return (
    <div className="space-y-4">
      <SettingsHeader title="Compras no Cartão" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Acompanhe cada fatura e veja o extrato separado por cartão.
      </p>

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {monthOptions.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMonth(key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all",
              selectedMonth === key
                ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                : "glass text-glass-sub",
            )}
          >
            {monthShortLabel(key)}
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <CreditCard className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhum cartão cadastrado
            </p>
            <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-glass-sub">
              Cadastre um cartão para acompanhar limite, fatura e compras separadamente.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[12px] font-bold uppercase tracking-wide text-glass-sub">
              {selectedCard ? `Fatura ${selectedCard.name}` : "Faturas por cartão"}
            </p>
            <div className="flex items-center gap-2">
              {selectedCard && (
                <button
                  type="button"
                  onClick={() => setSelectedCardId("")}
                  className="rounded-full px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:text-primary/80 active:scale-95"
                >
                  Ver todos
                </button>
              )}
              <p className="text-[11px] font-medium text-glass-faint">
                {monthShortLabel(selectedMonth)}
              </p>
            </div>
          </div>
          <AnimatePresence initial={false} mode="wait">
            {selectedCard ? (
              <motion.div
                key={`focused-${selectedCard.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <InvoiceSummaryCard
                  card={selectedCard}
                  openAmount={openAmountByCard[selectedCard.id] ?? 0}
                  selected
                  onSelect={() => setSelectedCardId("")}
                  onToggleInvoice={() => {
                    const nextPaid = selectedCard.invoicePaid !== true;
                    updateCard(selectedCard.id, { invoicePaid: nextPaid });
                    toast(nextPaid ? "Fatura marcada como paga" : "Fatura reaberta");
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="all-cards"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {cards.map((card) => (
                  <InvoiceSummaryCard
                    key={card.id}
                    card={card}
                    openAmount={openAmountByCard[card.id] ?? 0}
                    selected={false}
                    onSelect={() => setSelectedCardId(card.id)}
                    onToggleInvoice={() => {
                      const nextPaid = card.invoicePaid !== true;
                      updateCard(card.id, { invoicePaid: nextPaid });
                      toast(nextPaid ? "Fatura marcada como paga" : "Fatura reaberta");
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {selectedCard && (
        <div className="space-y-3">
          <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wide text-glass-sub">
                Extrato da fatura
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-glass-ink">
                {selectedCard.name} ····{selectedCard.last4}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-glass-faint">
                Total da fatura
              </p>
              <p className="amount-tabular mt-0.5 text-[18px] font-bold text-[#FF3B30]">
                −{formatCurrency(selectedCardTotal)}
              </p>
            </div>
          </div>

          {selectedCardTransactions.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
                <ReceiptText className="size-6 text-glass-faint" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-glass-ink">
                  Nenhuma compra nesta fatura
                </p>
                <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-glass-sub">
                  As compras de crédito de {monthShortLabel(selectedMonth)} para este cartão aparecerão aqui.
                </p>
              </div>
            </div>
          ) : (
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {selectedCardTransactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </div>
          )}

          {selectedCardTransactions.length > 0 && (
            <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
              Extrato exclusivo de compras de crédito em {monthShortLabel(selectedMonth)}. Toque em uma compra para ver os detalhes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
