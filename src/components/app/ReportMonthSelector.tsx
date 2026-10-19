import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { monthLabel, monthShortLabel } from "@/lib/mock-data";
import { shiftBalanceMonth } from "@/lib/home-balance";
import { normalizeReportMonths } from "@/lib/report-view";
import { cn } from "@/lib/utils";

export function ReportMonthSelector({
  months,
  currentMonth,
  onChange,
}: {
  months: string[];
  currentMonth: string;
  onChange: (months: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const lastMonth = months[months.length - 1] ?? currentMonth;
  const [year, setYear] = useState(Number(lastMonth.slice(0, 4)));
  const [draft, setDraft] = useState<string[]>(months);
  const label =
    months.length > 1
      ? `${months.length} meses selecionados`
      : monthLabel(months[0] ?? currentMonth);
  const toggle = (key: string) =>
    setDraft((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : normalizeReportMonths([...current, key]),
    );

  return (
    <div className="glass rounded-3xl p-3">
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={
            months.length > 1 ? "Voltar os meses selecionados" : "Mês anterior"
          }
          disabled={months[0] <= "0100-01"}
          onClick={() =>
            onChange(months.map((key) => shiftBalanceMonth(key, -1)))
          }
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-glass-sub focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next) {
              setYear(Number(lastMonth.slice(0, 4)));
              setDraft([...months]);
            }
            setOpen(next);
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={`Selecionar meses dos relatórios: ${label}`}
              className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-bold text-glass-ink focus-visible:ring-2 focus-visible:ring-primary"
            >
              <CalendarDays className="size-4 shrink-0 text-primary" />
              <span className="text-center">{label}</span>
              <ChevronDown className="size-3.5 shrink-0 text-glass-sub" />
            </button>
          </DialogTrigger>
          <DialogContent className="glass-strong flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 text-glass-ink">
            <DialogHeader className="shrink-0 px-5 py-4 pr-12 text-left">
              <DialogTitle>Selecionar meses</DialogTitle>
              <DialogDescription>
                Marque um ou mais meses, inclusive de anos diferentes.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Ano anterior"
                  disabled={year <= 100}
                  onClick={() => setYear((value) => value - 1)}
                  className="flex size-11 items-center justify-center rounded-full text-glass-sub disabled:opacity-30"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <p className="text-[17px] font-bold" aria-live="polite">
                  {year}
                </p>
                <button
                  type="button"
                  aria-label="Próximo ano"
                  disabled={year >= 9999}
                  onClick={() => setYear((value) => value + 1)}
                  className="flex size-11 items-center justify-center rounded-full text-glass-sub disabled:opacity-30"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
              <div
                role="group"
                aria-label={`Meses de ${year}`}
                className="grid grid-cols-3 gap-2"
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const key = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
                  const selected = draft.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${monthShortLabel(key)} de ${year}`}
                      onClick={() => toggle(key)}
                      className={cn(
                        "relative min-h-11 rounded-xl border px-2 py-3 text-[12px] font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-black/5 bg-white/50 text-glass-sub dark:border-white/10 dark:bg-white/5",
                      )}
                    >
                      {selected && (
                        <Check
                          aria-hidden="true"
                          className="absolute right-1 top-1 size-3"
                        />
                      )}
                      {monthShortLabel(key)}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <p aria-live="polite" className="font-semibold">
                  {draft.length}{" "}
                  {draft.length === 1
                    ? "mês selecionado"
                    : "meses selecionados"}
                </p>
                <button
                  type="button"
                  disabled={!draft.length}
                  onClick={() => setDraft([])}
                  className="min-h-9 rounded-lg px-2 font-semibold text-primary disabled:opacity-40"
                >
                  Limpar seleção
                </button>
              </div>
              {draft.length > 0 ? (
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Meses marcados para aplicar"
                >
                  {draft.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      aria-label={`Desmarcar ${monthLabel(key)}`}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                    >
                      {monthShortLabel(key)} {key.slice(0, 4)}
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-glass-sub">
                  Selecione pelo menos um mês para aplicar.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2 border-t border-glass-ink/10 px-5 py-4">
              <DialogClose asChild>
                <button
                  type="button"
                  className="min-h-11 rounded-2xl border border-glass-ink/10 px-4 py-3 text-[13px] font-semibold text-glass-sub"
                >
                  Cancelar
                </button>
              </DialogClose>
              <button
                type="button"
                disabled={!draft.length}
                onClick={() => {
                  onChange(normalizeReportMonths(draft));
                  setOpen(false);
                }}
                className="min-h-11 flex-1 rounded-2xl bg-primary px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Aplicar seleção
              </button>
            </div>
          </DialogContent>
        </Dialog>
        <button
          type="button"
          aria-label={
            months.length > 1 ? "Avançar os meses selecionados" : "Próximo mês"
          }
          disabled={lastMonth >= "9999-12"}
          onClick={() =>
            onChange(months.map((key) => shiftBalanceMonth(key, 1)))
          }
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-glass-sub focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      {months.length > 1 && (
        <div
          className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto overscroll-contain"
          role="group"
          aria-label="Meses selecionados"
        >
          {months.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={`Remover ${monthLabel(key)} do relatório`}
              onClick={() => onChange(months.filter((value) => value !== key))}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary"
            >
              {monthShortLabel(key)} {key.slice(0, 4)}
              <X aria-hidden="true" className="size-3" />
            </button>
          ))}
        </div>
      )}
      {(months.length !== 1 || months[0] !== currentMonth) && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => onChange([currentMonth])}
            className="min-h-9 rounded-full bg-primary/10 px-4 py-2 text-[12px] font-semibold text-primary"
          >
            Este mês
          </button>
        </div>
      )}
    </div>
  );
}
