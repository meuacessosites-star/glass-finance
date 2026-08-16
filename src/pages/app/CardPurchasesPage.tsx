import { useMemo, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCheck,
  CheckCircle2,
  CreditCard,
  History,
  MoreVertical,
  Pencil,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { TransactionRow } from "@/components/app/TransactionRow";
import { useAppStore, type AppCard } from "@/lib/app-store";
import {
  currentMonthKey,
  formatCurrency,
  monthKey,
  monthShortLabel,
  type Transaction,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function isRegularCreditPurchase(transaction: Transaction): boolean {
  if (
    transaction.amount >= 0 ||
    !transaction.cardId ||
    transaction.cardMode !== "credito" ||
    (transaction.paymentMethod !== "cartao" &&
      transaction.paymentMethod !== "credito") ||
    transaction.source === "loan"
  ) {
    return false;
  }

  const searchableText = normalizeSearchText(
    `${transaction.title} ${transaction.note ?? ""} ${transaction.categoryId}`,
  );
  const externalLoanRecord =
    /\b(?:emprestimo|emprestei|emprestado|emprestada|loan|cartao emprestado|cartao cedido|conta a receber|divida|cobranca)\b/.test(
      searchableText,
    );

  return !externalLoanRecord;
}

type InvoiceStatusFilter = "all" | "open" | "paid";

function invoiceIsPaid(card: AppCard, month: string): boolean {
  return (
    card.invoicePaidByMonth?.[month] ??
    (month === currentMonthKey && card.invoicePaid === true)
  );
}

type CardActionMenuProps = {
  card: AppCard;
  onEdit: () => void;
  onRecalculate: () => void;
  onHistory: () => void;
  onExpenses: () => void;
  onDelete: () => void;
};

function CardActionMenu({
  card,
  onEdit,
  onRecalculate,
  onHistory,
  onExpenses,
  onDelete,
}: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const closeAndRun = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`Opções de ${card.name}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center rounded-full border border-white/30 bg-black/10 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors hover:bg-white/20 active:scale-95"
      >
        <MoreVertical className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-10 z-30 min-w-52 overflow-hidden rounded-2xl border border-white/30 bg-[#f4f8ff] p-1.5 text-glass-ink shadow-[0_18px_45px_-18px_rgba(15,40,90,0.55)] dark:bg-[#0d1b3e] dark:text-white"
          >
            <button
              type="button"
              onClick={() => closeAndRun(onEdit)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <Pencil className="size-3.5 text-primary" />
              Editar cartão
            </button>
            <button
              type="button"
              onClick={() => closeAndRun(onRecalculate)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <SlidersHorizontal className="size-3.5 text-primary" />
              Reajustar fatura
            </button>
            <button
              type="button"
              onClick={() => closeAndRun(onHistory)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <History className="size-3.5 text-primary" />
              Histórico de faturas
            </button>
            <button
              type="button"
              onClick={() => closeAndRun(onExpenses)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ReceiptText className="size-3.5 text-primary" />
              Despesas associadas
            </button>
            <div className="my-1 border-t border-black/5 dark:border-white/10" />
            <button
              type="button"
              onClick={() => closeAndRun(onDelete)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold text-[#FF3B30] transition-colors hover:bg-[#FF3B30]/10"
            >
              <Trash2 className="size-3.5" />
              Excluir cartão
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type InvoiceSummaryCardProps = {
  card: AppCard;
  openAmount: number;
  invoicePaid: boolean;
  selected: boolean;
  onSelect: () => void;
  onRequestPayment: () => void;
  onReopenInvoice: () => void;
  onEdit: () => void;
  onRecalculate: () => void;
  onHistory: () => void;
  onExpenses: () => void;
  onDelete: () => void;
};

function invoiceDueLabel(card: AppCard, month: string): string {
  if (!card.dueDay) return "Vencimento não informado";
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return `Dia ${card.dueDay}`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .replace(".", "")
    .toUpperCase();
  return `${String(card.dueDay).padStart(2, "0")}/${monthLabel}`;
}

type InvoicePaymentModalProps = {
  card: AppCard;
  month: string;
  amount: number;
  onClose: () => void;
  onConfirm: () => void;
  onInstallments: () => void;
};

function InvoicePaymentModal({
  card,
  month,
  amount,
  onClose,
  onConfirm,
  onInstallments,
}: InvoicePaymentModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-4 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-payment-title"
          className="glass glass-strong w-full max-w-md rounded-3xl bg-[#f4f8ff] p-5 text-glass-ink shadow-[0_24px_70px_-24px_rgba(15,40,90,0.65)] dark:bg-[#0d1b3e] dark:text-white"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                Pagamento da fatura
              </p>
              <h2 id="invoice-payment-title" className="mt-1 text-[20px] font-bold">
                Quanto você quer pagar?
              </h2>
              <p className="mt-1 text-[13px] text-glass-sub">
                {card.name} ····{card.last4} · {monthShortLabel(month)}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar pagamento da fatura"
              onClick={onClose}
              className="rounded-full px-2 py-1 text-[18px] leading-none text-glass-faint transition-colors hover:text-glass-ink dark:hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="glass glass-soft mt-5 rounded-2xl px-4 py-4 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-glass-faint">
              Valor total da fatura
            </p>
            <p className="amount-tabular mt-1 text-[28px] font-bold text-[#FF3B30]">
              {formatCurrency(amount)}
            </p>
            <p className="mt-1 text-[12px] font-medium text-glass-sub">
              Vencimento: {invoiceDueLabel(card, month)}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-glass-ink/10 px-4 py-3 text-[13px] font-semibold text-glass-sub transition-colors hover:text-glass-ink dark:border-white/10 dark:hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
            >
              Continuar
            </button>
          </div>
          <button
            type="button"
            onClick={onInstallments}
            className="mt-3 w-full rounded-full px-4 py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            Parcelar fatura
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

type EmptyInvoiceModalProps = {
  card: AppCard;
  onClose: () => void;
};

function EmptyInvoiceModal({ card, onClose }: EmptyInvoiceModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/35 p-4 sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          role="alertdialog"
          aria-modal="true"
          className="glass glass-strong w-full max-w-md rounded-3xl bg-[#f4f8ff] p-5 text-glass-ink shadow-[0_24px_70px_-24px_rgba(15,40,90,0.65)] dark:bg-[#0d1b3e] dark:text-white"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
            Atenção
          </p>
          <h2 className="mt-1 text-[20px] font-bold">Fatura sem lançamentos</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-glass-sub">
            Não é possível registrar um pagamento para {card.name} porque não há compras normais de crédito vinculadas a esta fatura.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-full bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
          >
            OK
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function InvoiceSummaryCard({
  card,
  openAmount,
  invoicePaid,
  selected,
  onSelect,
  onRequestPayment,
  onReopenInvoice,
  onEdit,
  onRecalculate,
  onHistory,
  onExpenses,
  onDelete,
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
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-white/25 bg-black/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/85">
            Fatura
          </span>
          <CardActionMenu
            card={card}
            onEdit={onEdit}
            onRecalculate={onRecalculate}
            onHistory={onHistory}
            onExpenses={onExpenses}
            onDelete={onDelete}
          />
        </div>
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

      <div className="relative mt-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/10 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md">
          <CheckCircle2 className="size-3.5" />
          Fatura {invoicePaid ? "paga" : "aberta"}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (invoicePaid) onReopenInvoice();
            else onRequestPayment();
          }}
          aria-pressed={invoicePaid}
          className="rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-white/25 active:scale-95"
        >
          {invoicePaid ? "Reabrir fatura" : "Pagar fatura"}
        </button>
      </div>
    </div>
  );
}

export default function CardPurchasesPage() {
  const navigate = useNavigate();
  const {
    transactions,
    cards,
    setCardInvoiceStatus,
    setAllCardInvoiceStatus,
    deleteCard,
  } = useAppStore();
  const [month, setMonth] = useState<string>("");
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] =
    useState<InvoiceStatusFilter>("all");
  const [paymentCard, setPaymentCard] = useState<AppCard | null>(null);
  const [zeroInvoiceCard, setZeroInvoiceCard] = useState<AppCard | null>(null);

  const cardTransactions = useMemo(
    () =>
      transactions
        .filter(isRegularCreditPurchase)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );

  const monthOptions = useMemo(() => {
    const invoiceHistoryMonths = cards.flatMap((card) =>
      Object.keys(card.invoicePaidByMonth ?? {}).filter((key) =>
        /^\d{4}-\d{2}$/.test(key),
      ),
    );
    const months = [
      ...new Set([
        ...cardTransactions.map((transaction) => monthKey(transaction.date)),
        ...invoiceHistoryMonths,
      ]),
    ].sort((a, b) => b.localeCompare(a));
    return months.length > 0 ? months : [currentMonthKey];
  }, [cardTransactions, cards]);

  const selectedMonth = monthOptions.includes(month)
    ? month
    : monthOptions[0];
  const visibleCards = useMemo(
    () =>
      cards.filter((card) => {
        const paid = invoiceIsPaid(card, selectedMonth);
        return (
          invoiceStatusFilter === "all" ||
          (invoiceStatusFilter === "paid" ? paid : !paid)
        );
      }),
    [cards, invoiceStatusFilter, selectedMonth],
  );
  const selectedCard = visibleCards.find((card) => card.id === selectedCardId);

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
  const handleBulkInvoiceStatus = (paid: boolean) => {
    setAllCardInvoiceStatus(selectedMonth, paid);
    toast(paid ? "Faturas do mês marcadas como pagas" : "Faturas do mês reabertas");
  };

  const handleRequestPayment = (card: AppCard) => {
    const amount = openAmountByCard[card.id] ?? 0;
    if (amount <= 0) {
      setZeroInvoiceCard(card);
      return;
    }
    setPaymentCard(card);
  };

  const handleConfirmPayment = () => {
    if (!paymentCard) return;
    setCardInvoiceStatus(paymentCard.id, selectedMonth, true);
    setPaymentCard(null);
    toast(`Fatura de ${paymentCard.name} paga integralmente`);
  };

  const handleReopenInvoice = (card: AppCard) => {
    setCardInvoiceStatus(card.id, selectedMonth, false);
    toast("Fatura reaberta");
  };

  const handleDeleteCard = (card: AppCard) => {
    if (!window.confirm(`Excluir o cartão ${card.name}?`)) return;
    deleteCard(card.id);
    if (selectedCardId === card.id) setSelectedCardId("");
    toast("Cartão removido");
  };

  const handleSelectCard = (card: AppCard) => {
    setSelectedCardId(card.id);
  };

  const handleAssociatedExpenses = (card: AppCard) => {
    setSelectedCardId(card.id);
    window.setTimeout(() => {
      document.getElementById("card-invoice-extract")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const cardActions = (card: AppCard) => ({
    onRequestPayment: () => handleRequestPayment(card),
    onReopenInvoice: () => handleReopenInvoice(card),
    onEdit: () => navigate("/dashboard/cartoes", { state: { editCardId: card.id } }),
    onRecalculate: () => {
      setSelectedCardId(card.id);
      toast("Fatura selecionada para reajuste");
    },
    onHistory: () => {
      setInvoiceStatusFilter("all");
      setSelectedCardId(card.id);
      toast("Histórico de faturas selecionado");
    },
    onExpenses: () => handleAssociatedExpenses(card),
    onDelete: () => handleDeleteCard(card),
  });

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

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {(["all", "open", "paid"] as const).map((status) => {
          const labels: Record<InvoiceStatusFilter, string> = {
            all: "Todas",
            open: "Abertas",
            paid: "Pagas",
          };
          return (
            <button
              key={status}
              type="button"
              onClick={() => setInvoiceStatusFilter(status)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-all",
                invoiceStatusFilter === status
                  ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                  : "glass text-glass-sub",
              )}
            >
              {labels[status]}
            </button>
          );
        })}
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
      ) : visibleCards.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <ReceiptText className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma fatura encontrada
            </p>
            <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-glass-sub">
              Não há faturas {invoiceStatusFilter === "paid" ? "pagas" : "abertas"} em {monthShortLabel(selectedMonth)}.
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
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-1 pb-0.5">
            <button
              type="button"
              onClick={() => handleBulkInvoiceStatus(true)}
              disabled={visibleCards.length === 0}
              className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-glass-sub transition-colors hover:text-primary active:scale-95 disabled:opacity-50"
            >
              <CheckCheck className="size-3.5 text-[#34C759]" />
              Marcar todas pagas
            </button>
            <button
              type="button"
              onClick={() => handleBulkInvoiceStatus(false)}
              disabled={visibleCards.length === 0}
              className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold text-glass-sub transition-colors hover:text-primary active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="size-3.5 text-primary" />
              Reabrir todas
            </button>
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
                  invoicePaid={invoiceIsPaid(selectedCard, selectedMonth)}
                  selected
                  onSelect={() => setSelectedCardId("")}
                  {...cardActions(selectedCard)}
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
                {visibleCards.map((card) => (
                  <InvoiceSummaryCard
                    key={card.id}
                    card={card}
                    openAmount={openAmountByCard[card.id] ?? 0}
                    invoicePaid={invoiceIsPaid(card, selectedMonth)}
                    selected={false}
                    onSelect={() => handleSelectCard(card)}
                    {...cardActions(card)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {selectedCard && (
        <div id="card-invoice-extract" className="space-y-3">
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

      {paymentCard && (
        <InvoicePaymentModal
          card={paymentCard}
          month={selectedMonth}
          amount={openAmountByCard[paymentCard.id] ?? 0}
          onClose={() => setPaymentCard(null)}
          onConfirm={handleConfirmPayment}
          onInstallments={() => {
            setPaymentCard(null);
            toast("Parcelamento de fatura ficará disponível em breve");
          }}
        />
      )}
      {zeroInvoiceCard && (
        <EmptyInvoiceModal
          card={zeroInvoiceCard}
          onClose={() => setZeroInvoiceCard(null)}
        />
      )}
    </div>
  );
}
