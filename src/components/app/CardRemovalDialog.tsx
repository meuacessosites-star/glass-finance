import { Archive, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AppCard, LoanReceivable } from "@/lib/app-store";
import type { Transaction } from "@/lib/mock-data";
import { cardHasHistory } from "@/lib/card-operations";

export function CardRemovalDialog({ card, mode, transactions, receivables, onClose, onArchive, onDelete }: {
  card: AppCard; mode: "archive" | "delete"; transactions: Transaction[]; receivables: LoanReceivable[];
  onClose: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const preserveHistory = mode === "delete" && cardHasHistory(card, transactions, receivables);
  const archive = mode === "archive" || preserveHistory;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-3xl bg-[#f4f8ff] p-0 text-glass-ink">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-glass-ink/10 p-5">
        <div className="min-w-0"><DialogTitle>{preserveHistory ? "Este cartão tem histórico" : archive ? "Arquivar cartão?" : "Excluir cartão?"}</DialogTitle><DialogDescription className="mt-1 break-words text-glass-sub">{card.name} ····{card.last4}</DialogDescription></div>
        <button type="button" aria-label="Fechar confirmação do cartão" onClick={onClose} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/5"><X className="size-5" /></button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        <p className="text-[13px] leading-relaxed text-glass-sub">{preserveHistory
          ? "Há compras, empréstimos ou pagamentos vinculados. Para preservar as faturas e parcelas, arquive o cartão. Você poderá restaurá-lo em Arquivados."
          : archive ? "O cartão sairá da lista principal. Compras, parcelas e pagamentos serão mantidos. Você poderá restaurá-lo em Arquivados."
            : "Este cartão não tem compras ou pagamentos vinculados. A exclusão remove seu cadastro."}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-glass-ink/15 px-3 text-[12px] font-bold">Cancelar</button>
          <button type="button" onClick={archive ? onArchive : onDelete} className={archive ? "flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-bold text-white" : "flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#B42338] px-3 text-[12px] font-bold text-white"}>{archive ? <Archive className="size-4" /> : <Trash2 className="size-4" />}{archive ? "Arquivar cartão" : "Excluir cartão"}</button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
