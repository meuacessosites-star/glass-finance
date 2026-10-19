import { LoanEditDialog } from "@/components/app/LoanEditDialog";
import { LoanInstallmentProgress } from "@/components/app/LoanInstallmentProgress";
import { LoanValueSettings } from "@/components/app/LoanValueSettings";
import {
  getLoanValueDisplay,
  type LoanValueMode,
} from "@/lib/loan-value-display";
import { getLoanReopenAmount } from "@/lib/loan-record-actions";
import { LoanDetailsDialog } from "@/components/app/LoanDetailsDialog";
import { needsCardLoanInvoice } from "@/lib/card-loans";
import { CardLoanInvoiceDialog } from "@/components/app/CardLoanInvoiceDialog";
import { useState } from "react";
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Infinity as InfinityIcon,
  Filter as FilterIcon,
  Search,
  RotateCcw,
  Paperclip,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useReportNavigationPendingCount } from "@/components/app/NavigationPendingContext";
import {
  PeriodPicker,
  MonthMultiPicker,
  formatDateLabel,
  type PeriodMode,
} from "@/components/app/PeriodPicker";
import { HorizontalScroll } from "@/components/app/HorizontalScroll";
import {
  SearchHighlight,
  SearchNavigationControls,
  useSearchNavigation,
} from "@/components/app/SearchHighlight";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppStore, type LoanReceivable } from "@/lib/app-store";
import { formatCurrency, initials, shortDate } from "@/lib/mock-data";
import {
  getLoanRepaymentStatus,
  getLoanOutstandingAmount,
  getLoanReceivedAmount,
  getSuggestedLoanReceiptAmount,
  isFreeLoan,
} from "@/lib/loan-repayments";
import { useLocalDate } from "@/hooks/use-local-date";
import { sanitizeDueDate } from "@/lib/transaction-status";
import { cn } from "@/lib/utils";
import {
  getLoanMonthOptions,
  getLoanAttachments,
  getLoanViewAfterInvoiceLink,
  getLoanViewSummary,
  selectLoanView,
  type LoanModeFilter,
  type LoanViewFilters,
} from "@/lib/loan-view";
import { normalizeSearchText } from "@/lib/transaction-view";

type Tab = "dinheiro" | "cartao";
type Row = LoanReceivable & { direction: "receber" | "pagar" };
type Filter = "all" | "pending" | "paid" | "overdue";

const cardThemeFor = (name: string) => {
  const themes: Record<string, string> = {
    "#2F6BFF":
      "border-[#d3dfef] bg-[#f5f8ff]/95 dark:border-[#344968] dark:bg-[#18283e]",
    "#AF52DE":
      "border-[#e6d7ec] bg-[#fbf5fc]/95 dark:border-[#594363] dark:bg-[#302338]",
    "#1FBF4F":
      "border-[#d0e5d6] bg-[#f2faf5]/95 dark:border-[#315442] dark:bg-[#172e24]",
    "#FF9500":
      "border-[#ebddc5] bg-[#fff9ef]/95 dark:border-[#5a4c32] dark:bg-[#322b1f]",
    "#FF2D55":
      "border-[#ebd4dd] bg-[#fff5f8]/95 dark:border-[#63404c] dark:bg-[#35242c]",
    "#00C7BE":
      "border-[#c9e4e1] bg-[#f0fbfa]/95 dark:border-[#315552] dark:bg-[#172f2d]",
  };
  return themes[tintFor(name)];
};

const tintFor = (name: string) => {
  const palette = [
    "#2F6BFF",
    "#AF52DE",
    "#1FBF4F",
    "#FF9500",
    "#FF2D55",
    "#00C7BE",
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return palette[hash % palette.length];
};

function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + offset, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function LoanRow({
  item,
  installments,
  valueMode,
  today,
  concluded,
  onReceive,
  searchQuery,
  cardName,
  onConfigureCard,
  onDetails,
  onReopen,
}: {
  item: Row;
  installments: LoanReceivable[];
  valueMode: LoanValueMode;
  today: string;
  concluded: boolean;
  onReceive: () => void;
  searchQuery: string;
  cardName?: string;
  onConfigureCard: () => void;
  onDetails: () => void;
  onReopen: () => void;
}) {
  const needsInvoice = needsCardLoanInvoice(item);
  const status = getLoanRepaymentStatus(item, today);
  const paid = status === "paid";
  const free = isFreeLoan(item);
  const remaining = getLoanOutstandingAmount(item);
  const received = getLoanReceivedAmount(item);
  const valueDisplay = getLoanValueDisplay(item, valueMode);
  const attachmentCount = item.attachments?.length ?? 0;
  const label = paid
    ? concluded
      ? "Concluído"
      : "Recebido"
    : needsInvoice
      ? "Definir fatura"
      : status === "overdue"
        ? "Vencido"
        : free
          ? "Em aberto"
          : "Pendente";
  return (
    <article
      data-search-result-id={item.id}
      data-search-match-result={searchQuery.trim() ? "true" : undefined}
      className={cn(
        "relative isolate flex gap-3 rounded-3xl border p-4 shadow-[0_10px_26px_-22px_rgba(20,50,75,0.45)]",
        cardThemeFor(item.contact),
      )}
    >
      <button
        id={`loan-details-${item.id}`}
        type="button"
        aria-label={`Ver detalhes de ${item.contact}${item.description ? `, ${item.description}` : ""}, parcela ${item.installment ?? 1} de ${item.installments ?? 1}`}
        onClick={onDetails}
        className="absolute inset-0 z-0 cursor-pointer rounded-3xl bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <div
        className="pointer-events-none relative z-10 flex size-10 shrink-0 items-center justify-center rounded-2xl text-[12px] font-bold text-white"
        style={{ backgroundColor: tintFor(item.contact) }}
      >
        {initials(item.contact)}
      </div>
      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
          <p className="min-w-0 break-words text-[14px] font-semibold leading-5 text-glass-ink">
            <SearchHighlight query={searchQuery}>
              {item.contact}
            </SearchHighlight>
          </p>
          <p
            className={cn(
              "amount-tabular whitespace-nowrap text-right text-[14px] font-bold leading-5",
              valueDisplay.className,
            )}
          >
            {valueDisplay.sign}
            {formatCurrency(valueDisplay.amount)}
          </p>
          {item.description && (
            <p className="col-span-2 mt-0.5 min-w-0 break-words text-[12px] text-glass-sub">
              <SearchHighlight query={searchQuery}>
                {item.description}
              </SearchHighlight>
            </p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0 flex items-center gap-1 text-[11.5px] font-medium text-glass-sub">
            {free ? (
              <InfinityIcon className="size-3.5 shrink-0" />
            ) : (
              <CalendarDays className="size-3.5 shrink-0" />
            )}
            <span className="min-w-0">
              {needsInvoice
                ? "Cartão e fatura a definir"
                : free
                  ? item.freePaymentMode === "installments"
                    ? "Livre em parcelas · sem vencimento"
                    : "Livre indefinido · sem vencimento"
                  : `${item.operationType === "card" ? "Cartão" : "Fixo"} · parcela ${item.installment ?? 1} de ${item.installments ?? 1}`}
            </span>
          </div>
          {attachmentCount > 0 && (
            <button
              type="button"
              onClick={onDetails}
              aria-label={`Ver ${attachmentCount} ${attachmentCount === 1 ? "anexo" : "anexos"} de ${item.contact}`}
              className="pointer-events-auto inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1 text-[10px] font-bold text-[#8B3FC7] transition-colors hover:text-[#6D2DA0] focus-visible:ring-2 focus-visible:ring-[#8B3FC7]/40 dark:text-[#D6A8F2] dark:hover:text-[#E8CBFA]"
            >
              <Paperclip className="size-3 shrink-0" strokeWidth={2.4} />
              {attachmentCount}
            </button>
          )}
        </div>
        <LoanInstallmentProgress
          item={item}
          items={installments}
          today={today}
          onDetails={onDetails}
        />
        <p
          className={cn(
            "mt-1 text-[11.5px]",
            status === "overdue"
              ? "font-semibold text-[#b52a32]"
              : "text-glass-sub",
          )}
        >
          {paid
            ? item.paymentDate
              ? `Recebido em ${shortDate(item.paymentDate)}`
              : "Recebimento concluído"
            : needsInvoice
              ? "Escolha o cartão para definir fechamento e vencimento."
              : free
                ? "Continua nos próximos meses até receber"
                : `${status === "overdue" ? "Venceu" : "Receber"} em ${shortDate(item.dueDate ?? item.createdAt)}`}
        </p>
        {item.operationType === "card" && !needsInvoice && (
          <div className="mt-2 space-y-1 text-[11.5px] text-glass-sub">
            <p className="font-semibold text-glass-ink">
              {cardName ?? "Cartão vinculado"}
            </p>
            <p>
              Fechamento {shortDate(item.cardClosingDate!)} · Vencimento{" "}
              {shortDate(item.dueDate!)}
            </p>
          </div>
        )}
        {needsInvoice && (
          <button
            type="button"
            onClick={onConfigureCard}
            className="pointer-events-auto mt-3 min-h-10 rounded-xl bg-primary/10 px-3 text-[12px] font-semibold text-primary"
          >
            Definir cartão e fatura
          </button>
        )}
        {free && (
          <div className="mt-2 text-[11.5px] leading-relaxed text-glass-sub">
            <p>
              Valor inicial {formatCurrency(item.amount)} · Recebido{" "}
              {formatCurrency(received)}
            </p>
            {!paid && (
              <p className="font-semibold text-glass-ink">
                Falta receber {formatCurrency(remaining)}
              </p>
            )}
            {!paid &&
              item.freePaymentMode === "installments" &&
              item.suggestedPaymentAmount && (
                <p>
                  Combinado por parcela:{" "}
                  {formatCurrency(getSuggestedLoanReceiptAmount(item))}
                </p>
              )}
          </div>
        )}
        {item.receipts && item.receipts.length > 0 && (
          <details className="pointer-events-auto mt-3 rounded-xl bg-white/60 px-3 py-2 text-[11.5px] text-glass-sub dark:bg-white/5">
            <summary className="cursor-pointer font-semibold text-glass-ink">
              Histórico · {item.receipts.length} recebimento
              {item.receipts.length > 1 ? "s" : ""}
            </summary>
            <ol className="mt-2 space-y-1.5">
              {item.receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-1"
                >
                  <span>{receipt.date.split("-").reverse().join("/")}</span>
                  <span className="amount-tabular font-semibold text-[#17a443]">
                    {formatCurrency(receipt.amount)}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
        {item.note?.trim() &&
          (item.draftDisplay === "multipleMedia" ||
            (searchQuery.trim() &&
              normalizeSearchText(item.note).includes(
                normalizeSearchText(searchQuery.trim()),
              ))) && (
            <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2.5 dark:bg-white/5">
              <p className="text-[10px] font-semibold text-[#9b655d] dark:text-[#ebb2a5]">
                Observação
              </p>
              <p className="mt-1 whitespace-pre-line border-l-2 border-[#bd9288] pl-2 text-[12px] text-glass-ink">
                <SearchHighlight query={searchQuery}>
                  {item.note}
                </SearchHighlight>
              </p>
            </div>
          )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3 dark:border-white/10">
          <button
            type="button"
            onClick={
              paid ? onReopen : needsInvoice ? onConfigureCard : onReceive
            }
            aria-label={
              paid
                ? `Reabrir registro de ${item.contact}`
                : needsInvoice
                  ? "Definir cartão e fatura"
                  : `Marcar recebido de ${item.contact}`
            }
            className={cn(
              "pointer-events-auto min-h-9 rounded-full px-2.5 py-1 text-[11px] font-bold",
              paid
                ? "bg-[#148d48] text-white"
                : status === "overdue"
                  ? "bg-[#be252c] text-white"
                  : free
                    ? "bg-[#247c80]/10 text-[#246b70] dark:text-[#8bd6d9]"
                    : "bg-[#ffa000] text-[#422c08]",
            )}
          >
            {label}
          </button>
          {paid && (
            <button
              type="button"
              onClick={onReopen}
              className="pointer-events-auto flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-[12px] font-semibold text-primary"
            >
              <RotateCcw className="size-3.5" />
              Reabrir
            </button>
          )}
          {!paid && !needsInvoice && (
            <button
              type="button"
              onClick={onReceive}
              className="pointer-events-auto flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-[12px] font-semibold text-primary"
            >
              <Check className="size-3.5" /> Marcar recebido
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function LoansPage() {
  const [valueSettingsOpen, setValueSettingsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("dinheiro");
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("current");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [scope, setScope] = useState<"period" | "all">("period");
  const [modeFilter, setModeFilter] = useState<LoanModeFilter>("all");
  const { activeIndex, goToPrevious, goToNext } = useSearchNavigation(search);
  const [configuringCard, setConfiguringCard] = useState<LoanReceivable | null>(
    null,
  );
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<LoanReceivable | null>(null);
  const [receiptChoice, setReceiptChoice] = useState<"all" | "partial" | null>(
    null,
  );
  const [receiptCents, setReceiptCents] = useState(0);
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptRequestId, setReceiptRequestId] = useState("");
  const today = useLocalDate();
  const selectedMonth = chosenMonth ?? today.slice(0, 7);
  const selectMonth = (month: string) => {
    setChosenMonth(month === today.slice(0, 7) ? null : month);
    setPeriodMode(month === today.slice(0, 7) ? "current" : "month");
    setSelectedMonths([]);
    setRangeStart(null);
    setRangeEnd(null);
    setScope("period");
  };
  const clearFilters = () => {
    selectMonth(today.slice(0, 7));
    setSearch("");
    setFilter("all");
    setModeFilter("all");
  };
  const {
    cards,
    loanReceivables,
    loanTransactions,
    loanValueMode,
    setLoanValueMode,
    markLoanReceivablesPaid,
    reopenLoanReceivable,
    receiveFreeLoanPayment,
  } = useAppStore();
  const stored: Row[] = loanReceivables.map((item) => {
    const transaction =
      loanTransactions.find((row) => row.id === item.transactionId) ??
      loanTransactions.find(
        (row) =>
          row.source === "loan" &&
          row.note?.includes(`Referência: ${item.loanId}`),
      );
    return {
      ...item,
      direction: "receber",
      note:
        item.note ??
        transaction?.note
          ?.split("\n")
          .filter(
            (line) =>
              !/^(Tipo:|Contato:|Cobrança:|Referência:|Parcela \d)/.test(line),
          )
          .join("\n")
          .trim(),
      draftDisplay: item.draftDisplay ?? transaction?.draftDisplay,
      attachments: getLoanAttachments(item, loanTransactions),
    };
  });
  const allRows = stored;
  const detailsItem = allRows.find((item) => item.id === detailsId);
  const editingItem = allRows.find((item) => item.id === editingId);
  const reopeningItem = allRows.find((item) => item.id === reopeningId);
  const monthOptions = getLoanMonthOptions(
    allRows,
    today.slice(0, 7),
    selectedMonth,
  );
  const viewFilters: LoanViewFilters = {
    selectedMonth,
    selectedMonths,
    fromDate: periodMode === "custom" ? rangeStart : null,
    untilDate: periodMode === "custom" ? rangeEnd : null,
    scope,
    tab,
    status: filter,
    mode: modeFilter,
    query: search,
  };
  const rows = selectLoanView(allRows, viewFilters, today);
  const hasFilters = Boolean(
    search.trim() ||
    filter !== "all" ||
    modeFilter !== "all" ||
    periodMode !== "current" ||
    selectedMonths.length ||
    scope !== "period",
  );
  const pending = rows.filter((item) => item.status !== "paid");
  const summary = getLoanViewSummary(rows, viewFilters);
  useReportNavigationPendingCount("loans", pending.length);
  const monthLabel = new Date(
    `${selectedMonth}-01T12:00:00`,
  ).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const receivingItem = receiving
    ? loanReceivables.find((item) => item.id === receiving.id)
    : undefined;
  const receivingFree = receivingItem ? isFreeLoan(receivingItem) : false;
  const receivingBalanceCents = receivingItem
    ? Math.round(getLoanOutstandingAmount(receivingItem) * 100)
    : 0;
  const amountToReceiveCents =
    receivingFree && receiptChoice === "partial"
      ? receiptCents
      : receivingBalanceCents;
  const validReceiptDate =
    Boolean(sanitizeDueDate(receiptDate)) &&
    receiptDate <= today &&
    (!receivingItem?.startDate || receiptDate >= receivingItem.startDate);
  const canReceive =
    Boolean(receivingItem) &&
    amountToReceiveCents > 0 &&
    amountToReceiveCents <= receivingBalanceCents &&
    (!receivingFree || (receiptChoice !== null && validReceiptDate));
  const openReceipt = (item: LoanReceivable) => {
    setReceiptChoice(null);
    setReceiptCents(
      item.freePaymentMode === "installments"
        ? Math.round(getSuggestedLoanReceiptAmount(item) * 100)
        : 0,
    );
    setReceiptDate(today);
    setReceiptRequestId(crypto.randomUUID());
    setReceiving(item);
  };
  const markReceived = () => {
    if (!receivingItem || !canReceive) return;
    if (receivingFree) {
      receiveFreeLoanPayment(
        receivingItem.id,
        amountToReceiveCents / 100,
        receiptDate,
        receiptRequestId,
      );
      const rest = (receivingBalanceCents - amountToReceiveCents) / 100;
      toast.success(
        rest > 0
          ? `Recebimento registrado. Restam ${formatCurrency(rest)}`
          : "Empréstimo concluído",
      );
      setReceiving(null);
      return;
    }
    markLoanReceivablesPaid([receivingItem.id]);
    const hasOtherUnpaid = loanReceivables.some(
      (item) =>
        item.loanId === receivingItem.loanId &&
        item.id !== receivingItem.id &&
        item.status !== "paid",
    );
    toast.success(hasOtherUnpaid ? "Parcela recebida" : "Empréstimo concluído");
    setReceiving(null);
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-0">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-foreground">
              Empréstimos
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Acompanhe cada devolução
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            id="loan-value-settings-trigger"
            type="button"
            aria-label="Aparência dos valores"
            aria-haspopup="dialog"
            onClick={() => setValueSettingsOpen(true)}
            className="glass flex size-10 items-center justify-center rounded-full text-glass-sub"
          >
            <Settings2 className="size-[18px]" />
          </button>
          <ThemeToggle />
        </div>
      </header>
      <LoanValueSettings
        open={valueSettingsOpen}
        onOpenChange={setValueSettingsOpen}
        mode={loanValueMode}
        onModeChange={setLoanValueMode}
      />
      <div className="glass rounded-3xl p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => selectMonth(shiftMonth(selectedMonth, -1))}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-glass-sub"
          >
            <ChevronLeft className="size-5" />
          </button>
          <p className="text-center text-[14px] font-bold uppercase text-glass-ink">
            {selectedMonths.length > 1
              ? `${selectedMonths.length} meses selecionados`
              : monthLabel}
          </p>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => selectMonth(shiftMonth(selectedMonth, 1))}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-glass-sub"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <HorizontalScroll className="mt-2 gap-2 border-t border-glass-ink/5 pt-3 pb-1 dark:border-white/10">
          <PeriodPicker
            mode={periodMode}
            selectedMonth={selectedMonth}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onModeChange={(mode) => {
              setPeriodMode(mode);
              setScope("period");
              setSelectedMonths([]);
              if (mode === "current") setChosenMonth(null);
            }}
            onRangeChange={(start, end) => {
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
          <MonthMultiPicker
            monthOptions={monthOptions}
            selectedMonths={selectedMonths}
            onSelectedMonthsChange={(months) => {
              setSelectedMonths(months);
              setPeriodMode("month");
              setRangeStart(null);
              setRangeEnd(null);
              setScope("period");
              if (months.length) setChosenMonth(months[0]);
            }}
          />
        </HorizontalScroll>
        {periodMode === "custom" && rangeStart && (
          <p className="mt-2 px-1 text-[11.5px] font-semibold text-glass-sub">
            {formatDateLabel(rangeStart)}
            {rangeEnd && rangeEnd !== rangeStart
              ? ` até ${formatDateLabel(rangeEnd)}`
              : ""}
          </p>
        )}
        <HorizontalScroll className="mt-3 gap-2 border-t border-glass-ink/5 pt-3 pb-1 dark:border-white/10">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "pending", label: "Pendentes" },
              { id: "paid", label: "Concluídos" },
              { id: "overdue", label: "Vencidos" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-3 py-2 text-[11px] font-semibold lg:flex-1 lg:text-[13px]",
                filter === id
                  ? "bg-primary text-white"
                  : "glass text-glass-sub",
              )}
            >
              {label}
            </button>
          ))}
        </HorizontalScroll>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-3xl border border-[#cce5da] bg-[#f1faf5]/95 p-4 dark:border-[#315442] dark:bg-[#172e24]">
          <p className="text-[12px] font-medium text-glass-sub">Já recebido</p>
          <p className="amount-tabular mt-1 break-words text-[20px] font-bold text-[#17a443] dark:text-[#7edb9d]">
            {formatCurrency(summary.received)}
          </p>
          <p className="mt-0.5 text-[11px] text-glass-faint">
            {scope === "all" ? "Todo o histórico" : "No período selecionado"}
          </p>
        </div>
        <div className="min-w-0 rounded-3xl border border-[#e9d4d5] bg-[#fff4f3]/95 p-4 dark:border-[#63404c] dark:bg-[#35242c]">
          <p className="text-[12px] font-medium text-glass-sub">
            Falta receber
          </p>
          <p className="amount-tabular mt-1 break-words text-[20px] font-bold text-[#d63036] dark:text-[#ff9b96]">
            {formatCurrency(summary.outstanding)}
          </p>
          <p className="mt-0.5 text-[11px] text-glass-faint">
            {scope === "all" ? "Todo o histórico" : "No período selecionado"}
          </p>
        </div>
      </div>
      <div className="glass glass-strong grid grid-cols-2 gap-1 rounded-full p-1">
        {(
          [
            { id: "dinheiro", label: "Dinheiro", Icon: Banknote },
            { id: "cartao", label: "Cartão emprestado", Icon: CreditCard },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              if (id === "cartao") setModeFilter("all");
            }}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1 rounded-full px-2 py-3 text-[12px] font-semibold",
              tab === id ? "bg-primary text-white" : "text-glass-sub",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <div className="glass grid min-h-11 min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2xl px-3 sm:grid-cols-[1rem_minmax(0,1fr)_auto_auto] lg:px-3.5">
          <Search className="col-start-1 row-start-1 size-4 shrink-0 text-glass-faint" />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (!event.target.value.trim()) setScope("period");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && search.trim()) {
                event.preventDefault();
                goToNext();
              }
            }}
            placeholder="Buscar pessoas e anotações..."
            aria-label="Buscar empréstimos"
            className="col-start-2 row-start-1 h-11 w-full min-w-0 bg-transparent text-[16px] text-glass-ink outline-none placeholder:text-glass-faint sm:text-[15px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:appearance-none"
          />
          <SearchNavigationControls
            query={search}
            resultCount={rows.length}
            activeIndex={activeIndex}
            onPrevious={goToPrevious}
            onNext={goToNext}
            className="col-span-full row-start-2 justify-end border-t border-glass-ink/10 dark:border-white/10 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:border-t-0"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setSearch("");
                setScope("period");
              }}
              className="col-start-3 row-start-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-glass-faint sm:col-start-4"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Filtrar modalidade dos empréstimos"
              className={cn(
                "glass flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-[12px] font-semibold",
                modeFilter !== "all" ? "text-primary" : "text-glass-sub",
              )}
            >
              <FilterIcon className="size-4" />
              {modeFilter !== "all" && (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">
                  1
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-60">
            <DropdownMenuLabel>Forma de devolução</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={modeFilter}
              onValueChange={(value) => setModeFilter(value as LoanModeFilter)}
            >
              <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="fixed">
                Fixo/Parcelado
              </DropdownMenuRadioItem>
              {tab === "dinheiro" && (
                <>
                  <DropdownMenuRadioItem value="free-installments">
                    Livre em parcelas
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="free-flexible">
                    Livre indefinido
                  </DropdownMenuRadioItem>
                </>
              )}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(search.trim() || scope === "all") && (
        <div className="glass grid grid-cols-2 rounded-full p-1">
          <button
            type="button"
            onClick={() => setScope("period")}
            className={cn(
              "min-h-10 rounded-full px-2 text-[11.5px] font-semibold",
              scope === "period" ? "bg-glass-ink text-white" : "text-glass-sub",
            )}
          >
            Período selecionado
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "min-h-10 rounded-full px-2 text-[11.5px] font-semibold",
              scope === "all" ? "bg-glass-ink text-white" : "text-glass-sub",
            )}
          >
            Todo o histórico
          </button>
        </div>
      )}
      {hasFilters && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearFilters}
            className="flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold text-primary"
          >
            <X className="size-3.5" />
            Remover filtros
          </button>
        </div>
      )}
      {rows.some((item) => isFreeLoan(item) && item.status !== "paid") && (
        <p className="glass rounded-2xl px-4 py-3 text-[12px] leading-relaxed text-glass-sub">
          Só o saldo restante passa para os próximos meses. Um mês sem
          recebimento não cria novas parcelas nem aumenta a dívida.
        </p>
      )}
      {(["receber", "pagar"] as const).map((direction) => {
        const items = rows.filter((item) => item.direction === direction);
        if (!items.length) return null;
        return (
          <section key={direction} className="pt-1">
            <p className="mb-3 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {direction === "receber" ? "Quem me deve" : "Eu devo"}
            </p>
            <div className="space-y-5">
              {items.map((item) => (
                <LoanRow
                  key={item.id}
                  item={item}
                  installments={allRows}
                  valueMode={loanValueMode}
                  today={today}
                  concluded={
                    !allRows.some(
                      (other) =>
                        other.loanId === item.loanId && other.status !== "paid",
                    )
                  }
                  searchQuery={search}
                  cardName={cards.find((card) => card.id === item.cardId)?.name}
                  onDetails={() => setDetailsId(item.id)}
                  onReopen={() => setReopeningId(item.id)}
                  onConfigureCard={() => setConfiguringCard(item)}
                  onReceive={() => openReceipt(item)}
                />
              ))}
            </div>
          </section>
        );
      })}
      {!rows.length && (
        <div className="glass space-y-3 rounded-3xl px-4 py-8 text-center text-[13px] text-glass-sub">
          <p>Nenhum empréstimo encontrado neste período com esses filtros.</p>
          {tab === "cartao" &&
            allRows.some((item) => item.operationType === "card") && (
              <button
                type="button"
                onClick={() => {
                  setScope("all");
                  setSearch("");
                  setFilter("all");
                  setModeFilter("all");
                }}
                className="min-h-11 rounded-xl bg-primary/10 px-4 py-2 font-semibold text-primary"
              >
                Ver todas as compras de cartão
              </button>
            )}
        </div>
      )}
      {detailsItem && (
        <LoanDetailsDialog
          key={detailsItem.id}
          item={detailsItem}
          valueMode={loanValueMode}
          installments={allRows}
          card={cards.find((card) => card.id === detailsItem.cardId)}
          purchaseDate={
            detailsItem.startDate ??
            loanTransactions.find(
              (row) =>
                row.amount < 0 &&
                row.note?.includes(`Referência: ${detailsItem.loanId}`),
            )?.date
          }
          today={today}
          onEdit={() => {
            setDetailsId(null);
            setEditingId(detailsItem.id);
          }}
          onReopen={() => {
            setDetailsId(null);
            setReopeningId(detailsItem.id);
          }}
          onClose={() => setDetailsId(null)}
        />
      )}
      {editingItem && (
        <LoanEditDialog
          key={editingItem.id}
          item={editingItem}
          purchaseDate={
            editingItem.startDate ??
            loanTransactions.find(
              (row) =>
                row.amount < 0 &&
                row.note?.includes(`Referência: ${editingItem.loanId}`),
            )?.date
          }
          onClose={() => setEditingId(null)}
        />
      )}
      <AlertDialog
        open={Boolean(reopeningItem)}
        onOpenChange={(open) => {
          if (!open) setReopeningId(null);
        }}
      >
        <AlertDialogContent className="glass-strong rounded-3xl p-5 text-glass-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja reabrir o registro de {reopeningItem?.contact}?{" "}
              {formatCurrency(
                reopeningItem ? getLoanReopenAmount(reopeningItem) : 0,
              )}{" "}
              voltará a ficar em aberto. O recebimento que concluiu este
              registro será desfeito. Os pagamentos parciais anteriores serão
              mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !reopeningItem || getLoanReopenAmount(reopeningItem) <= 0
              }
              onClick={() => {
                if (!reopeningItem) return;
                reopenLoanReceivable(reopeningItem.id);
                setReopeningId(null);
                toast.success("Registro reaberto");
              }}
              className="rounded-xl bg-primary text-white"
            >
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {configuringCard && (
        <CardLoanInvoiceDialog
          key={configuringCard.id}
          item={configuringCard}
          today={today}
          purchaseDate={
            configuringCard.startDate ??
            loanTransactions.find(
              (row) =>
                row.amount < 0 &&
                row.note?.includes(`Referência: ${configuringCard.loanId}`),
            )?.date ??
            configuringCard.createdAt
          }
          onClose={() => setConfiguringCard(null)}
          onSaved={(item) => {
            const dueDate = item.dueDate;
            if (!dueDate) return;
            const next = getLoanViewAfterInvoiceLink(item, viewFilters, today);
            if (next !== viewFilters) {
              selectMonth(next.selectedMonth);
              setTab(next.tab);
              setFilter(next.status);
              setModeFilter(next.mode);
              setSearch(next.query);
            }
            setConfiguringCard(null);
            const invoiceLabel = new Date(
              `${dueDate.slice(0, 7)}-01T12:00:00`,
            ).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
            toast.success(
              `Compra de ${item.contact} na fatura de ${invoiceLabel}`,
              {
                description: `Vencimento em ${shortDate(dueDate)}. O valor e os recebimentos foram mantidos.`,
                duration: 8000,
                action: {
                  label: "Ver detalhes",
                  onClick: () => setDetailsId(item.id),
                },
              },
            );
          }}
        />
      )}
      <AlertDialog
        open={Boolean(receiving)}
        onOpenChange={(open) => {
          if (!open) setReceiving(null);
        }}
      >
        <AlertDialogContent className="glass-strong z-[80] max-h-[85dvh] overflow-y-auto rounded-2xl p-5 text-glass-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {receivingFree
                ? "Registrar recebimento"
                : "Confirmar recebimento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {receivingFree
                ? `Quanto você recebeu de ${receivingItem?.contact}? Falta receber ${formatCurrency(receivingBalanceCents / 100)}.`
                : `Você recebeu ${formatCurrency(receivingBalanceCents / 100)} de ${receivingItem?.contact}? Somente esta parcela será marcada como recebida.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {receivingFree && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={receiptChoice === "all"}
                  onClick={() => setReceiptChoice("all")}
                  className={cn(
                    "min-h-12 rounded-xl px-2 py-2 text-[12px] font-semibold",
                    receiptChoice === "all"
                      ? "bg-primary text-white"
                      : "glass text-glass-sub",
                  )}
                >
                  Recebi tudo
                </button>
                <button
                  type="button"
                  aria-pressed={receiptChoice === "partial"}
                  onClick={() => setReceiptChoice("partial")}
                  className={cn(
                    "min-h-12 rounded-xl px-2 py-2 text-[12px] font-semibold",
                    receiptChoice === "partial"
                      ? "bg-primary text-white"
                      : "glass text-glass-sub",
                  )}
                >
                  Recebi uma parte
                </button>
              </div>
              {receiptChoice === "partial" && (
                <label className="block text-[12px] font-semibold text-glass-sub">
                  Quanto recebeu?
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Valor recebido do empréstimo"
                    placeholder="R$ 0,00"
                    value={
                      receiptCents ? formatCurrency(receiptCents / 100) : ""
                    }
                    onChange={(event) =>
                      setReceiptCents(
                        Number(event.target.value.replace(/\D/g, "")) || 0,
                      )
                    }
                    className="glass mt-2 min-h-12 w-full rounded-xl px-3 py-3 text-[16px] text-glass-ink outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {receiptCents > receivingBalanceCents && (
                    <span className="mt-1 block text-[11px] text-[#b52a32]">
                      O valor deve ser até{" "}
                      {formatCurrency(receivingBalanceCents / 100)}.
                    </span>
                  )}
                </label>
              )}
              <label className="block text-[12px] font-semibold text-glass-sub">
                Data do recebimento
                <input
                  type="date"
                  aria-label="Data do recebimento do empréstimo"
                  value={receiptDate}
                  min={receivingItem?.startDate}
                  max={today}
                  onChange={(event) => setReceiptDate(event.target.value)}
                  className="glass mt-2 min-h-12 w-full rounded-xl px-3 py-3 text-[14px] text-glass-ink outline-none"
                />
              </label>
              {receiptChoice && (
                <div className="glass rounded-xl px-3 py-3 text-[12px] text-glass-sub">
                  <p>
                    Recebimento:{" "}
                    <strong className="text-glass-ink">
                      {formatCurrency(amountToReceiveCents / 100)}
                    </strong>
                  </p>
                  <p className="mt-1">
                    Restante em aberto:{" "}
                    <strong className="text-glass-ink">
                      {formatCurrency(
                        Math.max(
                          0,
                          receivingBalanceCents - amountToReceiveCents,
                        ) / 100,
                      )}
                    </strong>
                  </p>
                </div>
              )}
              <p className="text-[11.5px] leading-relaxed text-glass-sub">
                Se não receber no próximo mês, o restante continuará igual.
                Nenhuma cobrança extra será criada.
              </p>
            </div>
          )}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="mt-0 rounded-xl">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!canReceive}
              onClick={markReceived}
              className="rounded-xl bg-primary text-white disabled:opacity-50"
            >
              {receivingFree ? "Salvar recebimento" : "Sim, recebi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
