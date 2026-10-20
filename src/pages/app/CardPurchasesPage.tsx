import "@/components/app/invoice-glass-band.css";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  CircleDollarSign,
  Clock3,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  MoreVertical,
  Pencil,
  ReceiptText,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Palette,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router";
import { getInvoiceDates, getInvoicePartsInPeriod, getTransactionInvoiceSchedule, localDateKey, sanitizeInvoiceMonth } from "@/lib/card-billing";
import { getBorrowedCardTransactions } from "@/lib/card-loan-purchases";
import { CardMonthsDialog } from "@/components/app/CardMonthsDialog";
import { getCardCommittedAmount, getCardInvoiceMetrics, getCardInvoiceStatus, getCardStatementTotal, getInvoicePaymentAmount, parseInvoiceMoney, selectCardPurchases } from "@/lib/card-invoice-view";
import { useLocalDate } from "@/hooks/use-local-date";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryExpenseChart } from "@/components/app/CategoryExpenseChart";
import { CardOrderDialog } from "@/components/app/CardOrderDialog";
import { isInvoiceCardExpanded, sanitizeInvoiceCardDisplayMode } from "@/lib/invoice-card-display";
import { getCardGlassBackground, getInvoiceHeaderAppearances, type InvoiceHeaderAppearance } from "@/lib/card-header-appearance";
import { CardRemovalDialog } from "@/components/app/CardRemovalDialog";
import { emptyCardStatementFilters, getCardCategoryAnalytics, getCardMonthlyAnalytics, shiftInvoiceMonth } from "@/lib/card-analytics";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CardBrandMark } from "@/components/app/CardBrandMark";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { TransactionRow } from "@/components/app/TransactionRow";
import {
  SearchNavigationControls,
  useSearchNavigation,
} from "@/components/app/SearchHighlight";
import { useAppStore, type AppCard } from "@/lib/app-store";
import {
  formatCurrency,
  monthKey,
  monthShortLabel,
  type Transaction,
} from "@/lib/mock-data";
import type { InvoicePaymentRecord } from "@/lib/app-store";
import { cn } from "@/lib/utils";

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
  fromDate?: string | null,
  card?: AppCard,
): boolean {
  if (card) return getInvoicePartsInPeriod(transaction, card, selectedMonth, fromDate, untilDate).length > 0;
  const startDate = fromDate ?? `${selectedMonth}-01`;
  const defaultEndDate = `${selectedMonth}-${String(lastDayOfMonth(selectedMonth)).padStart(2, "0")}`;
  const endDate = untilDate && untilDate >= startDate ? untilDate : defaultEndDate;
  return transaction.date >= startDate && transaction.date <= endDate;
}

function invoiceAmountInPeriod(transaction: Transaction, card: AppCard, month: string, fromDate?: string | null, untilDate?: string | null): number {
  return getInvoicePartsInPeriod(transaction, card, month, fromDate, untilDate).reduce((sum, part) => sum + Math.round(part.amount * 100), 0) / 100;
}

type PeriodMode = "current" | "month" | "custom";

type PeriodPickerProps = {
  mode: PeriodMode;
  selectedMonth: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  onModeChange: (mode: PeriodMode) => void;
  onRangeChange: (start: string | null, end: string | null) => void;
};

function PeriodPicker({
  mode,
  selectedMonth,
  rangeStart,
  rangeEnd,
  onModeChange,
  onRangeChange,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(mode === "custom");
  const [calendarMonth, setCalendarMonth] = useState(rangeStart ? monthKey(rangeStart) : selectedMonth);
  const [draftStart, setDraftStart] = useState<string | null>(rangeStart);
  const [draftEnd, setDraftEnd] = useState<string | null>(rangeEnd);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarDays = calendarDaysForMonth(calendarMonth);
  const rangeLabel = rangeStart && rangeEnd
    ? `${formatDateLabel(rangeStart)} → ${formatDateLabel(rangeEnd)}`
    : "Personalizado";
  const triggerLabel = mode === "current"
    ? "Este mês"
    : mode === "month"
      ? "Mês selecionado"
      : rangeLabel;

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pickerWidth = Math.min(304, window.innerWidth - 32);
      setPopoverPosition({
        top: Math.min(rect.bottom + 8, Math.max(16, window.innerHeight - 450)),
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
  }, [open]);

  const openCustomCalendar = () => {
    setDraftStart(rangeStart);
    setDraftEnd(rangeEnd);
    setCalendarMonth(rangeStart ? monthKey(rangeStart) : selectedMonth);
    setShowCalendar(true);
    setOpen(true);
  };

  const handlePick = (date: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }
    const [start, end] = date < draftStart ? [date, draftStart] : [draftStart, date];
    setDraftStart(start);
    setDraftEnd(end);
    onModeChange("custom");
    onRangeChange(start, end);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Selecionar período"
        aria-expanded={open}
        onClick={() => {
          setDraftStart(rangeStart); setDraftEnd(rangeEnd);
          setCalendarMonth(rangeStart ? monthKey(rangeStart) : selectedMonth);
          setShowCalendar(mode === "custom"); setOpen((current) => !current);
        }}
        className={cn(
          "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold transition-all",
          mode === "custom"
            ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
            : "glass text-glass-sub",
        )}
      >
        <CalendarDays className="size-3.5" />
        <span className="min-w-0 truncate">{triggerLabel}</span>
      </button>

      {open && popoverPosition && createPortal(
        <div
          style={{ top: popoverPosition.top, left: popoverPosition.left, maxHeight: `calc(100dvh - ${popoverPosition.top + 16}px)` }}
          className="fixed z-[210] max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-glass-ink/10 bg-[#f4f8ff] p-3 text-glass-ink shadow-[0_18px_45px_-18px_rgba(15,40,90,0.55)] dark:border-white/10 dark:bg-[#0d1b3e] dark:text-white"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold">Período do extrato</p>
            <button type="button" aria-label="Fechar seletor de período" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-full hover:bg-primary/10"><X className="size-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onModeChange("current");
                onRangeChange(null, null);
                setOpen(false);
              }}
              className={cn(
                "rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors",
                !showCalendar && mode === "current" ? "bg-primary text-white" : "glass text-glass-sub hover:text-primary",
              )}
            >
              Este mês
            </button>
            <button
              type="button"
              aria-pressed={showCalendar}
              onClick={openCustomCalendar}
              className={cn(
                "rounded-xl px-2 py-2 text-[10px] font-semibold transition-colors",
                showCalendar ? "bg-primary text-white" : "glass text-glass-sub hover:text-primary",
              )}
            >
              Personalizado
            </button>
          </div>

          {showCalendar && (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Mês anterior do período personalizado"
                  onClick={() => setCalendarMonth((current) => shiftMonth(current, -1))}
                  className="flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <p className="text-[12px] font-bold uppercase tracking-wide">
                  {monthShortLabel(calendarMonth)} {calendarMonth.slice(0, 4)}
                </p>
                <button
                  type="button"
                  aria-label="Próximo mês do período personalizado"
                  onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
                  className="flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] font-medium text-glass-faint">
                Escolha a data inicial e depois a data final.
              </p>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-glass-faint">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  if (!date) return <span key={`empty-${index}`} />;
                  const selected = date === draftStart || date === draftEnd;
                  const inRange = Boolean(draftStart && draftEnd && date > draftStart && date < draftEnd);
                  return (
                    <button
                      key={date}
                      type="button"
                      aria-label={formatDateLabel(date)}
                      aria-pressed={selected}
                      onClick={() => handlePick(date)}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                        selected
                          ? "bg-primary text-white"
                          : inRange
                            ? "bg-primary/10 text-primary"
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
                  {draftStart && draftEnd
                    ? `${formatDateLabel(draftStart)} → ${formatDateLabel(draftEnd)}`
                    : draftStart
                      ? `Início: ${formatDateLabel(draftStart)}`
                      : "Nenhum período aplicado"}
                </p>
                {(rangeStart || rangeEnd) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftStart(null);
                      setDraftEnd(null);
                      onRangeChange(null, null);
                    }}
                    className="rounded-full px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
                  >
                    Remover filtro
                  </button>
                )}
              </div>
            </>
          )}
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

type InvoiceStatusFilter = "all" | "open" | "paid";
type TransactionSearchScope = "month" | "all";

type CardActionMenuProps = {
  card: AppCard;
  canPay: boolean;
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
  onToggleHeaderColor: () => void;
};

function CardActionMenu({
  card,
  canPay,
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
  onToggleHeaderColor,
}: CardActionMenuProps) {
  const [open, setOpen] = useState(false);
  const launchAction = useRef(false);
  const select = (action: () => void) => {
    launchAction.current = true; setOpen(false);
    window.requestAnimationFrame(action);
  };
  const groups = [
    { label: "Fatura", options: [
      { label: "Reajustar fatura", icon: SlidersHorizontal, action: onRecalculate },
      { label: "Registrar parcela", icon: CreditCard, action: onInstallInvoice, disabled: !canPay },
      { label: "Editar fechamento", icon: CalendarClock, action: onEditClosingDay },
    ] },
    { label: "Consultar", options: [
      { label: "Histórico de compras", icon: History, action: onHistory },
      { label: "Despesas associadas", icon: ReceiptText, action: onExpenses },
      { label: "Gráfico por categorias", icon: ChartNoAxesColumn, action: onCategoryChart },
      { label: "Evolução mensal", icon: TrendingUp, action: onMonthlyTrend },
    ] },
    { label: "Cartão", options: [
      { label: "Editar cartão", icon: Pencil, action: onEdit },
      { label: card.invoiceHeaderColorMode === "card" ? "Usar cor do banco na faixa" : "Usar cor do cartão na faixa", icon: Palette, action: onToggleHeaderColor },
      { label: "Arquivar cartão", icon: Archive, action: onArchive },
      { label: "Excluir cartão", icon: Trash2, action: onDelete },
    ] },
  ];
  return (
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={(next) => { if (next) launchAction.current = false; setOpen(next); }}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Opções de ${card.name}`} className="flex size-11 shrink-0 items-center justify-center bg-transparent text-white transition-opacity hover:opacity-75 active:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><MoreVertical className="size-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} onClick={(event) => event.stopPropagation()} onCloseAutoFocus={(event) => { if (launchAction.current) event.preventDefault(); }} className="z-[200] w-[min(17rem,calc(100vw-1.5rem))] rounded-2xl border-white/70 bg-[#f4f8ff] p-1.5 text-glass-ink shadow-xl">
          {groups.map((group, index) => <div key={group.label}>
            {index > 0 && <DropdownMenuSeparator className="my-1 bg-glass-ink/10" />}
            <DropdownMenuLabel className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-glass-sub">{group.label}</DropdownMenuLabel>
            {group.options.map(({ label, icon: Icon, action, ...option }) => <DropdownMenuItem key={label} disabled={"disabled" in option && option.disabled} onSelect={() => select(action)} className={cn("min-h-11 cursor-pointer rounded-xl px-3 text-[12px] font-semibold focus:bg-primary/10 focus:text-glass-ink", action === onDelete && "text-[#B42338] focus:text-[#B42338]")}>
              <Icon className={cn("size-4", action === onDelete ? "text-[#B42338]" : "text-primary")} />{label}
            </DropdownMenuItem>)}
          </div>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type InvoiceSummaryCardProps = {
  card: AppCard;
  expanded: boolean;
  headerAppearance: InvoiceHeaderAppearance;
  month: string;
  today: string;
  openAmount: number;
  committedAmount: number;
  invoiceTotal: number;
  paidAmount: number;
  invoicePaid: boolean;
  selected: boolean;
  onViewStatement: () => void;
  onToggleExpanded: () => void;
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
  onToggleHeaderColor: () => void;
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
  return `${getInvoiceDates(card, month)?.dueDate.slice(8) ?? String(card.dueDay).padStart(2, "0")}/${monthLabel}`;
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
  const [partialValue, setPartialValue] = useState(outstandingAmount.toFixed(2).replace(".", ","));
  const [installmentCount, setInstallmentCount] = useState(String(card.invoicePaymentsByMonth?.[month]?.installments ?? 3));
  const [step, setStep] = useState<"form" | "confirmation">("form");

  const count = Number(installmentCount);
  const paymentAmount = getInvoicePaymentAmount(outstandingAmount, mode, partialValue, count, totalAmount);
  const selectedAmount = paymentAmount ?? 0;
  const isValid = paymentAmount !== null;

  const handleContinue = () => {
    if (!isValid) return;
    setStep("confirmation");
  };

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      totalAmount,
      paidAmount: Math.min(totalAmount, Math.round((alreadyPaidAmount + selectedAmount) * 100) / 100),
      paymentDate: localDateKey(),
      installments: mode === "installments" ? count : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-3xl border-glass-ink/10 bg-[#f4f8ff] p-0 text-glass-ink">
        <div className="shrink-0 border-b border-glass-ink/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                Pagamento da fatura
              </p>
              <DialogTitle className="mt-1 text-[20px] font-bold">
                {step === "form" ? "Como deseja pagar?" : "Confirmar pagamento"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] text-glass-sub">
                {card.name} ····{card.last4} · {monthShortLabel(month)} {month.slice(0, 4)}
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Fechar pagamento da fatura"
              onClick={onClose}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/60 text-glass-sub dark:bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>

        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
          <div className="glass glass-soft rounded-2xl px-4 py-4 text-center">
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
                    installments: "Parcela",
                  };
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={mode === option}
                      onClick={() => setMode(option)}
                      className={cn(
                        "rounded-full px-3 py-2 text-[11px] font-bold transition-colors",
                        mode === option
                          ? "bg-primary text-white"
                          : "glass text-glass-sub hover:text-glass-ink",
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
                    aria-invalid={paymentAmount === null}
                    aria-describedby="invoice-payment-error"
                    className="mt-1 w-full rounded-2xl border border-glass-ink/10 bg-white/60 px-4 py-3 text-[15px] font-bold text-glass-ink outline-none focus:border-primary"
                    aria-label="Valor do pagamento parcial"
                  />
                </label>
              )}

              {mode === "installments" && (
                <div className="mt-4 rounded-2xl bg-primary/5 px-4 py-3">
                  <label className="block text-[11px] font-semibold text-glass-sub">
                    Dividir o total da fatura em quantos pagamentos?
                    <input
                      value={installmentCount}
                      onChange={(event) => setInstallmentCount(event.target.value)}
                      type="number"
                      min={2}
                      max={48}
                      className="mt-1 w-full rounded-2xl border border-glass-ink/10 bg-white/60 px-4 py-3 text-[15px] font-bold text-glass-ink outline-none focus:border-primary"
                      aria-label="Quantidade de parcelas da fatura"
                    />
                  </label>
                  <p className="mt-2 text-[12px] text-glass-sub">
                    Valor sugerido desta parcela: <strong>{formatCurrency(selectedAmount)}</strong>
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-glass-sub">A sugestão usa o total da fatura e a quantidade escolhida. Registra apenas este pagamento; o restante continua em aberto, sem gerar parcelas ou juros automaticamente.</p>
                </div>
              )}

              {!isValid && <p id="invoice-payment-error" role="alert" className="mt-3 text-[12px] font-semibold text-red-600 dark:text-red-300">{mode === "installments" ? "Informe uma quantidade inteira de 2 a 48 parcelas." : `Informe um valor maior que zero e até ${formatCurrency(outstandingAmount)}.`}</p>}
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-glass-ink/10 px-4 py-3 text-[13px] font-semibold text-glass-sub transition-colors hover:text-glass-ink"
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
                Você está registrando {formatCurrency(selectedAmount)} na fatura de {monthShortLabel(month)} {month.slice(0, 4)}. Depois do pagamento, restarão <strong>{formatCurrency(Math.max(0, Math.round((outstandingAmount - selectedAmount) * 100) / 100))}</strong> em aberto.
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  className="rounded-full border border-glass-ink/10 px-4 py-3 text-[13px] font-semibold text-glass-sub transition-colors hover:text-glass-ink"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!isValid}
                  className="rounded-full bg-primary px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
                >
                  Confirmar
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceUtilityDialog({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-3xl border-glass-ink/10 bg-[#f4f8ff] p-0 text-glass-ink">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-glass-ink/10 p-5">
        <div className="min-w-0"><DialogTitle className="text-[19px] font-bold">{title}</DialogTitle><DialogDescription className="mt-1 break-words text-[12px] text-glass-sub">{description}</DialogDescription></div>
        <button type="button" aria-label={`Fechar ${title}`} onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/5 text-glass-sub"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
    </DialogContent>
  </Dialog>;
}

type CardAnalyticsKind = "categoryChart" | "monthlyTrend";
function CardAnalyticsModal({ card, kind, transactions, categoryById, month, onClose }: {
  card: AppCard; kind: CardAnalyticsKind; transactions: Transaction[]; month: string;
  categoryById: Record<string, { label: string; color: string }>; onClose: () => void;
}) {
  const [analyticsMonth, setAnalyticsMonth] = useState(month);
  const [scope, setScope] = useState<"invoice" | "history">("invoice");
  const [trendMode, setTrendMode] = useState<"history" | "forecast">("history");
  const categories = useMemo(() => getCardCategoryAnalytics(card, transactions, categoryById, analyticsMonth, scope), [card, transactions, categoryById, analyticsMonth, scope]);
  const monthlyData = useMemo(() => getCardMonthlyAnalytics(card, transactions, analyticsMonth, trendMode).map((entry) => ({ ...entry, label: `${monthShortLabel(entry.key).slice(0, 3)} ${entry.key.slice(2, 4)}` })), [card, transactions, analyticsMonth, trendMode]);
  const categoryChart = kind === "categoryChart";
  return <InvoiceUtilityDialog title={categoryChart ? "Gastos por categoria" : "Evolução mensal"} description={`${card.name} ····${card.last4}`} onClose={onClose}>
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-primary/5 p-1">
      <button type="button" aria-label="Mês anterior da análise" onClick={() => setAnalyticsMonth((month) => shiftInvoiceMonth(month, -1))} className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary"><ChevronLeft className="size-4" /></button>
      <p className="text-center text-[13px] font-bold">{monthShortLabel(analyticsMonth)} {analyticsMonth.slice(0, 4)}</p>
      <button type="button" aria-label="Próximo mês da análise" onClick={() => setAnalyticsMonth((month) => shiftInvoiceMonth(month, 1))} className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary"><ChevronRight className="size-4" /></button>
    </div>
    <div role="group" aria-label="Período da análise" className="mt-3 grid grid-cols-2 gap-2">
      {(categoryChart ? [{ id: "invoice", label: "Esta fatura" }, { id: "history", label: "Todo o histórico" }] : [{ id: "history", label: "Últimos 12 meses" }, { id: "forecast", label: "Próximos 12 meses" }]).map((option) => {
        const selected = (categoryChart ? scope : trendMode) === option.id;
        return <button type="button" key={option.id} aria-pressed={selected} onClick={() => { if (categoryChart) setScope(option.id as "invoice" | "history"); else setTrendMode(option.id as "history" | "forecast"); }} className={cn("min-h-11 rounded-full border px-2 py-2 text-[11px] font-bold", selected ? "border-primary bg-primary text-white" : "border-primary/15 bg-white/40 text-glass-sub")}>{option.label}</button>;
      })}
    </div>
    <p className="mt-3 text-[11px] leading-relaxed text-glass-sub">{categoryChart ? scope === "invoice" ? "Compras e parcelas desta fatura, separadas por categoria." : "Cada compra entra uma vez, pelo valor original completo." : `${monthlyData[0].label} a ${monthlyData[11].label}. Compras distribuídas pelas faturas em que vencem. A previsão inclui apenas parcelas já cadastradas.`}</p>
    {categoryChart ? <>
      {scope === "invoice" && card.invoiceOverrideByMonth?.[analyticsMonth] !== undefined && <p className="mt-2 rounded-xl bg-primary/5 p-2 text-[11px] text-glass-sub">Reajustes manuais da fatura não alteram os valores das compras neste gráfico.</p>}
      <CategoryExpenseChart key={`${analyticsMonth}-${scope}`} data={categories.data} total={categories.total} />
    </> : <>
      <div className="mt-4 overflow-x-auto pb-2"><div className="h-52 min-w-[32rem]">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyData} margin={{ top: 10, right: 12, left: 12, bottom: 0 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10, fill: "var(--glass-sub)" }} /><YAxis hide />
          <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 14, background: "#f4f8ff", color: "#1c2a4a" }} />
          <Line type="linear" dataKey="value" name="Compras na fatura" stroke="#2F6BFF" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart></ResponsiveContainer>
      </div></div>
      <p className="text-[10px] text-glass-sub">Arraste o gráfico para ver todos os meses.</p>
      <ul aria-label="Valores por mês" className="mt-3 space-y-2">{monthlyData.map((entry) => <li key={entry.key} className={cn("flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[12px]", entry.key === analyticsMonth && "bg-primary/10 font-bold")}><span>{monthShortLabel(entry.key)} {entry.key.slice(0, 4)}</span><span className="amount-tabular font-semibold">{formatCurrency(entry.value)}</span></li>)}</ul>
    </>}
  </InvoiceUtilityDialog>;
}

function InvoiceNumberModal({ card, month, kind, initialValue, minimumAmount, automaticTotal, hasOverride, onClose, onConfirm }: {
  card: AppCard; month: string; kind: "amount" | "closingDay"; initialValue: number;
  minimumAmount: number; automaticTotal: number; hasOverride: boolean;
  onClose: () => void; onConfirm: (value: number | undefined) => void;
}) {
  const [value, setValue] = useState(kind === "amount" ? initialValue.toFixed(2).replace(".", ",") : String(initialValue));
  const amount = kind === "amount";
  const parsed = amount ? parseInvoiceMoney(value) : Number(value);
  const valid = parsed !== null && (amount ? parsed >= minimumAmount : Number.isInteger(parsed) && parsed >= 1 && parsed <= 31);
  return <InvoiceUtilityDialog title={amount ? "Reajustar fatura" : "Editar fechamento"} description={`${card.name} · ${monthShortLabel(month)} ${month.slice(0, 4)}`} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (valid && parsed !== null) onConfirm(parsed); }} className="space-y-4">
      <p className="text-[12px] leading-relaxed text-glass-sub">{amount ? "Altere apenas o total desta fatura. As compras e os pagamentos registrados serão mantidos." : "As compras já registradas permanecem em suas faturas originais. O novo fechamento será usado nas próximas compras."}</p>
      {amount && <div className="space-y-1 rounded-2xl bg-primary/5 p-3 text-[12px]"><p className="flex justify-between gap-3"><span>Total das compras</span><strong>{formatCurrency(automaticTotal)}</strong></p><p className="flex justify-between gap-3"><span>Já pago</span><strong>{formatCurrency(minimumAmount)}</strong></p></div>}
      <label className="block text-[12px] font-semibold">{amount ? "Novo total da fatura (R$)" : "Dia do mês (1 a 31)"}
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} type={amount ? "text" : "number"} inputMode={amount ? "decimal" : "numeric"} min={amount ? undefined : 1} max={amount ? undefined : 31} aria-invalid={!valid} aria-describedby="invoice-number-help" className="mt-2 min-h-12 w-full rounded-2xl border border-glass-ink/15 bg-white/60 px-4 text-[18px] font-bold text-glass-ink outline-none focus:border-primary" />
      </label>
      <p id="invoice-number-help" className={cn("text-[12px]", valid ? "text-glass-sub" : "text-[#B42338]")}>{!valid ? amount ? `Informe um valor válido, igual ou maior que o já pago: ${formatCurrency(minimumAmount)}.` : "Informe um dia inteiro entre 1 e 31." : amount && parsed !== null ? `Após o reajuste, faltará pagar ${formatCurrency(Math.round((parsed - minimumAmount) * 100) / 100)}.` : "Em meses mais curtos, será usado o último dia disponível."}</p>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-full border border-glass-ink/15 text-[12px] font-bold">Cancelar</button><button type="submit" disabled={!valid} className="min-h-11 rounded-full bg-primary text-[12px] font-bold text-white disabled:opacity-40">Salvar</button></div>
      {amount && hasOverride && <button type="button" disabled={automaticTotal < minimumAmount} onClick={() => onConfirm(undefined)} className="min-h-11 w-full rounded-full border border-primary/20 px-3 text-[12px] font-bold text-primary disabled:opacity-40">Usar total das compras: {formatCurrency(automaticTotal)}</button>}
      {amount && hasOverride && automaticTotal < minimumAmount && <p className="text-[11px] text-glass-sub">O total das compras é menor que o valor já pago. Reabra a fatura para corrigir os pagamentos antes de reduzir o total.</p>}
    </form>
  </InvoiceUtilityDialog>;
}

function EmptyInvoiceModal({ card, onClose }: { card: AppCard; onClose: () => void }) {
  return <InvoiceUtilityDialog title="Fatura sem valor a pagar" description={card.name} onClose={onClose}><p className="text-[13px] text-glass-sub">Esta fatura não tem valor em aberto para registrar um pagamento.</p><button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-full bg-primary text-[13px] font-bold text-white">Fechar</button></InvoiceUtilityDialog>;
}

function InvoiceSummaryCard({
  card, expanded, headerAppearance, month, today, openAmount, committedAmount, invoiceTotal, paidAmount,
  invoicePaid, selected, onViewStatement, onToggleExpanded, onRequestPayment, onReopenInvoice,
  onEdit, onRecalculate, onInstallInvoice, onEditClosingDay, onHistory,
  onExpenses, onCategoryChart, onMonthlyTrend, onArchive, onDelete, onToggleHeaderColor,
}: InvoiceSummaryCardProps) {
  const bodyId = useId();
  const limit = card.totalLimit;
  const availableLimit = typeof limit === "number"
    ? Math.max(0, Math.round((limit - committedAmount) * 100) / 100) : undefined;
  const usagePercent = typeof limit === "number" && limit > 0 ? Math.max(0, committedAmount / limit * 100) : 0;
  const dates = getInvoiceDates(card, month);
  const status = getCardInvoiceStatus(card, month, { invoicePaid, invoiceTotal, paidAmount }, today);
  // Each status has a distinct badge; detail panels keep a fixed palette.
  const appearance = {
    paid: { label: "Fatura paga", icon: CheckCircle2, badge: "border-[#B8DEC7] bg-[#E9F7EF] text-[#166534]" },
    overdue: { label: "Fatura vencida", icon: CircleAlert, badge: "border-[#F2B6BD] bg-[#FFF0F0] text-[#C81E2A]" },
    partial: { label: "Pagamento parcial", icon: CircleDollarSign, badge: "border-[#EBC5DF] bg-[#FFF0FA] text-[#9B287B]" },
    due: { label: "Vence hoje", icon: Clock3, badge: "border-[#E8CF53] bg-[#FFF7BA] text-[#796000]" },
    open: { label: "Fatura em aberto", icon: ReceiptText, badge: "border-[#F6D7B2] bg-[#FFF6EB] text-[#B95408]" },
    empty: { label: "Sem valores", icon: CircleDashed, badge: "border-[#D1D4DA] bg-[#F1F2F4] text-[#4A5059]" },
  }[status];
  const StatusIcon = appearance.icon;

  return (
    <div
      role="group"
      aria-label={`Fatura de ${card.name}, ${appearance.label}`}
      style={{ "--invoice-band-color": headerAppearance.middle } as CSSProperties}
      className={cn(
        "glass invoice-glass-card overflow-hidden rounded-[26px] text-glass-ink transition-shadow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-white/60",
      )}
    >
      <div className="invoice-glass-band flex items-center justify-between gap-3 px-4 py-3.5" style={{ backgroundColor: headerAppearance.middle, backgroundImage: getCardGlassBackground(headerAppearance), color: headerAppearance.foreground, textShadow: "0 1px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.7)" }}>
        <button type="button" onClick={onToggleExpanded} aria-expanded={expanded} aria-controls={bodyId} aria-label={`${expanded ? "Recolher" : "Expandir"} fatura de ${card.name}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
          <CardBrandMark card={card} className="h-9 shrink-0 border-white/35 bg-transparent text-white [text-shadow:none]" />
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-snug [overflow-wrap:anywhere]">{card.name}</p>
            <p className="mt-0.5 text-[11px] font-medium [overflow-wrap:anywhere]">{card.institution || "Cartão"} ····{card.last4}</p>
          </div>
          <ChevronDown className={cn("ml-auto size-5 shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)] transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        </button>
        <CardActionMenu card={card} canPay={openAmount > 0} onEdit={onEdit} onRecalculate={onRecalculate}
          onInstallInvoice={onInstallInvoice} onEditClosingDay={onEditClosingDay}
          onHistory={onHistory} onExpenses={onExpenses} onCategoryChart={onCategoryChart}
          onMonthlyTrend={onMonthlyTrend} onArchive={onArchive} onDelete={onDelete} onToggleHeaderColor={onToggleHeaderColor} />
      </div>

      <div id={bodyId} hidden={!expanded} className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-glass-sub">Falta pagar</p>
            <p className="amount-tabular mt-0.5 text-[26px] font-bold leading-tight tracking-tight text-glass-ink [overflow-wrap:anywhere]">{formatCurrency(openAmount)}</p>
          </div>
          <div className="ml-auto flex min-w-0 flex-col items-end gap-1.5 text-right">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold", appearance.badge)}>
              <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />{appearance.label}
            </span>
            <span className="text-[10px] font-medium text-glass-sub">{monthShortLabel(month)} {month.slice(0, 4)} · {dates ? `Vence em ${formatDateLabel(dates.dueDate).slice(0, 5)}` : card.dueDay ? `Vence dia ${card.dueDay}` : "Sem vencimento informado"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-2xl border border-[#CBD9F3] bg-gradient-to-br from-[#E6EEFF]/90 to-[#F7FAFF]/65 p-3 shadow-[inset_3px_0_0_#6E9CE5]">
            <p className="flex min-h-8 items-center gap-1.5 text-[11px] font-medium text-glass-sub"><span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#C9DBFA]/65 text-[#2455A0]"><ReceiptText className="size-3.5" aria-hidden="true" /></span><span>Total desta fatura</span></p>
            <p className="amount-tabular mt-1 text-[14px] font-bold text-[#2455A0] [overflow-wrap:anywhere]">{formatCurrency(invoiceTotal)}</p>
          </div>
          <div className="min-w-0 rounded-2xl border border-[#BFDCC9] bg-gradient-to-bl from-[#E5F6EC]/90 to-[#F5FCF8]/65 p-3 text-right shadow-[inset_-3px_0_0_#62AD82]">
            <p className="flex min-h-8 items-center justify-end gap-1.5 text-[11px] font-medium text-[#236947]"><span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#C5E7D1]/65 text-[#166534]"><CheckCircle2 className="size-3.5" aria-hidden="true" /></span><span>Já pago</span></p>
            <p className="amount-tabular mt-1 text-[14px] font-bold text-[#166534] [overflow-wrap:anywhere]">{formatCurrency(paidAmount)}</p>
          </div>
        </div>

        <details className="group border-t border-glass-ink/10 pt-3" onClick={(event) => event.stopPropagation()}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-[#AFDAE8] bg-gradient-to-r from-[#E7F7FC]/90 to-[#F3FBFF]/75 px-3 py-2.5 text-[11px] focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 font-medium text-[#19576C]">Disponível no limite</span>
            <span className="flex shrink-0 items-center gap-2"><span className="amount-tabular whitespace-nowrap text-[14px] font-bold text-[#086B84]">{typeof availableLimit === "number" ? formatCurrency(availableLimit) : "—"}</span><ChevronDown className="size-4 shrink-0 text-[#086B84] transition-transform group-open:rotate-180" aria-hidden="true" /></span>
          </summary>
          <div className="space-y-3 pb-1 pt-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Limite total", amount: typeof limit === "number" ? limit : undefined, tone: "border-[#D8C2AE] from-[#F5EBE1]/90 to-[#FCF8F3]/65 text-[#76513A] shadow-[inset_0_2px_0_#9C765B]" },
                { label: "Comprometido", amount: committedAmount, tone: "border-[#D28C6C] from-[#F8CCBA]/95 to-[#FBE3D6]/90 text-[#8F391E] shadow-[inset_0_2px_0_#C16B46]" },
                { label: "Disponível", amount: availableLimit, tone: "border-[#A8B75A] from-[#DFE8A5]/95 to-[#EDF1C8]/90 text-[#4E631A] shadow-[inset_0_2px_0_#899D31]" },
              ].map((item, index) => (
                <div key={item.label} className={cn("min-w-0 rounded-xl border bg-gradient-to-br px-1.5 py-2 sm:px-2.5", item.tone, index === 2 && "text-right")}>
                  <p className="min-h-5 text-[10px] font-semibold leading-tight [overflow-wrap:anywhere] sm:min-h-0">{item.label}</p>
                  <p className="amount-tabular mt-1 text-[clamp(0.6rem,2.7vw,0.75rem)] font-bold [overflow-wrap:anywhere]">{typeof item.amount === "number" ? formatCurrency(item.amount) : "—"}</p>
                </div>
              ))}
            </div>
            <div role="progressbar" aria-label="Limite comprometido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(usagePercent))} aria-valuetext={typeof limit === "number" && limit > 0 ? `${Math.round(usagePercent)}% do limite utilizado` : "Limite não informado"} className="h-1.5 overflow-hidden rounded-full bg-glass-ink/10">
              <div className="h-full rounded-full bg-gradient-to-r from-[#DDA58E] to-[#B05D40] transition-[width]" style={{ width: `${Math.min(100, usagePercent)}%` }} />
            </div>
            <p className="text-[10px] leading-relaxed text-glass-sub"><span className="font-semibold text-[#A2472C]">{typeof limit === "number" && limit > 0 ? `${Math.round(usagePercent)}% utilizado` : "Limite não informado"}</span> · Inclui parcelas futuras e faturas anteriores em aberto.</p>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="flex min-w-0 items-start gap-1.5 rounded-2xl border border-[#D8CCF3] bg-gradient-to-br from-[#EEE8FC]/85 to-[#FBF9FF]/65 p-2.5 text-[#6D4BB0] shadow-[inset_2px_0_0_#A18BCE]">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0"><p className="font-medium">Fechamento</p><p className="mt-1 font-bold">{dates ? formatDateLabel(dates.closingDate).slice(0, 5) : card.closingDay ? `Dia ${card.closingDay}` : "Não informado"}</p></div>
              </div>
              <div className="flex min-w-0 items-start justify-end gap-1.5 rounded-2xl border border-[#EEC5D0] bg-gradient-to-bl from-[#FFEAF0]/85 to-[#FFF8FA]/65 p-2.5 text-right text-[#A13B5A] shadow-[inset_-2px_0_0_#D58AA0]">
                <CalendarDays className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0"><p className="font-medium">Vencimento</p><p className="mt-1 font-bold">{dates ? formatDateLabel(dates.dueDate).slice(0, 5) : card.dueDay ? `Dia ${card.dueDay}` : "Não informado"}</p></div>
              </div>
            </div>
          </div>
        </details>

        <div className="grid grid-cols-2 gap-2 border-t border-glass-ink/10 pt-3">
          <button type="button" onClick={onViewStatement} aria-controls="card-invoice-extract" className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10">
            <ReceiptText className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Ver extrato</span>
          </button>
          <button type="button" onClick={(event) => {
            event.stopPropagation(); if (invoicePaid) onReopenInvoice(); else onRequestPayment();
          }} disabled={!invoicePaid && invoiceTotal <= 0} className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full bg-primary px-2 py-2 text-[11px] font-bold text-white transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45">
            {invoicePaid ? <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" /> : <Check className="size-3.5 shrink-0" aria-hidden="true" />}
            <span>{invoicePaid ? "Reabrir fatura" : "Registrar pagamento"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CardPurchasesPage() {
  const navigate = useNavigate();
  const today = useLocalDate();
  const currentMonthKey = today.slice(0, 7);
  const invoiceRequest = useLocation().state as { cardId?: string; invoiceMonth?: string } | null;
  const {
    transactions,
    loanTransactions,
    loanReceivables,
    cards,
    activeProfile,
    categoryById,
    updateCard,
    reorderCards,
    invoiceCardDisplayMode,
    setInvoiceCardDisplayMode,
    includeBorrowedCardPurchases,
    setIncludeBorrowedCardPurchases,
    setCardInvoiceStatus,
    setCardInvoicePayment,
    setCardInvoiceOverride,
    deleteCard,
  } = useAppStore();
  const [month, setMonth] = useState<string>(currentMonthKey);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [monthsDialogOpen, setMonthsDialogOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [loanHelpExpanded, setLoanHelpExpanded] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  useEffect(() => {
    if (!invoiceRequest?.cardId) return;
    setSelectedCardId(invoiceRequest.cardId);
    if (invoiceRequest.invoiceMonth && sanitizeInvoiceMonth(invoiceRequest.invoiceMonth)) {
      setMonth(invoiceRequest.invoiceMonth);
      setPeriodMode("month"); setRangeStart(null); setRangeEnd(null);
    }
  }, [invoiceRequest?.cardId, invoiceRequest?.invoiceMonth]);
  const [transactionSearch, setTransactionSearch] = useState("");
  const {
    activeIndex: activeTransactionSearchIndex,
    goToPrevious: goToPreviousTransactionResult,
    goToNext: goToNextTransactionResult,
  } = useSearchNavigation(transactionSearch);
  const [transactionSearchScope, setTransactionSearchScope] =
    useState<TransactionSearchScope>("month");
  const [transactionCategory, setTransactionCategory] = useState("todas");
  const [invoiceStatusFilter, setInvoiceStatusFilter] =
    useState<InvoiceStatusFilter>("all");
  const [paymentCard, setPaymentCard] = useState<AppCard | null>(null);
  const [paymentInitialMode, setPaymentInitialMode] = useState<PaymentMode>("full");
  const [cardRemoval, setCardRemoval] = useState<{ card: AppCard; mode: "archive" | "delete" } | null>(null);
  const [statementRequest, setStatementRequest] = useState(0);
  const [orderOpen, setOrderOpen] = useState(false);
  const [cardDisplayOverrides, setCardDisplayOverrides] = useState<{ profileId?: string; cards: Record<string, boolean> }>(() => ({ profileId: activeProfile?.id, cards: {} }));
  const displayOverrides = cardDisplayOverrides.profileId === activeProfile?.id ? cardDisplayOverrides.cards : {};
  useEffect(() => {
    setCardDisplayOverrides({ profileId: activeProfile?.id, cards: {} });
  }, [activeProfile?.id, invoiceCardDisplayMode]);
  const [reopenCard, setReopenCard] = useState<AppCard | null>(null);
  const [zeroInvoiceCard, setZeroInvoiceCard] = useState<AppCard | null>(null);
  const [utilityCard, setUtilityCard] = useState<AppCard | null>(null);
  const [utilityKind, setUtilityKind] = useState<
    "amount" | "closingDay" | CardAnalyticsKind | null
  >(null);

  const dialogProfile = useRef(activeProfile?.id);
  useEffect(() => {
    if (dialogProfile.current === activeProfile?.id) return;
    dialogProfile.current = activeProfile?.id;
    setOrderOpen(false);
    setPaymentCard(null); setReopenCard(null); setZeroInvoiceCard(null); setCardRemoval(null);
    setUtilityCard(null); setUtilityKind(null); setSelectedCardId("");
    setTransactionSearch(""); setTransactionCategory("todas"); setTransactionSearchScope("month");
    setSelectedMonths([]); setFiltersExpanded(false); setMonthsDialogOpen(false); setLoanHelpExpanded(false);
  }, [activeProfile?.id]);

  useEffect(() => {
    if (!statementRequest || !selectedCardId) return;
    const frame = window.requestAnimationFrame(() => {
      const statement = document.getElementById("card-invoice-extract");
      statement?.focus({ preventScroll: true });
      statement?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [statementRequest, selectedCardId]);

  const cardTransactions = useMemo(() => {
    const personal = selectCardPurchases(transactions);
    const borrowed = includeBorrowedCardPurchases ? getBorrowedCardTransactions(loanReceivables) : [];
    return [...personal, ...borrowed].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, loanReceivables, includeBorrowedCardPurchases]);
  const monthOptions = useMemo(() => {
    const invoiceHistoryMonths = cards.flatMap((card) =>
      [...Object.keys(card.invoicePaidByMonth ?? {}), ...Object.keys(card.invoicePaymentsByMonth ?? {}), ...Object.keys(card.invoiceOverrideByMonth ?? {})].filter((key) =>
        /^\d{4}-\d{2}$/.test(key),
      ),
    );
    const navigableMonths = Array.from({ length: 49 }, (_, index) =>
      shiftMonth(currentMonthKey, 24 - index),
    );
    return [
      ...new Set([
        month,
        ...navigableMonths,
        ...cardTransactions.flatMap((transaction) => getTransactionInvoiceSchedule(transaction, cards.find((card) => card.id === transaction.cardId)).map((part) => part.month)),
        ...invoiceHistoryMonths,
        ...loanReceivables.filter((row) => row.operationType === "card" && row.cardInvoiceMonth).map((row) => row.cardInvoiceMonth!),
      ]),
    ].sort((a, b) => b.localeCompare(a));
  }, [cardTransactions, cards, currentMonthKey, month, loanReceivables]);

  useEffect(() => {
    if (periodMode === "current") setMonth(currentMonthKey);
  }, [currentMonthKey, periodMode]);
  const selectedMonth = monthOptions.includes(month)
    ? month
    : monthOptions.includes(currentMonthKey)
      ? currentMonthKey
      : monthOptions[0];
  const activeRangeStart = periodMode === "custom" && rangeStart && rangeEnd ? rangeStart : null;
  const activeRangeEnd = periodMode === "custom" && rangeStart && rangeEnd ? rangeEnd : null;
  const selectedPeriodLabel = activeRangeStart && activeRangeEnd
    ? `${formatDateLabel(activeRangeStart)} → ${formatDateLabel(activeRangeEnd)}`
    : selectedMonths.length > 0
      ? selectedMonths.map((key) => `${monthShortLabel(key)} ${key.slice(0, 4)}`).join(" · ")
      : `${monthShortLabel(selectedMonth)} ${selectedMonth.slice(0, 4)}`;
  const handleSelectMonth = (nextMonth: string) => {
    setSelectedMonths([]);
    setMonth(nextMonth);
    setPeriodMode(nextMonth === currentMonthKey ? "current" : "month");
    setRangeStart(null);
    setRangeEnd(null);
  };
  const hasInvoiceFilters = Boolean(
    selectedMonths.length > 0 ||
      month !== currentMonthKey ||
      periodMode !== "current" ||
      rangeStart ||
      rangeEnd ||
      invoiceStatusFilter !== "all",
  );
  const clearInvoiceFilters = () => {
    setSelectedMonths([]);
    setMonth(currentMonthKey);
    setPeriodMode("current");
    setRangeStart(null);
    setRangeEnd(null);
    setInvoiceStatusFilter("all");
  };
  const clearTransactionFilters = () => {
    setTransactionSearch("");
    setTransactionSearchScope("month");
    setTransactionCategory("todas");
  };

  const headerAppearances = useMemo(() => getInvoiceHeaderAppearances(cards), [cards]);
  const metricsByCard = useMemo(() => Object.fromEntries(cards.map((card) => [
    card.id, { ...getCardInvoiceMetrics(card, cardTransactions, selectedMonth, today), committedAmount: getCardCommittedAmount(card, cardTransactions, today) },
  ])), [cards, cardTransactions, selectedMonth, today]);
  const invoiceMetricsFor = (card: AppCard) => metricsByCard[card.id];
  const overviewMonths = useMemo(() => {
    if (selectedMonths.length > 0) return [...new Set(selectedMonths)].sort();
    if (activeRangeStart && activeRangeEnd) return monthOptions.filter((key) =>
      cards.some((card) => {
        const due = getInvoiceDates(card, key)?.dueDate;
        return Boolean(due && due >= activeRangeStart && due <= activeRangeEnd);
      })
    );
    return [selectedMonth];
  }, [selectedMonths, activeRangeStart, activeRangeEnd, monthOptions, cards, selectedMonth]);
  const overview = useMemo(() => {
    let totalCents = 0, paidCents = 0, count = 0;
    for (const card of cards) {
      if (card.archived) continue;
      for (const invoiceMonth of overviewMonths) {
        const values = getCardInvoiceMetrics(card, cardTransactions, invoiceMonth, today);
        if (invoiceStatusFilter === "paid" && !values.invoicePaid) continue;
        if (invoiceStatusFilter === "open" && (values.invoicePaid || values.openAmount <= 0)) continue;
        totalCents += Math.round(values.invoiceTotal * 100);
        paidCents += Math.round(values.paidAmount * 100);
        count += 1;
      }
    }
    return { total: totalCents / 100, paid: paidCents / 100, open: (totalCents - paidCents) / 100, count };
  }, [cards, cardTransactions, overviewMonths, invoiceStatusFilter, today]);
  const visibleCards = cards.filter((card) => !card.archived && (
    invoiceStatusFilter === "all" || (invoiceStatusFilter === "paid"
      ? invoiceMetricsFor(card).invoicePaid
      : !invoiceMetricsFor(card).invoicePaid && invoiceMetricsFor(card).openAmount > 0)
  ));
  const selectedCard = visibleCards.find((card) => card.id === selectedCardId);

  const selectedCardTransactions = useMemo(
    () =>
      selectedCard
        ? cardTransactions.filter(
            (transaction) =>
              transaction.cardId === selectedCard.id &&
              transactionInPeriod(transaction, selectedMonth, activeRangeEnd, activeRangeStart, selectedCard),
          )
        : [],
    [activeRangeEnd, activeRangeStart, cardTransactions, selectedCard, selectedMonth],
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
      const searchableText = normalizeSearchText(
        `${transaction.title} ${transaction.note ?? ""}`,
      );
      return (
        (!query || searchableText.includes(query)) &&
        (transactionCategory === "todas" || transaction.categoryId === transactionCategory)
      );
    });
  }, [
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
  const selectedCardTotal = selectedCard
    ? getCardStatementTotal(selectedCard, visibleSelectedCardTransactions, selectedMonth, transactionSearchScope, activeRangeStart, activeRangeEnd) : 0;
  const handleRequestPayment = (card: AppCard, mode: PaymentMode = "full") => {
    const metrics = invoiceMetricsFor(card);
    if (metrics.invoiceTotal <= 0) { setZeroInvoiceCard(card); return; }
    if (metrics.openAmount <= 0) { toast("Esta fatura já está paga"); return; }
    setPaymentInitialMode(mode);
    setPaymentCard(card);
  };

  const handleConfirmPayment = (payment: InvoicePaymentRecord) => {
    if (!paymentCard) return;
    const previousPaid = invoiceMetricsFor(paymentCard).paidAmount;
    setCardInvoicePayment(paymentCard.id, selectedMonth, payment);
    setPaymentCard(null);
    setPaymentInitialMode("full");
    const registered = Math.round((payment.paidAmount - previousPaid) * 100) / 100;
    const remaining = Math.max(0, Math.round((payment.totalAmount - payment.paidAmount) * 100) / 100);
    toast(remaining === 0 ? `Fatura de ${paymentCard.name} paga integralmente` : `Pagamento de ${formatCurrency(registered)} registrado. Restam ${formatCurrency(remaining)}.`);
  };

  const handleReopenInvoice = (card: AppCard) => setReopenCard(card);

  const handleDeleteCard = (card: AppCard) => setCardRemoval({ card, mode: "delete" });
  const handleArchiveCard = (card: AppCard) => {
    const profileId = activeProfile?.id;
    updateCard(card.id, { archived: true });
    setCardRemoval(null);
    if (selectedCardId === card.id) setSelectedCardId("");
    toast(`${card.name} arquivado`, { duration: 10000, action: { label: "Desfazer", onClick: () => {
      if (dialogProfile.current !== profileId) return;
      updateCard(card.id, { archived: false }); setInvoiceStatusFilter("all");
    } } });
  };
  const setCardExpanded = (card: AppCard, expanded: boolean) => {
    setCardDisplayOverrides((previous) => ({ profileId: activeProfile?.id, cards: {
      ...(previous.profileId === activeProfile?.id ? previous.cards : {}), [card.id]: expanded,
    } }));
    if (!invoiceCardDisplayMode) updateCard(card.id, { invoiceCollapsed: !expanded });
  };
  const handleDisplayModeChange = (value: string) => {
    const mode = sanitizeInvoiceCardDisplayMode(value);
    if (!mode) return;
    setCardDisplayOverrides({ profileId: activeProfile?.id, cards: {} });
    setInvoiceCardDisplayMode(mode);
    toast(mode === "expanded" ? "Os cartões abrirão expandidos" : "Os cartões abrirão só com a faixa");
  };
  const showStatement = (card: AppCard, scope: TransactionSearchScope) => {
    setCardExpanded(card, false);
    const filters = emptyCardStatementFilters(scope);
    setInvoiceStatusFilter("all"); setSelectedCardId(card.id);
    setTransactionSearch(filters.query); setTransactionCategory(filters.category); setTransactionSearchScope(filters.scope);
    if (scope === "month") { setRangeStart(null); setRangeEnd(null); setPeriodMode(selectedMonth === currentMonthKey ? "current" : "month"); }
    setStatementRequest((request) => request + 1);
  };

  const cardActions = (card: AppCard) => ({
    onToggleExpanded: () => setCardExpanded(card, !isInvoiceCardExpanded(card, invoiceCardDisplayMode, displayOverrides)),
    onToggleHeaderColor: () => updateCard(card.id, { invoiceHeaderColorMode: card.invoiceHeaderColorMode === "card" ? "bank" : "card" }),
    onViewStatement: () => showStatement(card, "month"),
    onRequestPayment: () => handleRequestPayment(card),
    onReopenInvoice: () => handleReopenInvoice(card),
    onInstallInvoice: () => handleRequestPayment(card, "installments"),
    onEdit: () => navigate("/dashboard/cartoes", { state: { editCardId: card.id, returnInvoiceMonth: selectedMonth } }),
    onRecalculate: () => {
      setSelectedCardId(card.id);
      setUtilityCard(card);
      setUtilityKind("amount");
    },
    onEditClosingDay: () => {
      setUtilityCard(card);
      setUtilityKind("closingDay");
    },
    onHistory: () => showStatement(card, "all"),
    onExpenses: () => showStatement(card, "month"),
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
    onArchive: () => setCardRemoval({ card, mode: "archive" }),
    onDelete: () => handleDeleteCard(card),
  });

  return (
    <div className="space-y-4">
      <SettingsHeader title="Compras no Cartão" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Acompanhe cada fatura e veja o extrato separado por cartão.
      </p>
      {!selectedCard ? (<>
      <div className={cn("grid grid-cols-2 items-center gap-1.5 px-1 sm:flex sm:justify-end sm:gap-2", cards.filter((card) => !card.archived).length > 1 && "grid-cols-3")}>
        <button type="button" onClick={() => navigate("/dashboard/cartoes/arquivados")}
          className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full bg-white/45 px-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-95 sm:gap-2 sm:px-4 sm:text-[12px]"
          aria-label="Abrir Cartões Arquivados">
          <Archive className="size-3.5 shrink-0 sm:size-4" /><span className="truncate">Arquivados</span>
        </button>
        {cards.filter((card) => !card.archived).length > 1 && <button type="button" onClick={() => setOrderOpen(true)} aria-label="Ordenar cartões" className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full bg-white/45 px-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-95 sm:gap-2 sm:px-4 sm:text-[12px]"><ArrowUpDown className="size-3.5 shrink-0 sm:size-4" /><span className="truncate sm:hidden">Ordenar</span><span className="hidden sm:inline">Ordenar cartões</span></button>}
        <Select value={invoiceCardDisplayMode ?? ""} onValueChange={handleDisplayModeChange}>
          <SelectTrigger id="invoice-card-start-view" aria-label="Exibição inicial dos cartões" aria-describedby="invoice-card-start-view-help" title="Escolher como os cartões abrem neste perfil" className="relative min-h-11 w-full min-w-0 justify-center gap-0 rounded-full border-transparent bg-white/45 px-5 text-center text-[11px] font-bold text-primary shadow-none data-[placeholder]:text-primary sm:w-auto sm:px-6 sm:text-[12px] [&_svg]:text-primary [&>svg]:absolute [&>svg]:right-1 sm:[&>svg]:right-2 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:justify-center *:data-[slot=select-value]:truncate *:data-[slot=select-value]:text-center">
            <SelectValue placeholder="Exibição">{invoiceCardDisplayMode ? invoiceCardDisplayMode === "expanded" ? "Expandidos" : "Só a faixa" : undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="end" className="z-[210] min-w-44 rounded-2xl border-white/70 bg-[#f4f8ff] text-glass-ink">
            <SelectItem value="expanded" className="min-h-11 text-[12px]">Cartões expandidos</SelectItem>
            <SelectItem value="collapsed" className="min-h-11 text-[12px]">Somente a faixa</SelectItem>
          </SelectContent>
        </Select>
        <span id="invoice-card-start-view-help" className="sr-only">A escolha fica salva neste perfil. As setas permitem abrir e recolher cada cartão.</span>
      </div>

      <div className="glass rounded-2xl p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => handleSelectMonth(shiftMonth(selectedMonth, -1))}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setMonthsDialogOpen(true)} aria-label="Selecionar meses" className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[13px] font-bold text-glass-ink dark:text-white"><CalendarDays className="size-4 text-primary" /><span className="truncate">{selectedMonths.length ? `${selectedMonths.length} meses selecionados` : `${monthShortLabel(selectedMonth)} ${selectedMonth.slice(0, 4)}`}</span><ChevronDown className="size-3.5" /></button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => handleSelectMonth(shiftMonth(selectedMonth, 1))}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {selectedMonths.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selectedMonths.map((key) => <button key={key} type="button" onClick={() => setSelectedMonths((months) => months.filter((item) => item !== key))} className="rounded-full bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary" title="Remover mês">{monthShortLabel(key)} {key.slice(0, 4)} ×</button>)}</div>}
        <button type="button" onClick={() => setFiltersExpanded((value) => !value)} aria-expanded={filtersExpanded} className="mt-2 flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-left text-[12px] font-semibold text-primary"><span className="flex items-center gap-2"><SlidersHorizontal className="size-4" />{filtersExpanded ? "Recolher filtros e detalhes" : "Expandir filtros e detalhes"}</span><ChevronDown className={cn("size-4 transition-transform", filtersExpanded && "rotate-180")} /></button>
        {filtersExpanded && <div className="mt-3 min-w-0 space-y-3 border-t border-glass-ink/5 pt-3 dark:border-white/10">
          <PeriodPicker
            mode={periodMode}
            selectedMonth={selectedMonth}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onModeChange={(mode) => { if (mode === "current") handleSelectMonth(currentMonthKey); else { setSelectedMonths([]); setPeriodMode(mode); } }}
            onRangeChange={(start, end) => {
              setSelectedMonths([]);
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
          <div role="group" aria-label="Situação das faturas" className="grid min-w-0 grid-cols-3 gap-2">
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
                aria-pressed={invoiceStatusFilter === status}
                onClick={() => setInvoiceStatusFilter(status)}
                className={cn(
                  "flex min-h-11 min-w-0 items-center justify-center rounded-full border px-1.5 py-2 text-[12px] font-bold transition-all",
                  invoiceStatusFilter === status
                    ? "border-primary bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                    : "border-white/70 bg-white/55 text-glass-sub dark:border-white/10 dark:bg-white/5",
                )}
              >
                {labels[status]}
              </button>
            );
          })}
          </div>
        </div>}
        <div className="border-t border-glass-ink/10 pt-3">
          <label className="flex items-center justify-between gap-3 text-[12px] font-semibold text-glass-ink"><span>Incluir cartão emprestado</span><input type="checkbox" role="switch" aria-label="Incluir cartão emprestado" checked={includeBorrowedCardPurchases} onChange={(event) => setIncludeBorrowedCardPurchases(event.target.checked)} className="size-5 accent-primary" /></label>
          <p className="mt-2 text-[11px] text-glass-sub">{includeBorrowedCardPurchases ? "Ativado: compras para outras pessoas entram nos valores e extratos deste perfil." : "Desativado: mostra apenas compras pessoais. A escolha fica salva neste perfil."}</p>
          <button type="button" onClick={() => setLoanHelpExpanded((value) => !value)} aria-expanded={loanHelpExpanded} className="mt-2 flex w-full items-center justify-between rounded-xl bg-primary/5 px-3 py-3 text-left text-[12px] font-semibold text-primary">Como essa opção funciona?<ChevronDown className={cn("size-4", loanHelpExpanded && "rotate-180")} /></button>
          {loanHelpExpanded && <div className="space-y-2 rounded-b-xl bg-primary/5 p-3 text-[11px] leading-relaxed text-glass-sub">
            <p><strong>Ao ativar:</strong> compras de outras pessoas cadastradas em Empréstimos → Cartão emprestado, com cartão e fatura vinculados, entram no resumo e nos cálculos daquele cartão.</p>
            <p><strong>Receber e pagar o banco são ações separadas:</strong> receber o dinheiro da pessoa não significa quitar a fatura no banco; registrar o pagamento da fatura não registra automaticamente o recebimento.</p>
            <p>Exemplo: R$ 100 em compras pessoais + R$ 50 emprestados = R$ 150 na fatura. Mesmo recebendo R$ 50 da pessoa, ainda é preciso pagar o banco.</p>
            <p><strong>Ao desativar:</strong> os lançamentos emprestados deixam de compor os totais. Nenhum registro é apagado. Empréstimos em dinheiro não entram nesta opção.</p>
          </div>}
        </div>
        {activeRangeStart && <p className="mt-3 px-1 text-[11px] leading-relaxed text-glass-sub">O período personalizado filtra o extrato pelas datas de vencimento. Os cards e pagamentos continuam na fatura de {monthShortLabel(selectedMonth)} {selectedMonth.slice(0, 4)}.</p>}
        {hasInvoiceFilters && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearInvoiceFilters}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-95"
            >
              <X className="size-3.5" />
              Remover filtro
            </button>
          </div>
        )}
      </div>

      <section aria-label="Resumo das faturas dos cartões" className="glass rounded-3xl px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="flex items-center gap-2 text-[12px] font-semibold text-glass-sub"><CreditCard className="size-4 text-primary" /> Falta pagar no período</p><p className="amount-tabular mt-2 text-[27px] font-bold text-[#FF3B30]">{formatCurrency(overview.open)}</p></div>
          <div className="text-right text-[11px] text-glass-sub"><p>{selectedPeriodLabel}</p><p>Soma de {overview.count} {overview.count === 1 ? "fatura" : "faturas"}</p><p>{includeBorrowedCardPurchases ? "Inclui cartão emprestado" : "Só compras pessoais"}</p></div>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-glass-ink/10 pt-3 text-[12px] text-glass-sub"><span>Faturas <strong className="amount-tabular text-glass-ink">{formatCurrency(overview.total)}</strong></span><span>Já pago <strong className="amount-tabular text-[#1FBF4F]">{formatCurrency(overview.paid)}</strong></span></div>
      </section>
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
              Não há faturas {invoiceStatusFilter === "paid" ? "pagas" : "em aberto"} em {monthShortLabel(selectedMonth)} {selectedMonth.slice(0, 4)}.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="min-w-0 text-[12px] font-bold uppercase tracking-wide text-glass-sub [overflow-wrap:anywhere]">
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
                {monthShortLabel(selectedMonth)} {selectedMonth.slice(0, 4)}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {(selectedCard ? [selectedCard] : visibleCards).map((card) => (
              <InvoiceSummaryCard key={card.id} card={card} expanded={isInvoiceCardExpanded(card, invoiceCardDisplayMode, displayOverrides)} headerAppearance={headerAppearances[card.id]} month={selectedMonth} today={today}
                {...invoiceMetricsFor(card)} selected={selectedCardId === card.id} {...cardActions(card)} />
            ))}
          </div>
        </div>
      )}

      </>) : (
        <button type="button" onClick={() => setSelectedCardId("")} className="flex min-h-11 items-center gap-2 self-start rounded-full bg-primary/10 px-4 py-2 text-[12px] font-semibold text-primary"><ChevronLeft className="size-4" />Voltar aos cartões</button>
      )}
      <CardMonthsDialog open={monthsDialogOpen && !selectedCard} onClose={() => setMonthsDialogOpen(false)} selectedMonths={selectedMonths} referenceMonth={selectedMonth} onApply={(months) => { setSelectedMonths(months); if (months.length > 0) { setMonth(months[0]); setPeriodMode("month"); setRangeStart(null); setRangeEnd(null); } }} />
      {orderOpen && <CardOrderDialog cards={cards} onClose={() => setOrderOpen(false)} onSave={(ids) => { reorderCards(ids); setOrderOpen(false); toast("Ordem dos cartões salva"); }} />}

      {selectedCard && (
        <div id="card-invoice-extract" tabIndex={-1} className="space-y-3 outline-none">
          <div className="glass flex flex-wrap items-start justify-between gap-3 rounded-2xl px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold uppercase tracking-wide text-glass-sub">
                {transactionSearchScope === "all" ? "Histórico de compras" : "Extrato do período"}
              </p>
              <p className="mt-0.5 text-[15px] font-bold text-glass-ink [overflow-wrap:anywhere]">
                {selectedCard.name} ····{selectedCard.last4}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-glass-faint">
                Total exibido
              </p>
              <p className="amount-tabular mt-0.5 text-[18px] font-bold text-[#FF3B30]">
                {selectedCardTotal > 0 ? "−" : ""}{formatCurrency(selectedCardTotal)}
              </p>
            </div>
            <button type="button" aria-label="Fechar extrato" onClick={() => setSelectedCardId("")} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/60 text-glass-sub"><X className="size-4" /></button>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-glass-sub">{transactionSearchScope === "all" ? "Cada compra aparece uma vez, pelo valor original completo." : `${selectedPeriodLabel}. Valores das parcelas que vencem neste período.`} A busca e a categoria alteram apenas este extrato.</p>

          <div className="glass rounded-2xl px-3 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="w-full min-w-0 flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-glass-faint" />
                  <label htmlFor="card-transaction-search" className="sr-only">
                    Buscar no extrato do cartão
                  </label>
                  <input
                    id="card-transaction-search"
                    type="search"
                    enterKeyHint="search"
                    value={transactionSearch}
                    onChange={(event) => {
                      const value = event.target.value;
                      setTransactionSearch(value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && transactionSearch.trim()) {
                        event.preventDefault();
                        goToNextTransactionResult();
                      }
                    }}
                    placeholder="Buscar compra ou anotação"
                    className="h-11 w-full min-w-0 rounded-xl border border-glass-ink/10 bg-white/50 pl-9 pr-11 text-[16px] font-medium text-glass-ink outline-none transition-colors placeholder:text-glass-faint focus:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:text-white sm:text-[15px] [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {transactionSearch && <button type="button" aria-label="Limpar busca do extrato" onClick={() => setTransactionSearch("")} className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-full text-glass-sub"><X className="size-4" /></button>}
                </div>
                <SearchNavigationControls
                  query={transactionSearch}
                  resultCount={visibleSelectedCardTransactions.length}
                  activeIndex={activeTransactionSearchIndex}
                  onPrevious={goToPreviousTransactionResult}
                  onNext={goToNextTransactionResult}
                  className="mt-1 justify-end"
                />
              </div>
              <Select value={transactionCategory} onValueChange={setTransactionCategory}>
                <SelectTrigger aria-label="Filtrar compras por categoria" className="min-h-11 w-full rounded-xl border-glass-ink/10 bg-white/50 text-[12px] font-semibold text-glass-ink dark:bg-white/5 sm:w-auto sm:max-w-[11rem]"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-2xl bg-[#f4f8ff] text-glass-ink">
                  <SelectItem value="todas">Todas as categorias</SelectItem>
                  {transactionCategoryOptions.map((category) => <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-glass-ink/5 pt-2 dark:border-white/10">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-glass-faint">
                  Pesquisar em
                </span>
                {(["month", "all"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={transactionSearchScope === scope}
                    onClick={() => setTransactionSearchScope(scope)}
                    className={cn(
                      "rounded-full px-2.5 py-1.5 text-[10px] font-semibold transition-all active:scale-95",
                      transactionSearchScope === scope
                        ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                        : "glass-soft text-glass-sub",
                    )}
                  >
                    {scope === "month" ? (activeRangeStart ? "Período escolhido" : "Mês selecionado") : "Todos os meses"}
                  </button>
                ))}
              </div>
            {hasTransactionFilters && (
              <div className="mt-2 flex justify-end border-t border-glass-ink/5 pt-2 dark:border-white/10">
                <button
                  type="button"
                  onClick={clearTransactionFilters}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-95"
                >
                  <X className="size-3.5" />
                  Remover filtro
                </button>
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
            <div className="space-y-2 py-1.5">
              {visibleSelectedCardTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  displayAmount={transactionSearchScope === "month" ? -invoiceAmountInPeriod(transaction, selectedCard, selectedMonth, activeRangeStart, activeRangeEnd) : undefined}
                  displayInstallment={transactionSearchScope === "month" ? getInvoicePartsInPeriod(transaction, selectedCard, selectedMonth, activeRangeStart, activeRangeEnd)[0]?.number : undefined}
                  searchQuery={transactionSearch}
                />
              ))}
            </div>
          )}

          {visibleSelectedCardTransactions.length > 0 && (
            <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
              {hasTransactionFilters
                ? `Exibindo ${visibleSelectedCardTransactions.length} compra(s) encontradas no escopo ${transactionSearchScope === "all" ? "de todo o histórico" : "do período selecionado"}.`
                : `Extrato de compras de crédito em ${selectedPeriodLabel}. Toque em uma compra para ver os detalhes.`}
            </p>
          )}
        </div>
      )}

      {paymentCard && metricsByCard[paymentCard.id] && (
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
      {cardRemoval && <CardRemovalDialog card={cardRemoval.card} mode={cardRemoval.mode} transactions={[...transactions, ...loanTransactions]} receivables={loanReceivables}
        onClose={() => setCardRemoval(null)} onArchive={() => handleArchiveCard(cardRemoval.card)} onDelete={() => {
          deleteCard(cardRemoval.card.id); if (selectedCardId === cardRemoval.card.id) setSelectedCardId("");
          setCardRemoval(null); toast("Cartão removido");
        }} />}
      {reopenCard && (
        <Dialog open onOpenChange={(open) => { if (!open) setReopenCard(null); }}>
          <DialogContent className="rounded-3xl bg-[#f4f8ff] text-glass-ink dark:bg-[#0d1b3e]">
            <DialogTitle>Reabrir fatura?</DialogTitle>
            <DialogDescription className="text-glass-sub">A fatura de {reopenCard.name}, de {monthShortLabel(selectedMonth)} {selectedMonth.slice(0, 4)}, voltará a ficar em aberto. O pagamento registrado neste mês será removido. As compras serão mantidas.</DialogDescription>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setReopenCard(null)} className="min-h-11 rounded-full border border-glass-ink/15 px-3 font-semibold">Cancelar</button>
              <button type="button" onClick={() => {
                setCardInvoiceStatus(reopenCard.id, selectedMonth, false);
                setReopenCard(null); toast("Fatura reaberta");
              }} className="min-h-11 rounded-full bg-primary px-3 font-bold text-white">Reabrir fatura</button>
            </div>
          </DialogContent>
        </Dialog>
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
          month={selectedMonth}
          transactions={cardTransactions}
          categoryById={categoryById}
          onClose={() => {
            setUtilityCard(null);
            setUtilityKind(null);
          }}
        />
      )}
      {utilityCard && metricsByCard[utilityCard.id] && (utilityKind === "amount" || utilityKind === "closingDay") && (
        <InvoiceNumberModal
          card={utilityCard}
          month={selectedMonth}
          kind={utilityKind}
          minimumAmount={Math.max(invoiceMetricsFor(utilityCard).paidAmount, utilityCard.invoicePaymentsByMonth?.[selectedMonth]?.paidAmount ?? 0)}
          automaticTotal={getCardStatementTotal(utilityCard, cardTransactions, selectedMonth, "month")}
          hasOverride={utilityCard.invoiceOverrideByMonth?.[selectedMonth] !== undefined}
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
              toast(value === undefined ? "Total das compras restaurado" : "Total da fatura reajustado");
            } else if (value !== undefined) {
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
