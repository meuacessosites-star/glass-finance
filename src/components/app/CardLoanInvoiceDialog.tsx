import { useState } from "react";
import { useAppStore, type LoanReceivable } from "@/lib/app-store";
import { linkCardLoanInvoice as previewInvoiceLink } from "@/lib/card-loans";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardLoanBillingFields } from "./CardLoanBillingFields";

export function CardLoanInvoiceDialog({
  item,
  purchaseDate: originalDate,
  today,
  onClose,
  onSaved,
}: {
  item: LoanReceivable;
  purchaseDate: string;
  today: string;
  onClose: () => void;
  onSaved: (item: LoanReceivable) => void;
}) {
  const { cards, activeProfile, linkCardLoanInvoice } = useAppStore();
  const [cardId, setCardId] = useState(item.cardId ?? "");
  const [date, setDate] = useState(originalDate);
  const [invoiceMonth, setInvoiceMonth] = useState<string | undefined>();
  const installments = Math.max(
    1,
    ...(activeProfile?.data.loanReceivables ?? [])
      .filter(
        (row) => row.loanId === item.loanId && row.operationType === "card",
      )
      .map((row) => Math.max(row.installment ?? 1, row.installments ?? 1)),
  );
  const linkedData = activeProfile
    ? previewInvoiceLink(
        activeProfile.data,
        item.id,
        cardId,
        date,
        invoiceMonth,
      )
    : undefined;
  const linkedItem =
    linkedData && linkedData !== activeProfile?.data
      ? linkedData.loanReceivables.find((row) => row.id === item.id)
      : undefined;
  const canSave = Boolean(linkedItem) && date <= today;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="glass-strong max-h-[85dvh] overflow-y-auto rounded-3xl p-5 text-glass-ink">
        <DialogHeader className="pr-5 text-left">
          <DialogTitle>Definir cartão e fatura</DialogTitle>
          <DialogDescription>
            Escolha o cartão da compra de {item.contact}. Todas as parcelas
            desta compra seguirão a fatura. Os valores e recebimentos
            registrados serão preservados.
          </DialogDescription>
        </DialogHeader>
        <label className="text-[12px] font-semibold text-glass-sub">
          Data da compra
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => {
              setDate(event.target.value);
              setInvoiceMonth(undefined);
            }}
            className="glass glass-soft mt-2 min-h-12 w-full rounded-xl px-3 text-[13px] text-glass-ink"
          />
        </label>
        <CardLoanBillingFields
          cards={cards}
          cardId={cardId}
          purchaseDate={date}
          invoiceMonth={invoiceMonth}
          installments={installments}
          onCardChange={(id) => {
            setCardId(id);
            setInvoiceMonth(undefined);
          }}
          onInvoiceChange={setInvoiceMonth}
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!canSave || !linkedItem) return;
            linkCardLoanInvoice(item.id, cardId, date, invoiceMonth);
            onSaved(linkedItem);
          }}
          className="min-h-11 rounded-xl bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Salvar cartão e fatura
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 text-[13px] font-semibold text-glass-sub"
        >
          Cancelar
        </button>
      </DialogContent>
    </Dialog>
  );
}
