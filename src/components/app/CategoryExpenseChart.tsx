import { useState } from "react";
import { Check, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type CategoryExpense = {
  categoryId: string;
  name: string;
  value: number;
  color: string;
};

export function CategoryExpenseChart({
  data,
  total,
}: {
  data: CategoryExpense[];
  total: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.find((entry) => entry.categoryId === selectedId);
  const percentage = (value: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0;
  const select = (id: string) =>
    setSelectedId((current) => (current === id ? null : id));

  return (
    <>
      <div
        aria-hidden="true"
        className="relative mt-2 h-52 [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="66%"
              outerRadius="90%"
              paddingAngle={3}
              cornerRadius={6}
              stroke="none"
              rootTabIndex={-1}
              isAnimationActive={false}
              onClick={(_entry, index) => {
                const entry = data[index];
                if (entry) select(entry.categoryId);
              }}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.categoryId}
                  fill={entry.color}
                  opacity={
                    !selected || selected.categoryId === entry.categoryId
                      ? 1
                      : 0.25
                  }
                  className="cursor-pointer outline-none transition-opacity duration-200"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
          <p className="text-[11px] font-medium text-glass-sub">Total gasto</p>
          <p className="amount-tabular whitespace-nowrap text-[18px] font-bold text-glass-ink">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex min-h-[5.5rem] items-center gap-2 rounded-2xl border border-black/5 bg-white/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          {selected ? (
            <>
              <p className="text-[10.5px] font-medium text-glass-faint">
                Categoria selecionada
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-glass-ink">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selected.color }}
                />
                <span className="min-w-0 break-words">{selected.name}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-glass-sub">
                <strong className="amount-tabular whitespace-nowrap font-bold text-glass-ink">
                  {formatCurrency(selected.value)}
                </strong>
                {" · "}
                {percentage(selected.value)}% do total
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-glass-ink">
                {total > 0
                  ? "Escolha uma categoria"
                  : "Nenhuma despesa neste período"}
              </p>
              <p className="mt-1 text-[11.5px] text-glass-sub">
                {total > 0
                  ? "Toque em uma fatia ou em uma categoria da lista."
                  : "Os gastos aparecerão aqui quando forem registrados."}
              </p>
            </>
          )}
        </div>
        {selected && (
          <button
            type="button"
            aria-label="Limpar categoria selecionada"
            onClick={() => setSelectedId(null)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black/5 text-glass-sub focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-white/10"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label="Selecionar categoria de despesa"
        className="mt-3 space-y-1"
      >
        {data.map((entry) => {
          const isSelected = selected?.categoryId === entry.categoryId;
          return (
            <button
              key={entry.categoryId}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${entry.name}, ${formatCurrency(entry.value)}, ${percentage(entry.value)}% do total`}
              onClick={() => select(entry.categoryId)}
              style={{ borderColor: isSelected ? entry.color : "transparent" }}
              className={cn(
                "grid min-h-11 w-full grid-cols-[0.625rem_minmax(0,1fr)_auto_2.25rem_0.875rem] items-center gap-x-2 rounded-xl border px-2 py-2 text-left text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "bg-white/80 shadow-sm dark:bg-white/10"
                  : "hover:bg-white/35 dark:hover:bg-white/5",
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span
                className={cn(
                  "min-w-0 break-words",
                  isSelected ? "font-bold text-glass-ink" : "text-glass-sub",
                )}
              >
                {entry.name}
              </span>
              <span className="amount-tabular whitespace-nowrap text-right font-semibold text-glass-ink">
                {formatCurrency(entry.value)}
              </span>
              <span className="amount-tabular whitespace-nowrap text-right text-glass-faint">
                {percentage(entry.value)}%
              </span>
              <Check
                aria-hidden="true"
                className={cn("size-3.5", !isSelected && "invisible")}
                style={{ color: entry.color }}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}
