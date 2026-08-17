import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Filter, ReceiptText, Search, X } from "lucide-react";
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
import { useAppStore } from "@/lib/app-store";
import {
  currentMonthKey,
  dayLabel,
  formatCurrency,
  monthKey,
  monthShortLabel,
  type Transaction,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export default function TransactionsPage() {
  const { categories, visibleTransactions, loanReceivables } = useAppStore();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [scope, setScope] = useState<"month" | "all">("month");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

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
  const [month, setMonth] = useState<string>(allMonths[0] ?? currentMonthKey);
  const selectedMonth = allMonths.includes(month)
    ? month
    : allMonths[0] ?? currentMonthKey;

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
          scope === "all" || monthKey(transaction.date) === selectedMonth,
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
    categoryById,
    consolidatedTransactions,
    scope,
    searchQuery,
    selectedCategories,
    selectedMonth,
  ]);

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

  const emptyDescription = searchQuery.trim()
    ? `Nenhuma movimentação encontrada para “${searchQuery.trim()}”.`
    : scope === "all"
      ? "Nenhuma movimentação encontrada no histórico."
      : `Nada registrado em ${monthShortLabel(selectedMonth)} para os filtros selecionados.`;

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
        <ThemeToggle />
      </header>

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
              {list.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} showDate={false} />
              ))}
            </div>
          </motion.section>
        ))
      )}
    </div>
  );
}
