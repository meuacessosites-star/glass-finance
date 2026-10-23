import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { getHomeBalance, HomeBalanceMode } from "@/lib/home-balance";
import { formatCurrency, monthLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";



export function HomeBalanceSettings({
  open,
  onOpenChange,
  mode,
  onModeChange,
  calculation,
  selectedMonth,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: HomeBalanceMode;
  onModeChange: (mode: HomeBalanceMode) => void;
  calculation: ReturnType<typeof getHomeBalance>;
  selectedMonth: string;
}) {
  const formatCurrency = usePrivateCurrency();
  const signed = (value: number) =>
  `${value < 0 ? "−" : ""}${formatCurrency(value)}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[85dvh] overflow-y-auto rounded-3xl p-5 text-glass-ink">
        <DialogHeader className="pr-5 text-left">
          <DialogTitle>Como mostrar o saldo</DialogTitle>
          <DialogDescription>
            Escolha o cálculo para {monthLabel(selectedMonth)}. Usamos apenas as
            receitas e despesas de Transações.
          </DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label="Como calcular o saldo"
          className="space-y-2"
        >
          {(
            [
              {
                id: "monthly",
                label: "Somente o mês",
                description: "Receitas menos despesas do mês escolhido.",
              },
              {
                id: "accumulated",
                label: "Acumulado",
                description:
                  "Soma os resultados positivos e negativos desde o primeiro mês registrado até o mês escolhido.",
              },
            ] as const
          ).map(({ id, label, description }) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => onModeChange(id)}
              className={cn(
                "flex w-full gap-3 rounded-2xl border px-3 py-3 text-left",
                mode === id
                  ? "border-primary/40 bg-primary/10"
                  : "border-black/10 bg-white/40 dark:bg-white/5",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  mode === id
                    ? "border-primary bg-primary text-white"
                    : "border-black/20",
                )}
              >
                {mode === id && <Check className="size-3.5" />}
              </span>
              <span>
                <span className="block text-[13px] font-semibold">{label}</span>
                <span className="mt-1 block text-[12px] leading-relaxed text-glass-sub">
                  {description}
                </span>
              </span>
            </button>
          ))}
        </div>
        {mode === "accumulated" ? (
          <section
            className="space-y-3"
            aria-label="Cálculo do saldo acumulado"
          >
            <div className="rounded-2xl bg-primary/5 p-3 text-[12px] text-glass-sub">
              <h3 className="font-semibold text-glass-ink">
                Detalhes do acumulado
              </h3>
              {calculation.firstMonth ? (
                <p className="mt-1">
                  De {monthLabel(calculation.firstMonth)} até{" "}
                  {monthLabel(selectedMonth)}.
                </p>
              ) : (
                <p className="mt-1">
                  Nenhuma transação registrada até este mês.
                </p>
              )}
              <div className="mt-3 space-y-1.5">
                <p className="flex flex-wrap justify-between gap-2">
                  <span>Todas as receitas</span>
                  <strong className="amount-tabular text-[#148d48]">
                    +{formatCurrency(calculation.totalIncome)}
                  </strong>
                </p>
                <p className="flex flex-wrap justify-between gap-2">
                  <span>Todas as despesas</span>
                  <strong className="amount-tabular text-[#be252c]">
                    −{formatCurrency(calculation.totalExpense)}
                  </strong>
                </p>
                <p className="flex flex-wrap justify-between gap-2 border-t border-black/10 pt-2 font-semibold text-glass-ink">
                  <span>Saldo acumulado</span>
                  <span className="amount-tabular">
                    {signed(calculation.balance)}
                  </span>
                </p>
              </div>
            </div>
            <p className="text-[12px] text-glass-sub">
              Toque em um mês para ver os cálculos. Meses sem movimento mantêm o
              saldo anterior.
            </p>
            <ol className="space-y-2">
              {calculation.months.map((part) => (
                <li key={part.month}>
                  <details className="rounded-2xl border border-black/10 bg-white/50 p-3 dark:border-white/10 dark:bg-white/5">
                    <summary className="cursor-pointer text-[12px] font-semibold">
                      {monthLabel(part.month)}
                      <span className="amount-tabular mt-1 block font-medium text-glass-sub">
                        Resultado {signed(part.result)} · Acumulado{" "}
                        {signed(part.closing)}
                      </span>
                    </summary>
                    <div className="mt-3">
                      <dl className="mt-3 space-y-2 border-t border-black/10 pt-3 text-[12px] text-glass-sub">
                        <div className="flex flex-wrap justify-between gap-1">
                          <dt>Saldo vindo dos meses anteriores</dt>
                          <dd className="amount-tabular">
                            {signed(part.opening)}
                          </dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-1">
                          <dt>Receitas do mês</dt>
                          <dd className="amount-tabular text-[#148d48]">
                            +{formatCurrency(part.income)}
                          </dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-1">
                          <dt>Despesas do mês</dt>
                          <dd className="amount-tabular text-[#be252c]">
                            −{formatCurrency(part.expense)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-glass-ink">
                            Resultado do mês
                          </dt>
                          <dd className="amount-tabular mt-1 break-words">
                            {formatCurrency(part.income)} −{" "}
                            {formatCurrency(part.expense)} ={" "}
                            {signed(part.result)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-glass-ink">
                            Saldo acumulado até este mês
                          </dt>
                          <dd className="amount-tabular mt-1 break-words">
                            ({signed(part.opening)}) + ({signed(part.result)}) ={" "}
                            {signed(part.closing)}
                          </dd>
                        </div>
                      </dl>
                      {!part.transactionCount && (
                        <p className="mt-2 text-[12px] text-glass-sub">
                          Sem receitas ou despesas neste mês.
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <p className="rounded-2xl bg-primary/5 p-3 text-[13px] text-glass-sub">
            {formatCurrency(calculation.income)} −{" "}
            {formatCurrency(calculation.expense)} ={" "}
            <strong className="amount-tabular text-glass-ink">
              {signed(calculation.monthBalance)}
            </strong>
          </p>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="min-h-11 rounded-xl bg-primary px-4 text-[13px] font-semibold text-white"
        >
          Concluir
        </button>
      </DialogContent>
    </Dialog>
  );
}
