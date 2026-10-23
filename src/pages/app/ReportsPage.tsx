import { PrivateChart } from "@/components/app/BalancePrivacy";
import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { BalancePrivacyToggle } from "@/components/app/BalancePrivacy";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CategoryExpenseChart } from "@/components/app/CategoryExpenseChart";
import { ReportMonthSelector } from "@/components/app/ReportMonthSelector";
import { ReportCategoryDetails } from "@/components/app/ReportCategoryDetails";
import { useLocalDate } from "@/hooks/use-local-date";
import {
  getReportCategoryDetails,
  getReportView,
  normalizeReportMonths,
} from "@/lib/report-view";
import { normalizeSearchText } from "@/lib/transaction-view";
import {
  getCategoryHistoryReference,
  getCategoryMonthlyLimit,
} from "@/lib/report-budgets";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useAppStore } from "@/lib/app-store";
import { budgets, formatCurrency, monthLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type GlassTooltipEntry = {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
};

type GlassTooltipProps = {
  active?: boolean;
  payload?: GlassTooltipEntry[];
  label?: string | number;
};

function GlassTooltip({ active, payload, label }: GlassTooltipProps) {
  const formatCurrency = usePrivateCurrency();
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong rounded-2xl px-3 py-2 text-[12px]">
      {label && <p className="mb-1 font-bold text-glass-ink">{label}</p>}
      {payload.map((entry) => (
        <p
          key={String(entry.name)}
          className="font-semibold"
          style={{ color: entry.color ?? entry.payload?.fill }}
        >
          {entry.name}: {formatCurrency(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const formatCurrency = usePrivateCurrency();
  const {
    categoryById,
    visibleTransactions,
    activeProfileId,
    categoryLimits,
    setCategoryLimit,
  } = useAppStore();
  const today = useLocalDate();
  const currentMonth = today.slice(0, 7);
  const [chosenMonths, setChosenMonths] = useState<string[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailCategoryId, setDetailCategoryId] = useState<string | null>(null);
  const months = useMemo(
    () => chosenMonths ?? [currentMonth],
    [chosenMonths, currentMonth],
  );
  const multipleMonths = months.length > 1;
  const periodLabel = multipleMonths
    ? `${months.length} meses selecionados`
    : monthLabel(months[0]);
  const normalizedQuery = normalizeSearchText(searchQuery.trim());
  const report = useMemo(
    () => getReportView(visibleTransactions, categoryById, months, searchQuery),
    [visibleTransactions, categoryById, months, searchQuery],
  );
  const { byCategory, totalExpense } = report;
  useEffect(() => {
    setDetailCategoryId(null);
  }, [activeProfileId, months, normalizedQuery]);

  const budgetRows = [
    ...new Set([
      ...budgets.map((budget) => budget.categoryId),
      ...Object.keys(categoryLimits),
      ...visibleTransactions
        .filter((row) => row.amount < 0)
        .map((row) => row.categoryId),
    ]),
  ]
    .map((categoryId) => {
      const monthlyLimit = getCategoryMonthlyLimit(categoryId, categoryLimits);
      const details = getReportCategoryDetails(
        report,
        categoryId,
        monthlyLimit,
      );
      const history = getCategoryHistoryReference(
        visibleTransactions,
        categoryId,
        months,
        currentMonth,
      );
      const { used, limit } = details;
      const pct = Math.min(100, details.percentage);
      return {
        categoryId,
        limit,
        details,
        history,
        label: categoryById[categoryId]?.label ?? "Outros",
        color: categoryById[categoryId]?.color ?? "#8E8E93",
        used,
        pct,
        over: details.hasLimit && used > limit,
      };
    })
    .filter(
      (row) =>
        !normalizedQuery ||
        report.matchedCategoryIds.includes(row.categoryId) ||
        normalizeSearchText(row.label).includes(normalizedQuery),
    )
    .sort((a, b) => b.used - a.used);
  const detailCategory = budgetRows.find(
    (row) => row.categoryId === detailCategoryId,
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] sm:pt-0">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-foreground">
              Relatórios
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Gráficos e limites · {periodLabel}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5"><BalancePrivacyToggle /><ThemeToggle /></div>
      </header>

      <ReportMonthSelector
        months={months}
        currentMonth={currentMonth}
        onChange={(next) => {
          const selected = normalizeReportMonths(next);
          if (selected.length)
            setChosenMonths(
              selected.length === 1 && selected[0] === currentMonth
                ? null
                : selected,
            );
        }}
      />
      <div className="glass grid min-h-11 min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2xl px-3">
        <Search className="size-4 text-glass-faint" />
        <input
          type="search"
          enterKeyHint="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar categorias e transações..."
          aria-label="Buscar categorias, transações e observações nos relatórios"
          className="h-11 w-full min-w-0 bg-transparent text-[16px] text-glass-ink outline-none placeholder:text-glass-faint sm:text-[15px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:appearance-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Limpar busca dos relatórios"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-glass-faint focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {normalizedQuery && (
        <p role="status" className="px-1 text-[12px] text-glass-sub">
          {report.list.length}{" "}
          {report.list.length === 1
            ? "movimentação encontrada"
            : "movimentações encontradas"}{" "}
          em {periodLabel}. A busca está aplicada aos gráficos e limites.
        </p>
      )}

      {/* Donut — despesas por categoria */}
      <section className="glass rounded-3xl p-5">
        <h2 className="text-[15px] font-bold text-glass-ink">
          Despesas por categoria
        </h2>
        <CategoryExpenseChart
          key={`${activeProfileId}-${months.join(",")}-${normalizedQuery}`}
          data={byCategory}
          total={totalExpense}
        />
      </section>

      {/* Bar — receitas x despesas */}
      <section className="glass rounded-3xl p-5">
        <h2 className="text-[15px] font-bold text-glass-ink">
          {multipleMonths ? "Comparação dos meses" : "Últimos 6 meses"}
        </h2>
        <p className="text-[12px] text-glass-sub">
          {multipleMonths
            ? "Receitas × despesas dos meses selecionados"
            : `Receitas × despesas até ${periodLabel}`}
        </p>
        <div className="mt-3 overflow-x-auto overscroll-x-contain pb-1">
          <div
            className="h-44"
            style={{
              minWidth:
                report.series.length > 6
                  ? report.series.length * 52
                  : undefined,
            }}
          >
            <PrivateChart><ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={report.series}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
                barGap={4}
              >
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 11,
                    fill: "var(--glass-faint)",
                    fontWeight: 600,
                  }}
                  dy={6}
                  interval={0}
                />
                <YAxis hide domain={[0, "auto"]} />
                <Tooltip
                  content={<GlassTooltip />}
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                />
                <Bar
                  dataKey="income"
                  name="Receitas"
                  fill="#1FBF4F"
                  radius={[6, 6, 6, 6]}
                  maxBarSize={14}
                />
                <Bar
                  dataKey="expense"
                  name="Despesas"
                  fill="#FF6482"
                  radius={[6, 6, 6, 6]}
                  maxBarSize={14}
                />
              </BarChart>
            </ResponsiveContainer></PrivateChart>
          </div>
        </div>
        {report.series.length > 6 && (
          <p className="mt-1 text-center text-[11px] text-glass-faint">
            Deslize para ver todos os meses.
          </p>
        )}
        <div className="mt-1 flex items-center justify-center gap-4 text-[12px] text-glass-sub">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#1FBF4F]" /> Receitas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF6482]" /> Despesas
          </span>
        </div>
      </section>

      {/* Limites por categoria */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">
            Gastos e limites por categoria
          </h2>
          <span className="text-[12px] font-semibold text-muted-foreground">
            {multipleMonths ? `${months.length} meses` : periodLabel}
          </span>
        </div>
        <p className="mb-3 px-1 text-[12px] text-glass-sub">
          Toque em uma categoria para ver os gastos e editar ou retirar o
          limite.
        </p>
        {multipleMonths && budgetRows.some((row) => row.details.hasLimit) && (
          <p className="mb-3 px-1 text-[12px] text-glass-sub">
            Limites mensais somados para os {months.length} meses escolhidos.
          </p>
        )}
        <div className="space-y-3">
          {!budgetRows.length && (
            <p className="glass rounded-2xl p-4 text-[12px] text-glass-sub">
              Nenhuma categoria encontrada para esta busca.
            </p>
          )}
          {budgetRows.map((row) => (
            <button
              key={row.categoryId}
              id={`report-category-${row.categoryId}`}
              type="button"
              aria-haspopup="dialog"
              aria-label={`Ver gastos de ${row.label}, ${formatCurrency(row.used)} em ${periodLabel}`}
              onClick={() => setDetailCategoryId(row.categoryId)}
              className="glass block w-full rounded-3xl p-4 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                    style={{ backgroundColor: row.color }}
                  >
                    {row.label.slice(0, 2).toUpperCase()}
                  </span>
                  <p className="min-w-0 break-words text-[14px] font-semibold text-glass-ink">
                    {row.label}
                  </p>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-glass-faint"
                  />
                </div>
                <p
                  className={cn(
                    "amount-tabular shrink-0 text-right text-[13px] font-bold",
                    row.over ? "text-[#FF3B30]" : "text-glass-ink",
                  )}
                >
                  {formatCurrency(row.used)}
                  {row.details.hasLimit && (
                    <span className="font-medium text-glass-faint">
                      {" "}
                      / {formatCurrency(row.limit)}
                    </span>
                  )}
                </p>
              </div>
              {row.details.hasLimit ? (
                <>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-black/25">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        row.over
                          ? "bg-gradient-to-r from-[#FF9500] to-[#FF3B30]"
                          : "bg-gradient-to-r from-[#5b9dff] to-[#2f6bff]",
                      )}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-[11.5px]",
                      row.over
                        ? "font-semibold text-[#FF3B30]"
                        : "text-glass-faint",
                    )}
                  >
                    {row.over
                      ? `Limite estourado em ${formatCurrency(row.used - row.limit)}`
                      : `${Math.round(row.pct)}% do limite usado`}
                  </p>
                </>
              ) : (
                <div className="mt-2 space-y-1 text-[11.5px] text-glass-sub">
                  <p className="font-semibold">Sem limite definido</p>
                  <p>
                    {row.history.months.length
                      ? `Média anterior: ${formatCurrency(row.history.monthlyAverage)} por mês`
                      : "A referência aparecerá quando houver meses anteriores com gastos."}
                  </p>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>
      {detailCategory && (
        <ReportCategoryDetails
          key={detailCategory.categoryId}
          category={{
            label: detailCategory.label,
            color: detailCategory.color,
          }}
          details={detailCategory.details}
          history={detailCategory.history}
          onLimitSave={(amount) =>
            setCategoryLimit(detailCategory.categoryId, amount)
          }
          periodLabel={periodLabel}
          searchQuery={searchQuery}
          triggerId={`report-category-${detailCategory.categoryId}`}
          onClose={() => setDetailCategoryId(null)}
        />
      )}
    </div>
  );
}
