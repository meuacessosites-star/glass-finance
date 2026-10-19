import { useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  Paperclip,
  Settings2,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentImageViewer } from "./AttachmentImageViewer";
import { ReportCategoryLimitEditor } from "./ReportCategoryLimitEditor";
import { SearchHighlight, SearchNavigationControls } from "./SearchHighlight";
import {
  normalizePaymentMethod,
  PAYMENT_METHOD_LABELS,
} from "./PaymentMethodSelector";
import { useAppStore } from "@/lib/app-store";
import { useLocalDate } from "@/hooks/use-local-date";
import { downloadAttachment } from "@/lib/attachment-utils";
import {
  getTransactionDueDate,
  getTransactionPaymentStatus,
} from "@/lib/transaction-status";
import {
  searchReportCategoryExpenses,
  type getReportCategoryDetails,
} from "@/lib/report-view";
import type { getCategoryHistoryReference } from "@/lib/report-budgets";
import { formatCurrency, monthLabel, recurrenceLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const dateLabel = (date: string) => date.split("-").reverse().join("/");

export function ReportCategoryDetails({
  category,
  details,
  history,
  onLimitSave,
  periodLabel,
  searchQuery,
  triggerId,
  onClose,
}: {
  category: { label: string; color: string };
  details: ReturnType<typeof getReportCategoryDetails>;
  history: ReturnType<typeof getCategoryHistoryReference>;
  onLimitSave: (amount: number | null) => void;
  periodLabel: string;
  searchQuery: string;
  triggerId: string;
  onClose: () => void;
}) {
  const { cards, loanReceivables } = useAppStore();
  const today = useLocalDate();
  const [localQuery, setLocalQuery] = useState("");
  const [activeResult, setActiveResult] = useState(-1);
  const expenseListRef = useRef<HTMLDivElement>(null);
  const searching = Boolean(localQuery.trim());
  const results = searchReportCategoryExpenses(
    details.transactions,
    localQuery,
  );
  const changeQuery = (value: string) => {
    setLocalQuery(value);
    setActiveResult(-1);
  };
  const navigateResults = (direction: -1 | 1) => {
    const elements =
      expenseListRef.current?.querySelectorAll<HTMLDetailsElement>(
        "[data-category-expense]",
      );
    if (!elements?.length) return;
    const index =
      activeResult < 0
        ? direction === 1
          ? 0
          : elements.length - 1
        : (activeResult + direction + elements.length) % elements.length;
    setActiveResult(index);
    const element = elements[index];
    element.open = true;
    element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const [editingLimit, setEditingLimit] = useState(false);
  const [expandedImage, setExpandedImage] = useState<{
    attachments: string[];
    index: number;
  } | null>(null);
  const download = async (src: string, index: number) => {
    try {
      await downloadAttachment(src, `anexo-relatorio-${index + 1}`);
    } catch {
      toast.error("Não foi possível baixar este anexo");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="glass-strong flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 text-glass-ink"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(triggerId)?.focus();
        }}
      >
        <div className="shrink-0 space-y-3 border-b border-glass-ink/10 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <DialogHeader className="min-w-0 text-left">
              <DialogTitle className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="min-w-0 break-words">
                  Gastos de {category.label}
                </span>
              </DialogTitle>
              <DialogDescription>{periodLabel}</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Fechar detalhes da categoria"
                className="glass flex size-10 shrink-0 items-center justify-center rounded-full text-glass-sub"
              >
                <X className="size-[18px]" />
              </button>
            </DialogClose>
          </div>
          <div className="glass grid min-h-11 min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2xl px-3 sm:grid-cols-[1rem_minmax(0,1fr)_auto_auto]">
            <Search className="col-start-1 row-start-1 size-4 shrink-0 text-glass-faint" />
            <input
              type="search"
              enterKeyHint="search"
              value={localQuery}
              onChange={(event) => changeQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searching) {
                  event.preventDefault();
                  navigateResults(1);
                }
              }}
              placeholder="Buscar gastos e anotações..."
              aria-label={`Buscar gastos e anotações de ${category.label}`}
              className="col-start-2 row-start-1 h-11 w-full min-w-0 bg-transparent text-[16px] text-glass-ink outline-none placeholder:text-glass-faint sm:text-[15px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:appearance-none"
            />
            <SearchNavigationControls
              query={localQuery}
              resultCount={results.list.length}
              activeIndex={activeResult}
              onPrevious={() => navigateResults(-1)}
              onNext={() => navigateResults(1)}
              className="col-span-full row-start-2 justify-end border-t border-glass-ink/10 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:border-t-0"
            />
            {localQuery && (
              <button
                type="button"
                onClick={() => changeQuery("")}
                aria-label="Limpar busca da categoria"
                className="col-start-3 row-start-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-glass-faint transition-colors hover:text-glass-ink sm:col-start-4"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {details.months.length > 1 && (
            <p className="text-[11.5px] leading-relaxed text-glass-sub">
              {details.months.map(monthLabel).join(" · ")}
            </p>
          )}
          {searchQuery.trim() && (
            <p className="break-words rounded-xl bg-primary/5 px-3 py-2 text-[12px] text-glass-sub">
              Filtro de Relatórios: <strong>{searchQuery.trim()}</strong>
            </p>
          )}
          <section
            className="rounded-2xl bg-primary/5 p-3"
            aria-label="Resumo da categoria"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-glass-sub">
                  Total gasto no período
                </p>
                <p className="amount-tabular mt-1 break-words text-[20px] font-bold text-[#c72d35] dark:text-[#ff9b96]">
                  {formatCurrency(details.used)}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[11px] text-glass-sub">
                  {details.hasLimit ? "Limite do período" : "Acompanhamento"}
                </p>
                <p className="amount-tabular mt-1 break-words text-[17px] font-bold">
                  {details.hasLimit
                    ? formatCurrency(details.limit)
                    : "Sem limite"}
                </p>
              </div>
            </div>
            {details.hasLimit && (
              <>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
                  aria-hidden="true"
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      details.overage > 0 ? "bg-[#c72d35]" : "bg-primary",
                    )}
                    style={{ width: `${Math.min(100, details.percentage)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11.5px] text-glass-sub">
                  {Math.round(details.percentage)}% do limite usado
                </p>
                <p
                  className={cn(
                    "mt-1 text-[12px] font-semibold",
                    details.overage > 0
                      ? "text-[#c72d35] dark:text-[#ff9b96]"
                      : "text-[#148d48] dark:text-[#7edb9d]",
                  )}
                >
                  {details.overage > 0
                    ? `Acima do limite em ${formatCurrency(details.overage)}`
                    : `Disponível no limite: ${formatCurrency(details.remaining)}`}
                </p>
                {details.months.length > 1 && (
                  <p className="mt-2 text-[11px] text-glass-sub">
                    Limite mensal de {formatCurrency(details.monthlyLimit ?? 0)}{" "}
                    × {details.months.length} meses.
                  </p>
                )}
              </>
            )}
            {!details.hasLimit && (
              <p className="mt-3 text-[12px] text-glass-sub">
                Os gastos são acompanhados sem um teto definido.
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditingLimit((open) => !open)}
              aria-expanded={editingLimit}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary/10 px-3 text-[12px] font-semibold text-primary"
            >
              <Settings2 className="size-3.5" />
              {details.hasLimit ? "Editar limite" : "Definir limite"}
            </button>
          </section>
          {editingLimit && (
            <ReportCategoryLimitEditor
              monthlyLimit={details.hasLimit ? details.monthlyLimit : null}
              onCancel={() => setEditingLimit(false)}
              onSave={(amount) => {
                onLimitSave(amount);
                setEditingLimit(false);
                toast.success(
                  amount === null
                    ? "Categoria sem limite definido"
                    : "Limite mensal atualizado",
                );
              }}
            />
          )}
          {!details.hasLimit && (
            <section className="space-y-2 rounded-2xl border border-glass-ink/10 p-3">
              <h3 className="text-[13px] font-bold">
                Referência dos meses anteriores
              </h3>
              {history.months.length ? (
                <>
                  <p className="amount-tabular text-[19px] font-bold">
                    {formatCurrency(history.monthlyAverage)}
                    <span className="ml-1 text-[11px] font-normal text-glass-sub">
                      por mês
                    </span>
                  </p>
                  <p className="text-[11.5px] leading-relaxed text-glass-sub">
                    Média de {history.months.length}{" "}
                    {history.months.length === 1
                      ? "mês anterior com gastos"
                      : "meses anteriores com gastos"}{" "}
                    nesta categoria. O mês atual e os meses sem gastos ficam
                    fora da média. É uma referência, sem aviso de limite
                    estourado.
                  </p>
                  {details.months.length > 1 && (
                    <p className="text-[12px] text-glass-sub">
                      Referência para {details.months.length} meses:{" "}
                      <strong>{formatCurrency(history.periodReference)}</strong>
                    </p>
                  )}
                  {searchQuery.trim() && (
                    <p className="text-[11px] text-glass-sub">
                      A média usa todos os gastos anteriores da categoria, mesmo
                      com uma busca aplicada.
                    </p>
                  )}
                  <details className="rounded-xl bg-primary/5 p-2.5">
                    <summary className="cursor-pointer text-[12px] font-semibold text-primary">
                      Ver meses usados na média
                    </summary>
                    <ul className="mt-2 space-y-2 text-[12px]">
                      {history.months.map((entry) => (
                        <li
                          key={entry.month}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span>{monthLabel(entry.month)}</span>
                          <strong className="amount-tabular whitespace-nowrap">
                            {formatCurrency(entry.spent)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 border-t border-glass-ink/10 pt-2 text-[11.5px] text-glass-sub">
                      {formatCurrency(history.total)} ÷ {history.months.length}{" "}
                      {history.months.length === 1 ? "mês" : "meses"} ={" "}
                      {formatCurrency(history.monthlyAverage)} por mês.
                    </p>
                  </details>
                </>
              ) : (
                <p className="text-[12px] text-glass-sub">
                  Ainda não há meses anteriores encerrados com gastos nesta
                  categoria. Seus registros aparecerão aqui conforme o histórico
                  aumentar.
                </p>
              )}
            </section>
          )}
          <div>
            <h3
              className="text-[14px] font-bold"
              role="status"
              aria-live="polite"
            >
              {results.list.length}
              {searching ? ` de ${details.transactions.length}` : ""}{" "}
              {results.list.length === 1 && !searching
                ? "despesa registrada"
                : "despesas registradas"}
            </h3>
            {searching && (
              <p className="mt-1 text-[12px] text-glass-sub">
                Total encontrado:{" "}
                <strong className="amount-tabular">
                  {formatCurrency(results.total)}
                </strong>
              </p>
            )}
            {results.list.length > 0 && (
              <p className="mt-1 text-[11.5px] text-glass-sub">
                Toque em uma despesa para ver os detalhes.
              </p>
            )}
          </div>
          {!results.list.length && (
            <p className="rounded-2xl border border-glass-ink/10 p-4 text-[12px] text-glass-sub">
              {searching
                ? `Nenhuma despesa encontrada para “${localQuery.trim()}” nesta categoria e período.`
                : "Nenhuma despesa desta categoria nos meses e na busca selecionados."}
            </p>
          )}
          <div className="space-y-3" ref={expenseListRef}>
            {results.list.map((transaction, resultIndex) => {
              const status = getTransactionPaymentStatus(
                transaction,
                cards,
                loanReceivables,
                today,
              );
              const dueDate = getTransactionDueDate(
                transaction,
                cards,
                loanReceivables,
              );
              const attachments = transaction.attachments ?? [];
              const payment = normalizePaymentMethod(transaction.paymentMethod);
              const mode = transaction.cardMode ?? payment.cardMode;
              const card = cards.find((item) => item.id === transaction.cardId);
              const paymentText = [
                payment.method
                  ? PAYMENT_METHOD_LABELS[payment.method]
                  : transaction.paymentMethod || "Não informada",
                mode === "credito"
                  ? "Crédito"
                  : mode === "debito"
                    ? "Débito"
                    : null,
                card ? `${card.name} · final ${card.last4}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const repetition = recurrenceLabel(transaction);
              return (
                <details
                  key={transaction.id}
                  data-category-expense
                  className={cn(
                    "group rounded-2xl border border-glass-ink/10 bg-white/45 dark:bg-white/5",
                    searching &&
                      activeResult === resultIndex &&
                      "ring-2 ring-primary/60",
                  )}
                >
                  <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2">
                      <p className="min-w-0 break-words text-[13px] font-semibold leading-5">
                        <SearchHighlight query={localQuery}>
                          {transaction.title}
                        </SearchHighlight>
                      </p>
                      <p className="amount-tabular whitespace-nowrap text-[13px] font-bold leading-5">
                        −{formatCurrency(Math.abs(transaction.amount))}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-glass-sub">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        <time dateTime={transaction.date}>
                          {dateLabel(transaction.date)}
                        </time>
                        {transaction.time && ` · ${transaction.time}`}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-semibold",
                          status === "paid"
                            ? "bg-[#148d48] text-white"
                            : status === "overdue"
                              ? "bg-[#be252c] text-white"
                              : "bg-[#ffa000] text-[#422c08]",
                        )}
                      >
                        {status === "paid"
                          ? "Pago"
                          : status === "overdue"
                            ? "Vencida"
                            : "Pendente"}
                      </span>
                      {attachments.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 font-bold text-[#8B3FC7] dark:text-[#D6A8F2]"
                          aria-label={`${attachments.length} anexos`}
                        >
                          <Paperclip className="size-3" />
                          {attachments.length}
                        </span>
                      )}
                      <ChevronDown
                        className="ml-auto size-3.5 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </div>
                  </summary>
                  <div className="space-y-3 border-t border-glass-ink/10 p-3 text-[12px]">
                    <p className="break-words text-glass-sub">
                      <strong className="font-semibold text-glass-ink">
                        Pagamento:
                      </strong>{" "}
                      {paymentText}
                    </p>
                    {dueDate && (
                      <p className="text-glass-sub">
                        <strong className="font-semibold text-glass-ink">
                          Vencimento:
                        </strong>{" "}
                        {dateLabel(dueDate)}
                      </p>
                    )}
                    {status === "paid" && transaction.paymentDate && (
                      <p className="text-glass-sub">
                        <strong className="font-semibold text-glass-ink">
                          Pago em:
                        </strong>{" "}
                        {dateLabel(transaction.paymentDate)}
                      </p>
                    )}
                    {repetition && (
                      <p className="text-glass-sub">{repetition}</p>
                    )}
                    {transaction.note && (
                      <div className="rounded-xl bg-primary/5 p-3">
                        <p className="mb-1 text-[11px] font-semibold text-[#9a6e65] dark:text-[#d6b2a9]">
                          Observação
                        </p>
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          <SearchHighlight query={localQuery}>
                            {transaction.note}
                          </SearchHighlight>
                        </p>
                      </div>
                    )}
                    {attachments.length > 0 && (
                      <div>
                        <h4 className="mb-2 font-semibold">Anexos</h4>
                        <div className="flex flex-wrap gap-2">
                          {attachments.map((src, index) =>
                            src.startsWith("data:image") ? (
                              <button
                                key={index}
                                type="button"
                                onClick={() =>
                                  setExpandedImage({ attachments, index })
                                }
                                aria-label={`Ampliar anexo ${index + 1} de ${transaction.title}`}
                                className="overflow-hidden rounded-xl border border-glass-ink/10 focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <img
                                  src={src}
                                  alt={`Anexo ${index + 1}`}
                                  className="size-20 object-cover"
                                />
                              </button>
                            ) : (
                              <button
                                key={index}
                                type="button"
                                onClick={() => void download(src, index)}
                                className="flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-primary"
                              >
                                <FileText className="size-4" />
                                Anexo {index + 1}
                                <Download className="size-4" />
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </DialogContent>
      {expandedImage && (
        <AttachmentImageViewer
          attachments={expandedImage.attachments}
          initialAttachmentIndex={expandedImage.index}
          onClose={() => setExpandedImage(null)}
        />
      )}
    </Dialog>
  );
}
