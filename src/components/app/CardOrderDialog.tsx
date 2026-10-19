import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getInvoiceHeaderAppearances } from "@/lib/card-header-appearance";
import type { AppCard } from "@/lib/app-store";

export function CardOrderDialog({ cards, onClose, onSave }: { cards: AppCard[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [ids, setIds] = useState(() => cards.filter((card) => !card.archived).map((card) => card.id));
  const [announcement, setAnnouncement] = useState("");
  const headerAppearances = useMemo(() => getInvoiceHeaderAppearances(cards), [cards]);
  const active = cards.filter((card) => !card.archived);
  const byId = new Map(active.map((card) => [card.id, card]));
  const ordered = [...ids.filter((id) => byId.has(id)), ...active.filter((card) => !ids.includes(card.id)).map((card) => card.id)];
  const move = (index: number, offset: number) => {
    const next = [...ordered];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIds(next);
    setAnnouncement(`${byId.get(ordered[index])?.name} na posição ${target + 1} de ${next.length}`);
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-0 overflow-hidden rounded-3xl border-glass-ink/10 bg-[#f4f8ff] p-0 text-glass-ink">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-glass-ink/10 p-5">
        <div><DialogTitle>Ordenar cartões</DialogTitle><DialogDescription className="mt-1 text-[12px] text-glass-sub">Use as setas para escolher a posição. A ordem também será usada na aba Cartões.</DialogDescription></div>
        <button type="button" aria-label="Fechar organização dos cartões" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/60 text-glass-sub"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-4">
        <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
        {ordered.map((id, index) => {
          const card = byId.get(id)!;
          return <div key={id} className="flex items-center gap-2 rounded-2xl border border-glass-ink/10 bg-white/60 p-2.5">
            <span className="w-4 shrink-0 text-center text-[11px] font-semibold text-glass-sub">{index + 1}</span>
            <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: headerAppearances[card.id].background }} />
            <div className="min-w-0 flex-1"><p className="text-[13px] font-bold [overflow-wrap:anywhere]">{card.name}</p><p className="text-[11px] text-glass-sub">{card.institution || "Cartão"} ····{card.last4}</p></div>
            <button type="button" aria-label={`Subir ${card.name}`} disabled={index === 0} onClick={() => move(index, -1)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary disabled:bg-transparent disabled:text-glass-faint disabled:opacity-35"><ArrowUp className="size-4" /></button>
            <button type="button" aria-label={`Descer ${card.name}`} disabled={index === ordered.length - 1} onClick={() => move(index, 1)} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary disabled:bg-transparent disabled:text-glass-faint disabled:opacity-35"><ArrowDown className="size-4" /></button>
          </div>;
        })}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-glass-ink/10 p-4">
        <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-glass-ink/15 text-[13px] font-semibold text-glass-sub">Cancelar</button>
        <button type="button" onClick={() => onSave(ordered)} className="min-h-11 rounded-full bg-primary text-[13px] font-bold text-white">Salvar ordem</button>
      </div>
    </DialogContent>
  </Dialog>;
}
