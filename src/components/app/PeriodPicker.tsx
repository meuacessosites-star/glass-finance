import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { monthKey, monthShortLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useExclusiveOverlay } from "@/lib/overlay-manager";

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

export function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export type PeriodMode = "current" | "month" | "custom";

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

export function MonthMultiPicker({
  monthOptions,
  selectedMonths,
  onSelectedMonthsChange,
}: MonthMultiPickerProps) {
  const label =
    selectedMonths.length === 0
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
            "flex h-11 min-h-11 min-w-[7rem] flex-none shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-semibold transition-all lg:min-w-[7.25rem] lg:text-[13px]",
            selectedMonths.length > 0
              ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
              : "glass text-glass-sub",
          )}
        >
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-64">
        <DropdownMenuItem
          disabled={selectedMonths.length === 0}
          onSelect={() => onSelectedMonthsChange([])}
        >
          <X className="size-4" />
          Remover filtro
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

export function PeriodPicker({
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
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const periodOverlay = useExclusiveOverlay({
    name: "period-picker",
    open,
    onOpenChange: setOpen,
  });
  const calendarDays = calendarDaysForMonth(calendarMonth);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pickerWidth = Math.min(304, window.innerWidth - 32);
      const pickerHeight = Math.min(440, window.innerHeight - 32);
      const preferredTop = rect.bottom + 8;
      const top =
        preferredTop + pickerHeight <= window.innerHeight - 16
          ? preferredTop
          : Math.max(16, rect.top - pickerHeight - 8);
      setPopoverPosition({
        top,
        left: Math.max(
          16,
          Math.min(
            window.innerWidth - pickerWidth - 16,
            rect.right - pickerWidth,
          ),
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

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        calendarRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const openCustomCalendar = () => {
    setDraftStart(rangeStart);
    setDraftEnd(rangeEnd);
    setCalendarMonth(rangeStart ? monthKey(rangeStart) : selectedMonth);
    onModeChange("custom");
    periodOverlay.requestOpen();
  };

  const handlePick = (date: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }
    const [start, end] =
      date < draftStart ? [date, draftStart] : [draftStart, date];
    setDraftStart(start);
    setDraftEnd(end);
  };

  const handleApply = () => {
    if (!draftStart) return;
    const appliedEnd = draftEnd ?? draftStart;
    onRangeChange(draftStart, appliedEnd);
    onModeChange("custom");
    setOpen(false);
  };

  return (
    <div className="flex flex-none shrink-0 items-center gap-2 whitespace-nowrap">
      <button
        type="button"
        aria-label="Selecionar este mês"
        onClick={() => {
          onModeChange("current");
          onRangeChange(null, null);
          periodOverlay.setOpen(false);
        }}
        className={cn(
          "flex h-11 min-h-11 min-w-[7rem] flex-none items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-semibold transition-all lg:min-w-[7.25rem] lg:text-[13px]",
          mode === "current"
            ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
            : "glass text-glass-sub",
        )}
      >
        <span className="whitespace-nowrap">Este mês</span>
      </button>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Selecionar período personalizado"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            periodOverlay.setOpen(false);
          } else {
            openCustomCalendar();
          }
        }}
        className={cn(
          "flex h-11 min-h-11 min-w-[9.25rem] flex-none items-center justify-center whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-semibold transition-all lg:min-w-[9.5rem] lg:text-[13px]",
          mode === "custom"
            ? "bg-primary text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)]"
            : "glass text-glass-sub",
        )}
      >
        <span className="whitespace-nowrap">Personalizado</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/10"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={calendarRef}
              role="dialog"
              aria-modal="true"
              aria-label="Selecionar período personalizado"
              style={{
                top: popoverPosition?.top ?? 16,
                left: popoverPosition?.left ?? 16,
              }}
              className="absolute max-h-[calc(100dvh-2rem)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-glass-ink/10 bg-[#f4f8ff] p-3 pt-10 text-glass-ink shadow-[0_18px_45px_-18px_rgba(15,40,90,0.55)] dark:border-white/10 dark:bg-[#0d1b3e] dark:text-white"
            >
              <button
                type="button"
                aria-label="Fechar calendário"
                onClick={() => setOpen(false)}
                className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
              >
                <X className="size-3.5" />
              </button>
              {mode === "custom" && (
                <>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label="Mês anterior do período personalizado"
                      onClick={() =>
                        setCalendarMonth((current) => shiftMonth(current, -1))
                      }
                      className="flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
                    >
                      <ChevronLeft className="size-4 lg:size-5" />
                    </button>
                    <p className="text-[12px] font-bold uppercase tracking-wide lg:text-[14px]">
                      {monthShortLabel(calendarMonth)}{" "}
                      {calendarMonth.slice(0, 4)}
                    </p>
                    <button
                      type="button"
                      aria-label="Próximo mês do período personalizado"
                      onClick={() =>
                        setCalendarMonth((current) => shiftMonth(current, 1))
                      }
                      className="flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-primary active:scale-95"
                    >
                      <ChevronRight className="size-4 lg:size-5" />
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[10px] font-medium text-glass-faint lg:text-[12px]">
                    Escolha um dia ou selecione duas datas para um intervalo.
                  </p>
                  <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-glass-faint lg:text-[11px]">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                      <span key={`${day}-${index}`}>{day}</span>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {calendarDays.map((date, index) => {
                      if (!date) return <span key={`empty-${index}`} />;
                      const selected = date === draftStart || date === draftEnd;
                      const inRange = Boolean(
                        draftStart &&
                        draftEnd &&
                        date > draftStart &&
                        date < draftEnd,
                      );
                      return (
                        <button
                          key={date}
                          type="button"
                          aria-label={formatDateLabel(date)}
                          aria-pressed={selected}
                          onClick={() => handlePick(date)}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-full text-[11px] font-semibold transition-colors lg:text-[13px]",
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
                  <div className="mt-3 flex flex-col gap-2 border-t border-glass-ink/5 pt-2 dark:border-white/10">
                    <p className="text-[10px] font-medium text-glass-faint lg:text-[12px]">
                      {draftStart && draftEnd
                        ? draftStart === draftEnd
                          ? `Dia selecionado: ${formatDateLabel(draftStart)}`
                          : `${formatDateLabel(draftStart)} → ${formatDateLabel(draftEnd)}`
                        : draftStart
                          ? `Dia selecionado: ${formatDateLabel(draftStart)}`
                          : "Selecione um dia ou intervalo"}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      {(rangeStart || rangeEnd) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftStart(null);
                            setDraftEnd(null);
                            onRangeChange(null, null);
                          }}
                          className="min-h-11 rounded-full px-3 py-2 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
                        >
                          Remover filtro
                        </button>
                      )}
                      {draftStart && (
                        <button
                          type="button"
                          onClick={handleApply}
                          className="min-h-11 rounded-full bg-primary px-4 py-2 text-[11px] font-bold text-white shadow-[0_6px_18px_-6px_rgba(47,107,255,0.6)] transition-all hover:brightness-105 active:scale-95"
                        >
                          Aplicar
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
