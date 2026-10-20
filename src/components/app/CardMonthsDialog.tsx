import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { monthShortLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const names = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export function CardMonthsDialog({ open, onClose, selectedMonths, referenceMonth, onApply }: {
  open: boolean;
  onClose: () => void;
  selectedMonths: string[];
  referenceMonth: string;
  onApply: (months: string[]) => void;
}) {
  const [year, setYear] = useState(Number(referenceMonth.slice(0, 4)));
  const [draft, setDraft] = useState<string[]>(selectedMonths);
  useEffect(() => {
    if (open) { setDraft([...selectedMonths]); setYear(Number(referenceMonth.slice(0, 4))); }
  }, [open, referenceMonth, selectedMonths]);
  const toggle = (key: string) => setDraft((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key].sort());
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-3xl border-white/70 bg-[#f4f8ff] p-0 text-glass-ink dark:bg-[#0d1b3e] dark:text-white">
      <div className="flex items-start justify-between gap-2 border-b border-glass-ink/10 p-4">
        <div><DialogTitle className="text-[18px] font-bold">Selecionar meses</DialogTitle><DialogDescription className="mt-1 text-[12px] text-glass-sub">Marque um ou mais meses, inclusive de anos diferentes.</DialogDescription></div>
        <button type="button" onClick={onClose} aria-label="Fechar seleção" className="flex size-11 items-center justify-center rounded-full"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        <div className="flex items-center justify-center gap-4">
          <button type="button" aria-label="Ano anterior" onClick={() => setYear((n) => n - 1)} className="flex size-11 items-center justify-center rounded-full hover:bg-primary/10"><ChevronLeft className="size-5" /></button>
          <span className="flex items-center gap-2 text-[14px] font-bold"><CalendarDays className="size-4 text-primary" />{year}</span>
          <button type="button" aria-label="Próximo ano" onClick={() => setYear((n) => n + 1)} className="flex size-11 items-center justify-center rounded-full hover:bg-primary/10"><ChevronRight className="size-5" /></button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">{names.map((name, index) => {
          const key = `${year}-${String(index + 1).padStart(2, "0")}`;
          const active = draft.includes(key);
          return <button key={key} type="button" aria-pressed={active} onClick={() => toggle(key)} className={cn("relative min-h-11 rounded-2xl px-2 text-[12px] font-semibold", active ? "bg-primary text-white" : "bg-white/70 text-glass-ink dark:bg-white/10 dark:text-white")}>{name}{active && <Check className="absolute right-1 top-1 size-3" />}</button>;
        })}</div>
        <div className="mt-4 flex items-center justify-between gap-2"><span className="text-[12px] font-semibold">{draft.length} {draft.length === 1 ? "mês selecionado" : "meses selecionados"}</span><button type="button" onClick={() => setDraft([])} className="min-h-10 text-[12px] font-semibold text-primary">Limpar seleção</button></div>
        <div className="mt-2 flex flex-wrap gap-1.5">{draft.map((key) => <button key={key} type="button" onClick={() => toggle(key)} className="rounded-full bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary">{monthShortLabel(key)} {key.slice(0, 4)} ×</button>)}</div>
      </div>
      <div className="flex gap-2 border-t border-glass-ink/10 p-4"><button type="button" onClick={onClose} className="min-h-11 rounded-full bg-white/60 px-5 text-[12px] font-semibold text-glass-sub dark:bg-white/10">Cancelar</button><button type="button" onClick={() => { onApply(draft); onClose(); }} className="min-h-11 flex-1 rounded-full bg-primary px-4 text-[12px] font-bold text-white">Aplicar seleção</button></div>
    </DialogContent>
  </Dialog>;
}
