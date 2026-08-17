import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  Archive,
  CalendarClock,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  LockKeyhole,
  LockOpen,
  MoreVertical,
  Pencil,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { CardBrandMark } from "@/components/app/CardBrandMark";
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
import type { InvoicePaymentRecord } from "@/lib/app-store";
import { cn } from "@/lib/utils";

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function shiftMonth(key: string, offset: number): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastDayOfMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function calendarDaysForMonth(month: string): Array<string | null> {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = lastDayOfMonth(month);
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function transactionInPeriod(
  transaction: Transaction,
  selectedMonth: string,
  untilDate?: string | null,
): boolean {
  const startDate = `${selectedMonth}-01`;
  const endDate = untilDate && untilDate >= startDate
    ? untilDate
    : `${selectedMonth}-${String(lastDayOfMonth(selectedMonth)).padStart(2, "0")}`;
  return transaction.date >= startDate && transaction.date <= endDate;
}

type PeriodUntilPickerProps = {
  selectedMonth: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

function PeriodUntilPicker({
  selectedMonth,
  value,
  onChange,
}: PeriodUntilPickerProps) {
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(selectedMonth);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const minimumDate = `${selectedMonth}-01`;
  const calendarDays = calendarDaysForMonth(calendarMonth);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pickerWidth = Math.min(304, window.innerWidth - 32);
      setPopoverPosition({
        top: rect.bottom + 8,
        left: Math.max(16, Math.min(window.innerWidth - pickerWidth - 16, rect.right - pickerWidth)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [minimumDate, open, selectedMonth, value]);

  const handlePick = (date: string) => {
    if (date < minimumDate) return;
    onChange(date);
    setOpen(false);
  };

  const handleToggle = () => {
    if (!open) {
      setCalendarMonth(
        value && value >= minimumDate ? monthKey(value) : selectedMonth,
      );
    }
    setOpen((current) => !current);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Selecionar período até uma data"
        aria-expanded={open}
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold transition-all",
          value ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]" : "glass text-glass-sub",
        )}
      >
        <CalendarDays className="size-3.5" />
        {value ? `Até ${formatDateLabel(value)}` : "Até"}
      </button>

      {open && popoverPosition && createPortal(
        <div
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
          className="fixed z-[210] w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-glass-ink/10 bg-[#f4f8ff] p-3 text-glass-ink shadow-[0_18px_45px_-18px_rgba(15,40,90,0.55)] dark:border-white/10 dark:bg-[#0d1b3e] dark:text-white"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Mês anterior do período final"
              onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}
              className="flex size-8 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-[12px] font-bold uppercase tracking-wide">
              {monthShortLabel(calendarMonth)} {calendarMonth.slice(0, 4)}
            </p>
            <button
              type="button"
              aria-label="Próximo mês do período final"
              onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
              className="flex size-8 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] font-medium text-glass-faint">
            Selecione a data final do período iniciado em {monthShortLabel(selectedMonth)}.
          </p>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-glass-faint">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} />;
              const disabled = date < minimumDate;
              const selected = date === value;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={disabled}
                  aria-label={formatDateLabel(date)}
                  aria-pressed={selected}
                  onClick={() => handlePick(date)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                    selected
                      ? "bg-primary text-white"
                      : disabled
                        ? "cursor-not-allowed text-glass-faint/40"
                        : "text-glass-sub hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  {date.slice(-2).replace(/^0/, "")}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-glass-ink/5 pt-2 dark:border-white/10">
            <p className="text-[10px] font-medium text-glass-faint">
              {value ? `Até ${formatDateLabel(value)}` : "Nenhum limite aplicado"}
            </p>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setCalendarMonth(selectedMonth);
                }}
                className="rounded-full px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
              >
                Limpar
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
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
type TransactionSearchScope = "month" | "all";

function invoiceIsPaid(card: AppCard, month: string): boolean {
  return (
    card.invoicePaidByMonth?.[month] ??
    (month === currentMonthKey && card.invoicePaid === true)
  );
}

function invoicePaymentFor(card: AppCard, month: string): InvoicePaymentRecord | undefined {
  return card.invoicePaymentsByMonth?.[month];
}

function invoiceTotalFor(
  card: AppCard,
  month: string,
  grossAmount: number,
  untilDate?: string | null,
): number {
  if (untilDate) return grossAmount;
  const override = card.invoiceOverrideByMonth?.[month];
  return typeof override === "number" && Number.isFinite(override)
    ? Math.max(0, override)
    : grossAmount;
}

type CardActionMenuProps = {
  card: AppCard;
  onEdit: () => void;
  onRecalculate: () => void;
  onInstallInvoice: () => void;
  onEditClosingDay: () => void;
  onHistory: () => void;
  onExpenses: () => void;
  onCategoryChart: () => void;
  onMonthlyTrend: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

function CardActionMenu({
  card,
  onEdit,
  onRecalculate,
  onInstallInvoice,
  onEditClosingDay,
  onHistory,
  onExpenses,
  onCategoryChart,
  onMonthlyTrend,
  onArchive,
  onDelete,
}: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 224;
      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      });
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeAndRun = (action: () => void) => {
    setOpen(false);
    action();
  };

  const options = [
    { label: "Editar", icon: Pencil, action: onEdit },
    { label: "Reajustar fatura", icon: SlidersHorizontal, action: onRecalculate },
    { label: "Parcelar fatura", icon: CreditCard, action: onInstallInvoice },
    { label: "Editar dia fechamento", icon: CalendarClock, action: onEditClosingDay },
    { label: "Histórico de faturas", icon: History, action: onHistory },
    { label: "Despesas associadas", icon: ReceiptText, action: onExpenses },
    { label: "Gráfico por categorias", icon: ChartNoAxesColumn, action: onCategoryChart },
    { label: "Evolução mensal", icon: TrendingUp, action: onMonthlyTrend },
  ];

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Opções de ${card.name}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center rounded-full border border-white/30 bg-black/10 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors hover:bg-white/20 active:scale-95"
      >
        <MoreVertical className="size-4" />
      </button>
      {menuPosition &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{ top: menuPosition.top, left: menuPosition.left }}
                className="fixed z-[200] max-h-[calc(100vh-1rem)] min-w-56 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/30 bg-[#f4f8ff] p-1.5 text-glass-ink shadow-[0_18px_45px_-18px_rgba(15,40,90,0.55)] dark:bg-[#0d1b3e] dark:text-white"
                onClick={(event) => event.stopPropagation()}
              >
                {options.map(({ label, icon: Icon, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => closeAndRun(action)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <Icon className="size-3.5 text-primary" />
                    {label}
                  </button>
                ))}
                <div className="my-1 border-t border-black/5 dark:border-white/10" />
                <button
                  type="button"
                  onClick={() => closeAndRun(onArchive)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Archive className="size-3.5 text-primary" />
                  Arquivar cartão
                </button>
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
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

type InvoiceSummaryCardProps = {
  card: AppCard;
  openAmount: number;
  invoiceTotal: number;
  paidAmount: number;
  invoicePaid: boolean;
  selected: boolean;
  onSelect: () => void;
  onRequestPayment: () => void;
  onReopenInvoice: () => void;
  onEdit: () => void;
  onRecalculate: () => void;
  onInstallInvoice: () => void;
  onEditClosingDay: () => void;
  onHistory: () => void;
  onExpenses: () => void;
  onCategoryChart: () => void;
  onMonthlyTrend: () => void;
  onArchive: () => void;
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
  totalAmount: number;
  alreadyPaidAmount: number;
  initialMode?: PaymentMode;
  onClose: () => void;
  onConfirm: (payment: InvoicePaymentRecord) => void;
};

type PaymentMode = "full" | "partial" | "installments";

function parseMoneyInput(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function InvoicePaymentModal({
  card,
  month,
  totalAmount,
  alreadyPaidAmount,
  initialMode = "full",
  onClose,
  onConfirm,
}: InvoicePaymentModalProps) {
  const outstandingAmount = Math.max(
    0,
    totalAmount - Math.min(totalAmount, Math.max(0, alreadyPaidAmount)),
  );
  const [mode, setMode] = useState<PaymentMode>(initialMode);
  const [partialValue, setPartialValue] = useState(outstandingAmount.toFixed(2));
  const [installmentCount, setInstallmentCount] = useState("3");
  const [step, setStep] = useState<"form" | "confirmation">("form");

  const count = Math.min(48, Math.max(2, Math.round(Number(installmentCount) || 3)));
  const selectedAmount =
    mode === "full"
      ? outstandingAmount
      : mode === "partial"
        ? Math.min(outstandingAmount, parseMoneyInput(partialValue))
        : outstandingAmount / count;
  const isValid = selectedAmount > 0 && outstandingAmount > 0;

  const handleContinue = () => {
    if (!isValid) return;
    setStep("confirmation");
  };

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      totalAmount,
      paidAmount: Math.min(totalAmount, alreadyPaidAmount + selectedAmount),
      paymentDate: new Date().toISOString().slice(0, 10),
      installments: mode === "installments" ? count : undefined,
    });
  };

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
                {step === "form" ? "Como deseja pagar?" : "Confirmar pagamento"}
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
              {step === "form" ? "Saldo em aberto" : "Valor a registrar"}
            </p>
            <p className="amount-tabular mt-1 text-[28px] font-bold text-[#FF3B30]">
              {formatCurrency(step === "form" ? outstandingAmount : selectedAmount)}
            </p>
            <p className="mt-1 text-[12px] font-medium text-glass-sub">
              Total da fatura: {formatCurrency(totalAmount)} · Vencimento: {invoiceDueLabel(card, month)}
            </p>
          </div>

          {step === "form" ? (
            <>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {(["full", "partial", "installments"] as const).map((option) => {
                  const labels: Record<PaymentMode, string> = {
                    full: "Tudo",
                    partial: "Parcial",
                    installments: "Parcelar",
                  };
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setMode(option)}
                      className={cn(
                        "rounded-full px-3 py-2 text-[11px] font-bold transition-colors",
                        mode === option
                          ? "bg-primary text-white"
                          : "glass text-glass-sub hover:text-glass-ink dark:hover:text-white",
                      )}
                    >
                      {labels[option]}
                    </button>
                  );
                })}
              </div>

              {mode === "partial" && (
                <label className="mt-4 block text-[11px] font-semibold text-glass-sub">
                  Valor do pagamento
                  <input
                    value={partialValue}
                    onChange={(event) => setPartialValue(event.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-2xl border border-glass-ink/10 bg-white/60 px-4 py-3 text-[15px] font-bold text-glass-ink outline-none focus:border-primary dark:border-white/10 dark:bg-white/5 dark:text-white"
                    aria-label="Valor do pagamento parcial"
                  />
                </label>
              )}

              {mode === "installments" && (
                <div className="mt-4 rounded-2xl bg-primary/5 px-4 py-3">
                  <label className="block text-[11px] font-semibold text-glass-sub">
                    Quantidade de parcelas
                    <input
                      value={installmentCount}
                      onChange={(event) => setInstallmentCount(event.target.value)}
                      type="number"
                      min={2}
                      max={48}
                      className="mt-1 w-full rounded-2xl border border-glass-ink/10 bg-white/60 px-4 py-3 text-[15px] font-bold text-glass-ink outline-none focus:border-primary dark:border-white/10 dark:bg-white/5 dark:text-white"
                      aria-label="Quantidade de parcelas da fatura"
                    />
                  </label>
                  <p className="mt-2 text-[12px] text-glass-sub">
                    Primeira parcela: <strong>{formatCurrency(selectedAmount)}</strong>
                  </p>
                </div>
              )}

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
                  onClick={handleContinue}
                  disabled={!isValid}
                  className="rounded-full bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-5 rounded-2xl bg-primary/5 px-4 py-4 text-[13px] leading-relaxed text-glass-sub">
                Você está registrando {formatCurrency(selectedAmount)}{mode === "installments" ? ` como a 1ª de ${count} parcelas` : ""}. O extrato original não será apagado.
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="rounded-full border border-glass-ink/10 px-4 py-3 text-[13px] font-semibold text-glass-sub transition-colors hover:text-glass-ink dark:border-white/10 dark:hover:text-white"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="rounded-full bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
                >
                  Confirmar
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

type CardAnalyticsKind = "categoryChart" | "monthlyTrend";

type CardAnalyticsModalProps = {
  card: AppCard;
  kind: CardAnalyticsKind;
  transactions: Transaction[];
  categoryById: Record<string, { label: string; color: string }>;
  onClose: () => void;
};

function CardAnalyticsModal({
  card,
  kind,
  transactions,
  categoryById,
  onClose,
}: CardAnalyticsModalProps) {
  const cardTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.cardId === card.id),
    [card.id, transactions],
  );
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of cardTransactions) {
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + Math.abs(transaction.amount),
      );
    }
    return [...totals.entries()]
      .map(([categoryId, value]) => ({
        categoryId,
        name: categoryById[categoryId]?.label ?? "Outros",
        value,
        color: categoryById[categoryId]?.color ?? "#8E8E93",
      }))
      .sort((a, b) => b.value - a.value);
  }, [cardTransactions, categoryById]);
  const totalSpent = byCategory.reduce((sum, item) => sum + item.value, 0);
  const monthlyData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of cardTransactions) {
      const key = monthKey(transaction.date);
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(transaction.amount));
    }
    const months = [...new Set([currentMonthKey, ...totals.keys()])]
      .sort((a, b) => a.localeCompare(b))
      .slice(-12);
    return months.map((key) => ({
      month: monthShortLabel(key),
      value: totals.get(key) ?? 0,
      key,
    }));
  }, [cardTransactions]);
  const isCategoryChart = kind === "categoryChart";

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
          aria-labelledby="card-analytics-title"
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
                Análise do cartão
              </p>
              <h2 id="card-analytics-title" className="mt-1 text-[20px] font-bold">
                {isCategoryChart ? "Gastos por categoria" : "Evolução mensal"}
              </h2>
              <p className="mt-1 text-[13px] text-glass-sub">
                {card.name} ····{card.last4} · histórico de compras de crédito
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar análise do cartão"
              onClick={onClose}
              className="rounded-full px-2 py-1 text-[18px] leading-none text-glass-faint transition-colors hover:text-glass-ink dark:hover:text-white"
            >
              ×
            </button>
          </div>

          {cardTransactions.length === 0 ? (
            <div className="glass glass-soft mt-5 rounded-2xl px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-glass-ink">
                Ainda não há compras para analisar
              </p>
              <p className="mt-1 text-[12px] text-glass-sub">
                As compras normais de crédito deste cartão aparecerão aqui.
              </p>
            </div>
          ) : isCategoryChart ? (
            <>
              <div className="relative mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="64%"
                      outerRadius="90%"
                      paddingAngle={3}
                      cornerRadius={6}
                      stroke="none"
                    >
                      {byCategory.map((entry) => (
                        <Cell key={entry.categoryId} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        borderRadius: 16,
                        border: "none",
                        background: "rgba(244,248,255,0.96)",
                        color: "#1c2a4a",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[11px] font-medium text-glass-sub">Total gasto</p>
                  <p className="amount-tabular text-[18px] font-bold text-glass-ink">
                    {formatCurrency(totalSpent)}
                  </p>
                </div>
              </div>
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                {byCategory.map((entry) => (
                  <div key={entry.categoryId} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="flex-1 text-glass-sub">{entry.name}</span>
                    <span className="font-semibold text-glass-ink">{formatCurrency(entry.value)}</span>
                    <span className="w-9 text-right text-glass-faint">
                      {totalSpent ? `${Math.round((entry.value / totalSpent) * 100)}%` : "0%"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "var(--glass-faint)", fontWeight: 600 }}
                      dy={6}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.key ?? ""}
                      contentStyle={{
                        borderRadius: 16,
                        border: "none",
                        background: "rgba(244,248,255,0.96)",
                        color: "#1c2a4a",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name="Gastos"
                      stroke="#2F6BFF"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "#2F6BFF", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                {[...monthlyData].reverse().map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-glass-sub">{monthShortLabel(entry.key)} {entry.key.slice(0, 4)}</span>
                    <span className="font-semibold text-glass-ink">{formatCurrency(entry.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

type InvoiceNumberModalProps = {
  card: AppCard;
  month: string;
  kind: "amount" | "closingDay";
  initialValue: number;
  onClose: () => void;
  onConfirm: (value: number) => void;
};

function InvoiceNumberModal({
  card,
  month,
  kind,
  initialValue,
  onClose,
  onConfirm,
}: InvoiceNumberModalProps) {
  const [value, setValue] = useState(String(initialValue || ""));
  const isAmount = kind === "amount";
  const parsedValue = isAmount ? parseMoneyInput(value) : Math.round(Number(value));
  const valid = isAmount
    ? parsedValue >= 0
    : Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 31;

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
          className="glass glass-strong w-full max-w-md rounded-3xl bg-[#f4f8ff] p-5 text-glass-ink shadow-[0_24px_70px_-24px_rgba(15,40,90,0.65)] dark:bg-[#0d1b3e] dark:text-white"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
            {isAmount ? "Reajuste de fatura" : "Dia de fechamento"}
          </p>
          <h2 className="mt-1 text-[20px] font-bold">
            {isAmount ? "Qual será o novo total?" : "Quando a fatura fecha?"}
          </h2>
          <p className="mt-1 text-[13px] text-glass-sub">
            {card.name} ····{card.last4} · {monthShortLabel(month)}
          </p>
          <label className="mt-5 block text-[11px] font-semibold text-glass-sub">
            {isAmount ? "Valor da fatura" : "Dia do mês (1 a 31)"}
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              type={isAmount ? "text" : "number"}
              inputMode={isAmount ? "decimal" : "numeric"}
              min={isAmount ? 0 : 1}
              max={isAmount ? undefined : 31}
              className="mt-1 w-full rounded-2xl border border-glass-ink/10 bg-white/60 px-4 py-3 text-[18px] font-bold text-glass-ink outline-none focus:border-primary dark:border-white/10 dark:bg-white/5 dark:text-white"
              aria-label={isAmount ? "Novo valor da fatura" : "Dia de fechamento"}
            />
          </label>
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
              disabled={!valid}
              onClick={() => onConfirm(parsedValue)}
              className="rounded-full bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
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
  invoiceTotal,
  paidAmount,
  invoicePaid,
  selected,
  onSelect,
  onRequestPayment,
  onReopenInvoice,
  onEdit,
  onRecalculate,
  onInstallInvoice,
  onEditClosingDay,
  onHistory,
  onExpenses,
  onCategoryChart,
  onMonthlyTrend,
  onArchive,
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

          <CardBrandMark card={card} className="h-9 shrink-0" />
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
            onInstallInvoice={onInstallInvoice}
            onEditClosingDay={onEditClosingDay}
            onHistory={onHistory}
            onExpenses={onExpenses}
            onCategoryChart={onCategoryChart}
            onMonthlyTrend={onMonthlyTrend}
            onArchive={onArchive}
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
      <p className="relative mt-1 text-[10px] font-medium text-white/65">
        Conta vinculada: {card.institution || "Conta principal"}
      </p>

      <div className="relative mt-2 flex items-center justify-between text-[9px] font-medium text-white/65">
        <span>Total da fatura: {formatCurrency(invoiceTotal)}</span>
        {paidAmount > 0 && !invoicePaid && <span>Pago: {formatCurrency(paidAmount)}</span>}
      </div>

      <div className="relative mt-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-white/25 bg-black/10 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-md">
          {invoicePaid ? <LockKeyhole className="size-3.5" /> : <LockOpen className="size-3.5" />}
          Fatura {invoicePaid ? "fechada" : paidAmount > 0 ? "parcial" : "aberta"}
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
          {invoicePaid ? "Reabrir fatura" : "Registrar pagamento"}
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
    categoryById,
    updateCard,
    setCardInvoiceStatus,
    setCardInvoicePayment,
    setCardInvoiceOverride,
    deleteCard,
  } = useAppStore();
  const [month, setMonth] = useState<string>(currentMonthKey);
  const [untilDate, setUntilDate] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionSearchScope, setTransactionSearchScope] =
    useState<TransactionSearchScope>("month");
  const [transactionCategory, setTransactionCategory] = useState("todas");
  const [invoiceStatusFilter, setInvoiceStatusFilter] =
    useState<InvoiceStatusFilter>("all");
  const [paymentCard, setPaymentCard] = useState<AppCard | null>(null);
  const [paymentInitialMode, setPaymentInitialMode] = useState<PaymentMode>("full");
  const [zeroInvoiceCard, setZeroInvoiceCard] = useState<AppCard | null>(null);
  const [utilityCard, setUtilityCard] = useState<AppCard | null>(null);
  const [utilityKind, setUtilityKind] = useState<
    "amount" | "closingDay" | CardAnalyticsKind | null
  >(null);

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
    const navigableMonths = Array.from({ length: 49 }, (_, index) =>
      shiftMonth(currentMonthKey, 24 - index),
    );
    return [
      ...new Set([
        ...navigableMonths,
        ...cardTransactions.map((transaction) => monthKey(transaction.date)),
        ...invoiceHistoryMonths,
      ]),
    ].sort((a, b) => b.localeCompare(a));
  }, [cardTransactions, cards]);

  const selectedMonth = monthOptions.includes(month)
    ? month
    : monthOptions.includes(currentMonthKey)
      ? currentMonthKey
      : monthOptions[0];
  const selectedPeriodLabel = untilDate
    ? `${monthShortLabel(selectedMonth)} 01 → ${formatDateLabel(untilDate)}`
    : `${monthShortLabel(selectedMonth)} ${selectedMonth.slice(0, 4)}`;
  const handleSelectMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    setUntilDate((current) => (current && monthKey(current) === nextMonth ? current : null));
  };
  const visibleMonthOptions = useMemo(() => {
    const selectedIndex = Math.max(0, monthOptions.indexOf(selectedMonth));
    const windowSize = Math.min(5, monthOptions.length);
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(windowSize / 2), monthOptions.length - windowSize),
    );
    return monthOptions.slice(start, start + windowSize);
  }, [monthOptions, selectedMonth]);
  const visibleCards = useMemo(
    () =>
      cards.filter((card) => {
        if (card.archived) return false;
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
              transactionInPeriod(transaction, selectedMonth, untilDate),
          )
          .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
        return totals;
      }, {}),
    [cards, cardTransactions, selectedMonth, untilDate],
  );

  const selectedCardTransactions = useMemo(
    () =>
      selectedCard
        ? cardTransactions.filter(
            (transaction) =>
              transaction.cardId === selectedCard.id &&
              transactionInPeriod(transaction, selectedMonth, untilDate),
          )
        : [],
    [cardTransactions, selectedCard, selectedMonth, untilDate],
  );

  const selectedCardHistoryTransactions = useMemo(
    () =>
      selectedCard
        ? cardTransactions.filter((transaction) => transaction.cardId === selectedCard.id)
        : [],
    [cardTransactions, selectedCard],
  );
  const transactionCategoryOptions = useMemo(() => {
    const ids = new Set(selectedCardHistoryTransactions.map((transaction) => transaction.categoryId));
    return [...ids]
      .map((id) => ({ id, label: categoryById[id]?.label ?? id }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [categoryById, selectedCardHistoryTransactions]);
  const visibleSelectedCardTransactions = useMemo(() => {
    if (!selectedCard) return [];
    const source = transactionSearchScope === "all"
      ? selectedCardHistoryTransactions
      : selectedCardTransactions;
    const query = normalizeSearchText(transactionSearch.trim());
    return source.filter((transaction) => {
      const categoryLabel = categoryById[transaction.categoryId]?.label ?? transaction.categoryId;
      const searchableText = normalizeSearchText(
        `${transaction.title} ${transaction.note ?? ""} ${categoryLabel}`,
      );
      return (
        (!query || searchableText.includes(query)) &&
        (transactionCategory === "todas" || transaction.categoryId === transactionCategory)
      );
    });
  }, [
    categoryById,
    selectedCard,
    selectedCardHistoryTransactions,
    selectedCardTransactions,
    transactionCategory,
    transactionSearch,
    transactionSearchScope,
  ]);
  const hasTransactionFilters = Boolean(
    transactionSearch.trim() ||
      transactionCategory !== "todas" ||
      transactionSearchScope === "all",
  );
  const selectedCardTotal = selectedCardTransactions.reduce(
    (total, transaction) => total + Math.abs(transaction.amount),
    0,
  );
  const invoiceMetricsFor = (card: AppCard) => {
    const openAmount = openAmountByCard[card.id] ?? 0;
    const invoiceTotal = invoiceTotalFor(card, selectedMonth, openAmount, untilDate);
    const paidAmount = Math.min(
      invoiceTotal,
      Math.max(0, invoicePaymentFor(card, selectedMonth)?.paidAmount ?? 0),
    );
    return {
      openAmount,
      invoiceTotal,
      paidAmount,
    };
  };
  const handleRequestPayment = (card: AppCard, mode: PaymentMode = "full") => {
    const grossAmount = openAmountByCard[card.id] ?? 0;
    const totalAmount = invoiceTotalFor(card, selectedMonth, grossAmount, untilDate);
    if (totalAmount <= 0) {
      setZeroInvoiceCard(card);
      return;
    }
    setPaymentInitialMode(mode);
    setPaymentCard(card);
  };

  const handleConfirmPayment = (payment: InvoicePaymentRecord) => {
    if (!paymentCard) return;
    setCardInvoicePayment(paymentCard.id, selectedMonth, payment);
    setPaymentCard(null);
    setPaymentInitialMode("full");
    toast(
      payment.installments && payment.installments > 1
        ? `Pagamento parcelado registrado em ${payment.installments}x`
        : payment.paidAmount >= payment.totalAmount
          ? `Fatura de ${paymentCard.name} paga integralmente`
          : `Pagamento parcial de ${formatCurrency(payment.paidAmount)} registrado`,
    );
  };

  const handleReopenInvoice = (card: AppCard) => {
    const grossAmount = openAmountByCard[card.id] ?? 0;
    const totalAmount = invoiceTotalFor(card, selectedMonth, grossAmount, untilDate);
    const payment = invoicePaymentFor(card, selectedMonth);
    if (payment && payment.paidAmount >= totalAmount) {
      setCardInvoicePayment(card.id, selectedMonth, {
        ...payment,
        totalAmount,
        paidAmount: 0,
        paymentDate: new Date().toISOString().slice(0, 10),
      });
    } else {
      setCardInvoiceStatus(card.id, selectedMonth, false);
    }
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
    setTransactionSearch("");
    setTransactionSearchScope("month");
    setTransactionCategory("todas");
  };

  const handleArchiveCard = (card: AppCard) => {
    updateCard(card.id, { archived: true });
    if (selectedCardId === card.id) setSelectedCardId("");
    toast(`${card.name} arquivado`);
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
    onInstallInvoice: () => handleRequestPayment(card, "installments"),
    onEdit: () => navigate("/dashboard/cartoes", { state: { editCardId: card.id } }),
    onRecalculate: () => {
      setSelectedCardId(card.id);
      setUtilityCard(card);
      setUtilityKind("amount");
    },
    onEditClosingDay: () => {
      setUtilityCard(card);
      setUtilityKind("closingDay");
    },
    onHistory: () => {
      setInvoiceStatusFilter("all");
      setSelectedCardId(card.id);
    },
    onExpenses: () => handleAssociatedExpenses(card),
    onCategoryChart: () => {
      setSelectedCardId(card.id);
      setUtilityCard(card);
      setUtilityKind("categoryChart");
    },
    onMonthlyTrend: () => {
      setSelectedCardId(card.id);
      setUtilityCard(card);
      setUtilityKind("monthlyTrend");
    },
    onArchive: () => handleArchiveCard(card),
    onDelete: () => handleDeleteCard(card),
  });

  return (
    <div className="space-y-4">
      <SettingsHeader title="Compras no Cartão" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Acompanhe cada fatura e veja o extrato separado por cartão.
      </p>

      <div className="glass rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => handleSelectMonth(shiftMonth(selectedMonth, -1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="no-scrollbar flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-0.5 py-0.5">
            {visibleMonthOptions.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectMonth(key)}
                className={cn(
                  "min-w-[78px] shrink-0 snap-center whitespace-nowrap rounded-full px-3 py-2 text-center text-[12px] font-semibold transition-all",
                  selectedMonth === key
                    ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                    : "glass text-glass-sub",
                )}
              >
                {monthShortLabel(key)} {key.slice(0, 4)}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => handleSelectMonth(shiftMonth(selectedMonth, 1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex w-full items-center gap-1.5 overflow-x-auto border-t border-glass-ink/5 px-1 pt-3">
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
                  "min-w-[88px] flex-1 shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold transition-all",
                  invoiceStatusFilter === status
                    ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                    : "glass text-glass-sub",
                )}
              >
                {labels[status]}
              </button>
            );
          })}
          <PeriodUntilPicker
            selectedMonth={selectedMonth}
            value={untilDate}
            onChange={setUntilDate}
          />
        </div>
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
              Não há faturas {invoiceStatusFilter === "paid" ? "pagas" : "abertas"} no período {selectedPeriodLabel}.
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
                {selectedPeriodLabel}
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
                  {...invoiceMetricsFor(selectedCard)}
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
                    {...invoiceMetricsFor(card)}
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

          <div className="glass rounded-2xl px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-glass-faint" />
                <label htmlFor="card-transaction-search" className="sr-only">
                  Buscar no extrato do cartão
                </label>
                <input
                  id="card-transaction-search"
                  type="search"
                  value={transactionSearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTransactionSearch(value);
                    if (!value.trim()) setTransactionSearchScope("month");
                  }}
                  placeholder="Buscar compra ou categoria"
                  className="h-10 w-full rounded-xl border border-glass-ink/10 bg-white/50 pl-9 pr-3 text-[12px] font-medium text-glass-ink outline-none transition-colors placeholder:text-glass-faint focus:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </div>
              <label htmlFor="card-transaction-category" className="sr-only">
                Filtrar por categoria
              </label>
              <select
                id="card-transaction-category"
                value={transactionCategory}
                onChange={(event) => setTransactionCategory(event.target.value)}
                className="h-10 max-w-[10.5rem] rounded-xl border border-glass-ink/10 bg-white/50 px-2.5 text-[11px] font-semibold text-glass-ink outline-none transition-colors focus:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                <option value="todas">Todas as categorias</option>
                {transactionCategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            {transactionSearch.trim() && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-glass-ink/5 pt-2 dark:border-white/10">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-glass-faint">
                  Pesquisar em
                </span>
                {(["month", "all"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setTransactionSearchScope(scope)}
                    className={cn(
                      "rounded-full px-2.5 py-1.5 text-[10px] font-semibold transition-all active:scale-95",
                      transactionSearchScope === scope
                        ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                        : "glass-soft text-glass-sub",
                    )}
                  >
                    {scope === "month" ? "Mês selecionado" : "Todos os meses"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {visibleSelectedCardTransactions.length === 0 ? (
            <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
                <ReceiptText className="size-6 text-glass-faint" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-glass-ink">
                  {hasTransactionFilters ? "Nenhuma compra encontrada" : "Nenhuma compra nesta fatura"}
                </p>
                <p className="mt-1 max-w-[260px] text-[13px] leading-relaxed text-glass-sub">
                  {hasTransactionFilters
                    ? "Tente outro termo, categoria ou escopo de busca."
                    : `As compras de crédito de ${monthShortLabel(selectedMonth)} para este cartão aparecerão aqui.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {visibleSelectedCardTransactions.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </div>
          )}

          {visibleSelectedCardTransactions.length > 0 && (
            <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
              {hasTransactionFilters
                ? `Exibindo ${visibleSelectedCardTransactions.length} compra(s) encontradas no escopo ${transactionSearchScope === "all" ? "de todo o histórico" : "do mês selecionado"}.`
                : `Extrato exclusivo de compras de crédito em ${monthShortLabel(selectedMonth)}. Toque em uma compra para ver os detalhes.`}
            </p>
          )}
        </div>
      )}

      {paymentCard && (
        <InvoicePaymentModal
          card={paymentCard}
          month={selectedMonth}
          totalAmount={invoiceMetricsFor(paymentCard).invoiceTotal}
          alreadyPaidAmount={invoiceMetricsFor(paymentCard).paidAmount}
          initialMode={paymentInitialMode}
          onClose={() => {
            setPaymentCard(null);
            setPaymentInitialMode("full");
          }}
          onConfirm={handleConfirmPayment}
        />
      )}
      {zeroInvoiceCard && (
        <EmptyInvoiceModal
          card={zeroInvoiceCard}
          onClose={() => setZeroInvoiceCard(null)}
        />
      )}
      {utilityCard && (utilityKind === "categoryChart" || utilityKind === "monthlyTrend") && (
        <CardAnalyticsModal
          card={utilityCard}
          kind={utilityKind}
          transactions={cardTransactions}
          categoryById={categoryById}
          onClose={() => {
            setUtilityCard(null);
            setUtilityKind(null);
          }}
        />
      )}
      {utilityCard && (utilityKind === "amount" || utilityKind === "closingDay") && (
        <InvoiceNumberModal
          card={utilityCard}
          month={selectedMonth}
          kind={utilityKind}
          initialValue={
            utilityKind === "amount"
              ? invoiceMetricsFor(utilityCard).invoiceTotal
              : utilityCard.closingDay ?? 1
          }
          onClose={() => {
            setUtilityCard(null);
            setUtilityKind(null);
          }}
          onConfirm={(value) => {
            if (utilityKind === "amount") {
              setCardInvoiceOverride(utilityCard.id, selectedMonth, value);
              toast("Total da fatura reajustado");
            } else {
              updateCard(utilityCard.id, { closingDay: value });
              toast("Dia de fechamento atualizado");
            }
            setUtilityCard(null);
            setUtilityKind(null);
          }}
        />
      )}
    </div>
  );
}
