import { useMemo } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SidebarTrigger } from "@/components/app/Sidebar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { useAppStore } from "@/lib/app-store";
import {
  budgets,
  currentMonthKey,
  formatCurrency,
  monthShortLabel,
  monthlySeries,
  monthTotals,
} from "@/lib/mock-data";
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
  if (!active || !payload?.length) return null;
  return (
    <div className="glass glass-strong rounded-2xl px-3 py-2 text-[12px]">
      {label && (
        <p className="mb-1 font-bold text-glass-ink">{label}</p>
      )}
      {payload.map((entry) => (
        <p key={String(entry.name)} className="font-semibold" style={{ color: entry.color ?? entry.payload?.fill }}>
          {entry.name}: {formatCurrency(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { categoryById, visibleTransactions } = useAppStore();
  const month = currentMonthKey;
  const { list } = monthTotals(visibleTransactions, month);
  const monthName = monthShortLabel(month);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of list) {
      if (t.amount > 0) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + Math.abs(t.amount));
    }
    return [...map.entries()]
      .map(([categoryId, value]) => ({
        categoryId,
        name: categoryById[categoryId]?.label ?? "Outros",
        value,
        color: categoryById[categoryId]?.color ?? "#8E8E93",
      }))
      .sort((a, b) => b.value - a.value);
  }, [categoryById, list]);

  const totalExpense = byCategory.reduce((s, c) => s + c.value, 0);

  const budgetRows = budgets
    .map((budget) => {
      const used = byCategory.find((c) => c.categoryId === budget.categoryId)?.value ?? 0;
      const pct = Math.min(100, (used / budget.limit) * 100);
      return {
        ...budget,
        label: categoryById[budget.categoryId]?.label ?? "Outros",
        color: categoryById[budget.categoryId]?.color ?? "#8E8E93",
        used,
        pct,
        over: used > budget.limit,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-foreground">
              Relatórios
            </h1>
            <p className="text-[13px] text-muted-foreground">Gráficos e limites de {monthName}</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Donut — despesas por categoria */}
      <section className="glass rounded-3xl p-5">
        <h2 className="text-[15px] font-bold text-glass-ink">Despesas por categoria</h2>
        <div className="relative mt-1 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="value"
                nameKey="name"
                innerRadius="66%"
                outerRadius="92%"
                paddingAngle={3}
                cornerRadius={6}
                stroke="none"
              >
                {byCategory.map((entry) => (
                  <Cell key={entry.categoryId} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<GlassTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[11px] font-medium text-glass-sub">Total gasto</p>
            <p className="amount-tabular text-[18px] font-bold text-glass-ink">
              {formatCurrency(totalExpense)}
            </p>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {byCategory.map((entry) => (
            <div key={entry.categoryId} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="flex-1 text-glass-sub">{entry.name}</span>
              <span className="font-semibold text-glass-ink">{formatCurrency(entry.value)}</span>
              <span className="w-9 text-right text-glass-faint">
                {Math.round((entry.value / totalExpense) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Bar — receitas x despesas */}
      <section className="glass rounded-3xl p-5">
        <h2 className="text-[15px] font-bold text-glass-ink">Últimos 6 meses</h2>
        <p className="text-[12px] text-glass-sub">Receitas × despesas</p>
        <div className="mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlySeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={4}>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--glass-faint)", fontWeight: 600 }}
                dy={6}
              />
              <YAxis hide domain={[0, 9000]} />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="income" name="Receitas" fill="#1FBF4F" radius={[6, 6, 6, 6]} maxBarSize={14} />
              <Bar dataKey="expense" name="Despesas" fill="#FF6482" radius={[6, 6, 6, 6]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
            Limites por categoria
          </h2>
          <span className="text-[12px] font-semibold text-muted-foreground">
            {monthName} de 2026
          </span>
        </div>
        <div className="space-y-3">
          {budgetRows.map((row) => (
            <div key={row.categoryId} className="glass rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-8 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                    style={{ backgroundColor: row.color }}
                  >
                    {row.label.slice(0, 2).toUpperCase()}
                  </span>
                  <p className="text-[14px] font-semibold text-glass-ink">{row.label}</p>
                </div>
                <p className={cn("amount-tabular text-[13px] font-bold", row.over ? "text-[#FF3B30]" : "text-glass-ink")}>
                  {formatCurrency(row.used)}
                  <span className="font-medium text-glass-faint"> / {formatCurrency(row.limit)}</span>
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-black/25">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    row.over
                      ? "bg-gradient-to-r from-[#FF9500] to-[#FF3B30]"
                      : "bg-gradient-to-r from-[#5b9dff] to-[#2f6bff]",
                  )}
                  style={{ width: `${Math.max(3, row.pct)}%` }}
                />
              </div>
              <p className={cn("mt-1.5 text-[11.5px]", row.over ? "font-semibold text-[#FF3B30]" : "text-glass-faint")}>
                {row.over
                  ? `Limite estourado em ${formatCurrency(row.used - row.limit)}`
                  : `${Math.round(row.pct)}% do limite usado`}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
