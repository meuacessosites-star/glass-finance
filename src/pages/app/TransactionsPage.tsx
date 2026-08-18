import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  BarChart3,
  ReceiptText,
  Search,
  ListChecks,
  X,
} from "lucide-react";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { TransactionRow } from "@/components/app/TransactionRow";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore, type LoanReceivable } from "@/lib/app-store";
import {
  currentMonthKey,
  dayLabel,
  formatCurrency,
  monthKey,
  monthShortLabel,
  type Transaction,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
): boolean {
  const startDate = fromDate ?? `${selectedMonth}-01`;
  const defaultEndDate = `${selectedMonth}-${String(lastDayOfMonth(selectedMonth)).padStart(2, "0")}`;
  const endDate = untilDate && untilDate >= startDate ? untilDate : defaultEndDate;
  return transaction.date >= startDate && transaction.date <= endDate;
}

type PeriodMode = "current" | "month" | "custom";
type PaymentStatusFilter = "all" | "paid" | "pending";

function isCreditCardTransaction(transaction: Transaction): boolean {
  return (
    Boolean(transaction.cardId) &&
    (transaction.cardMode === "credito" || transaction.paymentMethod === "credito")
  );
}

function getTransactionPaymentStatus(
  transaction: Transaction,
  loanReceivables: LoanReceivable[],
): Exclude<PaymentStatusFilter, "all"> {
  if (transaction.id.startsWith("loan-receivable-")) {
    const receivableId = transaction.id.replace("loan-receivable-", "");
    const receivable = loanReceivables.find((item) => item.id === receivableId);
    return receivable?.status === "open" ? "pending" : "paid";
  }

  return transaction.paymentStatus === "pending" ? "pending" : "paid";
}

type PeriodPickerProps = {
  mode: PeriodMode;
  selectedMonth: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  onModeChange: (mode: PeriodMode) => void;
  onRangeChange: (start: string | null, end: string | null) => void;
};

type MonthMultiPickerProps = {
  monthOptions: string[];
  selectedMonths: string[];
  onSelectedMonthsChange: (months: string[]) => void;
};

function MonthMultiPicker({
  monthOptions,
  selectedMonths,
  onSelectedMonthsChange,
}: MonthMultiPickerProps) {
  const label = selectedMonths.length === 0
    ? "Meses"
    : selectedMonths.length === 1
      ? "1 mês"
      : `${selectedMonths.length} meses`;

  const toggleMonth = (month: string) => {
    const nextMonths = selectedMonths.includes(month)
      ? selectedMonths.filter((current) => current !== month)
      : [...selectedMonths, month].sort((a, b) => b.localeCompare(a));
    onSelectedMonthsChange(nextMonths);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Selecionar um ou mais meses"
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-[11px] font-semibold transition-all",
            selectedMonths.length > 0
              ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
              : "glass text-glass-sub",
          )}
        >
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-64">
        <DropdownMenuItem
          disabled={selectedMonths.length === 0}
          onSelect={() => onSelectedMonthsChange([])}
        >
          <X className="size-4" />
          Limpar meses
        </DropdownMenuItem>
        {monthOptions.map((monthOption) => (
          <DropdownMenuCheckboxItem
            key={monthOption}
            checked={selectedMonths.includes(monthOption)}
            onSelect={(event) => {
              event.preventDefault();
              toggleMonth(monthOption);
            }}
          >
            {monthShortLabel(monthOption)} {monthOption.slice(0, 4)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PeriodPicker({
  mode,
  selectedMonth,
  rangeStart,
  rangeEnd,
  onModeChange,
  onRangeChange,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    rangeStart ? monthKey(rangeStart) : selectedMonth,
  );
  const [draftStart, setDraftStart] = useState<string | null>(rangeStart);
  const [draftEnd, setDraftEnd] = useState<string | null>(rangeEnd);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarDays = calendarDaysForMonth(calendarMonth);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pickerWidth = Math.min(304, window.innerWidth - 32);
      setPopoverPosition({
        top: rect.bottom + 8,
        left: Math.max(
          16,
          Math.min(window.innerWidth - pickerWidth - 16, rect.right - pickerWidth),
        ),
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
    onModeChange("custom");
    setOpen(true);
  };

  const handlePick = (date: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(date);
      setDraftEnd(null);
      onRangeChange(null, null);
      return;
    }
    const [start, end] = date < draftStart ? [date, draftStart] : [draftStart, date];
    setDraftStart(start);
    setDraftEnd(end);
    onRangeChange(start, end);
    setOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <button
        type="button"
        aria-label="Selecionar este mês"
        onClick={() => {
          onModeChange("current");
          onRangeChange(null, null);
          setOpen(false);
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center rounded-full px-2.5 py-2 text-[11px] font-semibold transition-all",
          mode === "current"
            ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
            : "glass text-glass-sub",
        )}
      >
        <span className="truncate">Este mês</span>
      </button>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Selecionar período personalizado"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openCustomCalendar();
          }
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center rounded-full px-2.5 py-2 text-[11px] font-semibold transition-all",
          mode === "custom"
            ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
            : "glass text-glass-sub",
        )}
      >
        <span className="truncate">Personalizado</span>
      </button>

      {open && popoverPosition && createPortal(
        <div
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
          className="fixed z-[210] w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-glass-ink/10 bg-[#f4f8ff] p-3 text-glass-ink shadow-[0_18px_45px_-18px_rgba(15,40,90,0.55)] dark:border-white/10 dark:bg-[#0d1b3e] dark:text-white"
        >
          {mode === "custom" && (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Mês anterior do período personalizado"
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
                  aria-label="Próximo mês do período personalizado"
                  onClick={() => setCalendarMonth((current) => shiftMonth(current, 1))}
                  className="flex size-8 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
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
                    Limpar
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

export default function TransactionsPage() {
  const navigate = useNavigate();
  const {
    categories,
    visibleTransactions,
    loanReceivables,
    cards,
    setCardInvoiceStatus,
    setTransactionPaymentStatus,
    markLoanReceivablesPaid,
    deleteTransactions,
  } = useAppStore();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scope, setScope] = useState<"month" | "all">("month");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>("all");
  const [isMarkingPending, setIsMarkingPending] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [categoryChartExpanded, setCategoryChartExpanded] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );

  const consolidatedTransactions = useMemo(() => {
    const transactionIds = new Set(visibleTransactions.map((transaction) => transaction.id));
    const syntheticReceivables: Transaction[] = loanReceivables
      .filter(
        (receivable) =>
          !receivable.transactionId || !transactionIds.has(receivable.transactionId),
      )
      .map((receivable) => {
        const installmentLabel =
          receivable.installment && receivable.installments
            ? `Parcela ${receivable.installment}/${receivable.installments}`
            : undefined;
        return {
          id: `loan-receivable-${receivable.id}`,
          title:
            receivable.status === "open"
              ? `A receber de ${receivable.contact}`
              : `Recebimento de ${receivable.contact}`,
          categoryId: categoryById.transferencias ? "transferencias" : "outros",
          amount: Math.abs(receivable.amount),
          date: receivable.dueDate ?? receivable.createdAt,
          note: [
            receivable.description,
            `Conta a receber de ${receivable.contact}`,
            installmentLabel,
            receivable.status === "open" ? "Dívida em aberto" : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
          paymentMethod: receivable.paymentMethod,
          recurrence:
            receivable.installment && receivable.installments
              ? "parcelada"
              : undefined,
          installments: receivable.installments,
          currentInstallment: receivable.installment,
          source: "loan",
        };
      });

    return [...visibleTransactions, ...syntheticReceivables];
  }, [categoryById, loanReceivables, visibleTransactions]);

  const allMonths = useMemo(
    () =>
      [...new Set(consolidatedTransactions.map((transaction) => monthKey(transaction.date)))].sort(
        (a, b) => b.localeCompare(a),
      ),
    [consolidatedTransactions],
  );
  const monthOptions = useMemo(() => {
    const navigableMonths = Array.from({ length: 49 }, (_, index) =>
      shiftMonth(currentMonthKey, 24 - index),
    );
    return [...new Set([...navigableMonths, ...allMonths])].sort((a, b) => b.localeCompare(a));
  }, [allMonths]);
  const [month, setMonth] = useState<string>(currentMonthKey);
  const selectedMonth = monthOptions.includes(month)
    ? month
    : monthOptions.includes(currentMonthKey)
      ? currentMonthKey
      : monthOptions[0] ?? currentMonthKey;
  const activeRangeStart = periodMode === "custom" && rangeStart && rangeEnd ? rangeStart : null;
  const activeRangeEnd = periodMode === "custom" && rangeStart && rangeEnd ? rangeEnd : null;
  const selectedPeriodLabel = activeRangeStart && activeRangeEnd
    ? `${formatDateLabel(activeRangeStart)} → ${formatDateLabel(activeRangeEnd)}`
    : selectedMonths.length > 0
      ? `${selectedMonths.length} ${selectedMonths.length === 1 ? "mês selecionado" : "meses selecionados"}`
      : `${monthShortLabel(selectedMonth)} ${selectedMonth.slice(0, 4)}`;
  const handleSelectMonth = (nextMonth: string) => {
    setMonth(nextMonth);
    setSelectedMonths([]);
    setPeriodMode(nextMonth === currentMonthKey ? "current" : "month");
    setRangeStart(null);
    setRangeEnd(null);
  };

  const handleSelectMonths = (months: string[]) => {
    setSelectedMonths(months);
    setRangeStart(null);
    setRangeEnd(null);
    if (months.length > 0) {
      setMonth(months[0]);
      setPeriodMode(months[0] === currentMonthKey ? "current" : "month");
    }
  };

  const availableCategories = useMemo(
    () =>
      categories
        .filter((category) =>
          consolidatedTransactions.some(
            (transaction) => transaction.categoryId === category.id,
          ),
        )
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [categories, consolidatedTransactions],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery.trim());
    return consolidatedTransactions
      .filter(
        (transaction) =>
          scope === "all" ||
          (selectedMonths.length > 0
            ? selectedMonths.includes(monthKey(transaction.date))
            : transactionInPeriod(transaction, selectedMonth, activeRangeEnd, activeRangeStart)),
      )
      .filter(
        (transaction) =>
          paymentStatus === "all" ||
          getTransactionPaymentStatus(transaction, cards, loanReceivables) === paymentStatus,
      )
      .filter(
        (transaction) =>
          selectedCategories.length === 0 ||
          selectedCategories.includes(transaction.categoryId),
      )
      .filter((transaction) => {
        if (!normalizedQuery) return true;
        const categoryLabel = categoryById[transaction.categoryId]?.label ?? "";
        const searchableText = normalizeSearchText(
          `${transaction.title} ${transaction.note ?? ""} ${transaction.categoryId} ${categoryLabel}`,
        );
        return searchableText.includes(normalizedQuery);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    cards,
    categoryById,
    consolidatedTransactions,
    loanReceivables,
    paymentStatus,
    scope,
    searchQuery,
    selectedCategories,
    selectedMonths,
    activeRangeEnd,
    activeRangeStart,
    selectedMonth,
  ]);

  const summaryTransactions = useMemo(
    () =>
      consolidatedTransactions.filter((transaction) =>
        selectedMonths.length > 0
          ? selectedMonths.includes(monthKey(transaction.date))
          : transactionInPeriod(
              transaction,
              selectedMonth,
              activeRangeEnd,
              activeRangeStart,
            ),
      ),
    [
      activeRangeEnd,
      activeRangeStart,
      consolidatedTransactions,
      selectedMonth,
      selectedMonths,
    ],
  );
  const paidTotal = summaryTransactions
    .filter(
      (transaction) =>
        getTransactionPaymentStatus(transaction, cards, loanReceivables) === "paid",
    )
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const pendingTransactions = useMemo(
    () =>
      summaryTransactions.filter(
        (transaction) =>
          getTransactionPaymentStatus(transaction, cards, loanReceivables) === "pending",
      ),
    [cards, loanReceivables, summaryTransactions],
  );
  const pendingTotal = pendingTransactions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount),
    0,
  );
  const pendingCardInvoices = useMemo(() => {
    const invoiceKeys = new Set<string>();
    return pendingTransactions.reduce<Array<{ cardId: string; month: string }>>(
      (invoices, transaction) => {
        if (!isCreditCardTransaction(transaction) || !transaction.cardId) return invoices;
        const month = monthKey(transaction.date);
        const key = `${transaction.cardId}:${month}`;
        if (!invoiceKeys.has(key)) {
          invoiceKeys.add(key);
          invoices.push({ cardId: transaction.cardId, month });
        }
        return invoices;
      },
      [],
    );
  }, [pendingTransactions]);
  const pendingLoanReceivableIds = useMemo(
    () =>
      pendingTransactions
        .filter((transaction) => transaction.id.startsWith("loan-receivable-"))
        .map((transaction) => transaction.id.replace("loan-receivable-", "")),
    [pendingTransactions],
  );
  const pendingRegularTransactionIds = useMemo(
    () =>
      pendingTransactions
        .filter(
          (transaction) =>
            !transaction.id.startsWith("loan-receivable-") &&
            !isCreditCardTransaction(transaction),
        )
        .map((transaction) => transaction.id),
    [pendingTransactions],
  );
  const categoryChartData = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of summaryTransactions) {
      if (transaction.amount >= 0) continue;
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + Math.abs(transaction.amount),
      );
    }
    const sorted = [...totals.entries()]
      .map(([categoryId, total]) => ({
        categoryId,
        total,
        label: categoryById[categoryId]?.label ?? "Outros",
        color: categoryById[categoryId]?.color ?? "#94A3B8",
      }))
      .sort((a, b) => b.total - a.total);
    const topCategories = sorted.slice(0, 6);
    const remaining = sorted.slice(6).reduce((sum, item) => sum + item.total, 0);
    if (remaining > 0) {
      topCategories.push({
        categoryId: "__other__",
        total: remaining,
        label: "Outras categorias",
        color: "#94A3B8",
      });
    }
    const maxTotal = topCategories[0]?.total ?? 0;
    return topCategories.map((item) => ({
      ...item,
      width: maxTotal > 0 ? (item.total / maxTotal) * 100 : 0,
    }));
  }, [categoryById, summaryTransactions]);
  const handleMarkPendingAsPaid = () => {
    if (pendingTransactions.length === 0 || isMarkingPending) return;
    const confirmed = window.confirm(
      `Marcar ${pendingTransactions.length} transação(ões) pendente(s) como paga(s)?`,
    );
    if (!confirmed) return;
    setIsMarkingPending(true);
    for (const invoice of pendingCardInvoices) {
      setCardInvoiceStatus(invoice.cardId, invoice.month, true);
    }
    for (const transactionId of pendingRegularTransactionIds) {
      setTransactionPaymentStatus(transactionId, "paid");
    }
    markLoanReceivablesPaid(pendingLoanReceivableIds);
    setPaymentStatus("all");
    setIsMarkingPending(false);
  };
  const expenseTotal = filtered
    .filter((transaction) => transaction.amount < 0)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const incomeTotal = filtered
    .filter((transaction) => transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const transaction of filtered) {
      const key = dayLabel(transaction.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(transaction);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  };

  const categoryFilterLabel =
    selectedCategories.length === 0
      ? "Categorias"
      : selectedCategories.length === 1
        ? "1 categoria"
        : `${selectedCategories.length} categorias`;

  const toggleSelectedTransaction = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleDeleteSelected = () => {
    const ids = [...selectedIds].filter((id) => {
      const transaction = consolidatedTransactions.find((item) => item.id === id);
      return (
        !id.startsWith("loan-receivable-") && transaction?.source !== "loan"
      );
    });
    if (ids.length === 0) {
      toast.info("Recebíveis de empréstimos não podem ser excluídos aqui.");
      return;
    }
    const confirmed = window.confirm(
      `Excluir ${ids.length} ${ids.length === 1 ? "transação selecionada" : "transações selecionadas"}?`,
    );
    if (!confirmed) return;
    deleteTransactions(ids);
    toast.success(
      `${ids.length} ${ids.length === 1 ? "transação excluída" : "transações excluídas"}`,
    );
    exitSelectMode();
  };

  const handleEditTransaction = (transaction: Transaction) => {
    if (transaction.source === "loan" || transaction.id.startsWith("loan-receivable-")) {
      toast.info("Movimentações de empréstimos são gerenciadas em Empréstimos.");
      return;
    }
    navigate(`/dashboard/transacoes/${encodeURIComponent(transaction.id)}/editar`);
  };

  const emptyDescription = searchQuery.trim()
    ? `Nenhuma movimentação encontrada para “${searchQuery.trim()}”.`
    : scope === "all"
      ? "Nenhuma movimentação encontrada no histórico."
      : `Nada registrado em ${selectedPeriodLabel} para os filtros selecionados.`;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-foreground">
              Transações
            </h1>
            <p className="text-[13px] text-muted-foreground">Histórico completo de gastos e ganhos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={selectMode ? "Sair do modo de seleção" : "Selecionar transações"}
            aria-pressed={selectMode}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className={cn(
              "glass flex size-9 items-center justify-center rounded-full text-glass-sub transition-all active:scale-90",
              selectMode && "bg-primary text-white",
            )}
          >
            <ListChecks className="size-4" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <section className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-bold text-glass-ink dark:text-white">
            Resumo do período
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-right text-[11px] font-semibold text-glass-faint">
              {selectedPeriodLabel}
            </p>
            <button
              type="button"
              aria-label={summaryExpanded ? "Recolher resumo do período" : "Expandir resumo do período"}
              aria-expanded={summaryExpanded}
              aria-controls="transactions-summary-content"
              onClick={() => setSummaryExpanded((expanded) => !expanded)}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
            >
              <ChevronDown
                className={cn("size-4 transition-transform duration-200", !summaryExpanded && "-rotate-90")}
              />
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {summaryExpanded && (
            <motion.div
              key="transactions-summary-content"
              id="transactions-summary-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[#1FBF4F]/10 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#168A39]">Total pago</p>
                  <p className="mt-1 amount-tabular text-[17px] font-bold text-[#168A39]">
                    {formatCurrency(paidTotal)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#FF9F0A]/10 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-[#B56B00]">Total pendente</p>
                  <p className="mt-1 amount-tabular text-[17px] font-bold text-[#B56B00]">
                    {formatCurrency(pendingTotal)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleMarkPendingAsPaid}
                disabled={pendingTransactions.length === 0 || isMarkingPending}
                className={cn(
                  "mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-all",
                  pendingTransactions.length > 0
                    ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)] hover:brightness-105 active:scale-[0.99]"
                    : "glass text-glass-faint",
                )}
              >
                <Check className="size-3.5" />
                {isMarkingPending
                  ? "Atualizando pagamentos..."
                  : pendingTransactions.length > 0
                    ? `Marcar ${pendingTransactions.length} pendente(s) como paga(s)`
                    : "Nenhuma pendência no período"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BarChart3 className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-glass-ink dark:text-white">
                Gastos por categoria
              </p>
              <p className="truncate text-[11px] text-glass-faint">
                Distribuição das despesas no período selecionado
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={categoryChartExpanded ? "Recolher gastos por categoria" : "Expandir gastos por categoria"}
            aria-expanded={categoryChartExpanded}
            aria-controls="transactions-category-chart-content"
            onClick={() => setCategoryChartExpanded((expanded) => !expanded)}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronDown
              className={cn("size-4 transition-transform duration-200", !categoryChartExpanded && "-rotate-90")}
            />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {categoryChartExpanded && (
            <motion.div
              key="transactions-category-chart-content"
              id="transactions-category-chart-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              {categoryChartData.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {categoryChartData.map((item) => (
                    <div key={item.categoryId}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                        <span className="min-w-0 truncate font-semibold text-glass-ink dark:text-white">
                          {item.label}
                        </span>
                        <span className="shrink-0 font-semibold text-glass-sub">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-glass-ink/10 dark:bg-white/10">
                        <div
                          className="h-full rounded-full transition-[width] duration-500 ease-out"
                          style={{ width: `${item.width}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-glass-ink/5 px-3 py-3 text-center text-[12px] text-glass-faint dark:bg-white/5">
                  Nenhuma despesa para categorizar neste período.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Month and period filter */}
      <div className="glass rounded-2xl p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => handleSelectMonth(shiftMonth(selectedMonth, -1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-[13px] font-bold uppercase tracking-wide text-glass-ink dark:text-white">
            {monthShortLabel(selectedMonth)} {selectedMonth.slice(0, 4)}
          </p>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => handleSelectMonth(shiftMonth(selectedMonth, 1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex w-full items-center gap-1.5 border-t border-glass-ink/5 px-1 pt-3 dark:border-white/10">
          <PeriodPicker
            mode={periodMode}
            selectedMonth={selectedMonth}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onModeChange={(nextMode) => {
              if (nextMode === "current") setMonth(currentMonthKey);
              setSelectedMonths([]);
              setPeriodMode(nextMode);
            }}
            onRangeChange={(start, end) => {
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
          <MonthMultiPicker
            monthOptions={monthOptions}
            selectedMonths={selectedMonths}
            onSelectedMonthsChange={handleSelectMonths}
          />
        </div>
        <div className="mt-2 flex w-full items-center gap-1.5">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "paid", label: "Pagos" },
              { id: "pending", label: "Pendentes" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={paymentStatus === option.id}
              onClick={() => setPaymentStatus(option.id)}
              className={cn(
                "flex-1 rounded-full px-2 py-2 text-[11px] font-semibold transition-all",
                paymentStatus === option.id
                  ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
                  : "glass text-glass-sub",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search and category filter */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="glass flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3.5 py-2.5">
          <Search className="size-4 shrink-0 text-glass-faint" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar transações, categorias..."
            aria-label="Buscar transações"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-glass-ink outline-none placeholder:text-glass-faint"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Limpar busca"
              className="shrink-0 text-glass-faint transition-colors hover:text-glass-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Filtrar por categorias"
              className={cn(
                "glass flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold transition-all",
                selectedCategories.length > 0
                  ? "text-glass-ink"
                  : "text-glass-sub",
              )}
            >
              <Filter className="size-4" />
              <span className="hidden sm:inline">{categoryFilterLabel}</span>
              {selectedCategories.length > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                  {selectedCategories.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-64">
            <DropdownMenuItem
              disabled={selectedCategories.length === 0}
              onSelect={() => setSelectedCategories([])}
            >
              <Check className="size-4" />
              Todas as categorias
            </DropdownMenuItem>
            {availableCategories.map((category) => (
              <DropdownMenuCheckboxItem
                key={category.id}
                checked={selectedCategories.includes(category.id)}
                onSelect={(event) => {
                  event.preventDefault();
                  toggleCategory(category.id);
                }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                {category.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search scope */}
      <div className="glass-soft flex w-full items-center gap-1 rounded-2xl p-1">
        <button
          type="button"
          onClick={() => setScope("month")}
          className={cn(
            "flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all",
            scope === "month"
              ? "bg-glass-ink text-white shadow-sm"
              : "text-glass-sub",
          )}
        >
          Mês selecionado
        </button>
        <button
          type="button"
          onClick={() => setScope("all")}
          className={cn(
            "flex-1 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all",
            scope === "all"
              ? "bg-glass-ink text-white shadow-sm"
              : "text-glass-sub",
          )}
        >
          Todo o histórico
        </button>
      </div>

      {/* Summary of the filter */}
      <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
        <p className="text-[12.5px] text-glass-sub">
          {filtered.length} {filtered.length === 1 ? "transação" : "transações"}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-[12.5px] font-bold text-[#1FBF4F]">
            +{formatCurrency(incomeTotal)}
          </p>
          <p className="text-[12.5px] font-bold text-[#FF3B30]">
            −{formatCurrency(expenseTotal)}
          </p>
        </div>
      </div>

      {/* Grouped list */}
      {grouped.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <ReceiptText className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma transação
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              {emptyDescription}
            </p>
          </div>
        </div>
      ) : (
        grouped.map(([label, list], groupIndex) => (
          <motion.section
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIndex * 0.05 }}
          >
            <p className="mb-1 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {label}
            </p>
            <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
              {list.map((transaction) => {
                const status = getTransactionPaymentStatus(
                  transaction,
                  loanReceivables,
                );
                const creditCardPurchase = isCreditCardTransaction(transaction);
                const isLoanReceivable = transaction.id.startsWith("loan-receivable-");
                const paymentLabel =
                  creditCardPurchase && status === "paid"
                    ? "Fatura paga"
                    : status === "paid"
                      ? "Pago"
                      : "Pendente";
                const paymentActionLabel = isLoanReceivable
                  ? status === "pending"
                    ? "Marcar recebido"
                    : undefined
                  : creditCardPurchase
                    ? status === "paid"
                      ? "Reabrir fatura"
                      : "Pagar fatura"
                    : status === "paid"
                      ? "Marcar pendente"
                      : "Marcar como pago";
                const handlePaymentAction = () => {
                  if (isLoanReceivable) {
                    if (status === "pending") {
                      markLoanReceivablesPaid([
                        transaction.id.replace("loan-receivable-", ""),
                      ]);
                    }
                    return;
                  }
                  setTransactionPaymentStatus(
                    transaction.id,
                    status === "paid" ? "pending" : "paid",
                  );
                };

                return (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    showDate={false}
                    swipeable
                    paymentLabel={paymentLabel}
                    paymentStatus={status}
                    paymentActionLabel={paymentActionLabel}
                    onPaymentAction={handlePaymentAction}
                    selectable={selectMode}
                    selected={selectedIds.has(transaction.id)}
                    onSelect={toggleSelectedTransaction}
                    onEdit={
                      isLoanReceivable
                        ? undefined
                        : () => handleEditTransaction(transaction)
                    }
                  />
                );
              })}
            </div>
          </motion.section>
        ))
      )}

      <AnimatePresence initial={false}>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="fixed inset-x-4 bottom-5 z-[180] flex items-center gap-2 rounded-2xl bg-[#0d1b3e] px-3 py-2.5 text-white shadow-[0_18px_40px_-16px_rgba(15,40,90,0.65)]"
          >
            <p className="min-w-0 flex-1 truncate text-[12px] font-semibold">
              {selectedIds.size} {selectedIds.size === 1 ? "selecionada" : "selecionadas"}
            </p>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="rounded-xl bg-[#E5484D] px-3 py-2 text-[11px] font-bold transition-all hover:brightness-105 active:scale-[0.98]"
            >
              Excluir selecionados
            </button>
            <button
              type="button"
              aria-label="Cancelar seleção"
              onClick={exitSelectMode}
              className="rounded-xl px-2.5 py-2 text-[11px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
