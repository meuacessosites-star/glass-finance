import { useRef, useState, type FormEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { useAppStore, type LoanReceivable } from "@/lib/app-store";
import { compressAttachmentFile } from "@/lib/attachment-utils";
import { localDateKey } from "@/lib/card-billing";
import { isFreeLoan } from "@/lib/loan-repayments";
import {
  validateLoanRecordEdit,
  type LoanRecordEdit,
} from "@/lib/loan-record-actions";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fieldClass =
  "glass glass-soft mt-1.5 min-h-11 w-full rounded-xl px-3 py-2 text-[14px] font-medium text-glass-ink outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60";

export function LoanEditDialog({
  item,
  purchaseDate,
  onClose,
  onSaved,
}: {
  item: LoanReceivable;
  purchaseDate?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { loanReceivables, updateLoanRecord } = useAppStore();
  const [contact, setContact] = useState(item.contact);
  const [description, setDescription] = useState(item.description ?? "");
  const [amountCents, setAmountCents] = useState(Math.round(item.amount * 100));
  const [date, setDate] = useState(purchaseDate ?? item.startDate ?? "");
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [method, setMethod] = useState(item.paymentMethod ?? "pix");
  const [note, setNote] = useState(item.note ?? "");
  const [display, setDisplay] = useState(item.draftDisplay ?? "hidden");
  const [attachments, setAttachments] = useState(item.attachments ?? []);
  const [freeMode, setFreeMode] = useState(item.freePaymentMode ?? "flexible");
  const [suggestedCents, setSuggestedCents] = useState(
    Math.round((item.suggestedPaymentAmount ?? 0) * 100),
  );
  const [addingFiles, setAddingFiles] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const free = isFreeLoan(item);
  const isCard = item.operationType === "card";
  const patch: LoanRecordEdit = {};
  if (contact !== item.contact) patch.contact = contact;
  if (description !== (item.description ?? "")) patch.description = description;
  if (amountCents !== Math.round(item.amount * 100))
    patch.amount = amountCents / 100;
  if (!isCard && date !== (purchaseDate ?? item.startDate ?? ""))
    patch.startDate = date;
  if (!isCard && !free && dueDate !== (item.dueDate ?? ""))
    patch.dueDate = dueDate;
  if (!isCard && method !== (item.paymentMethod ?? "pix"))
    patch.paymentMethod = method;
  if (note !== (item.note ?? "")) patch.note = note;
  if (display !== (item.draftDisplay ?? "hidden")) patch.draftDisplay = display;
  if (JSON.stringify(attachments) !== JSON.stringify(item.attachments ?? []))
    patch.attachments = attachments;
  if (free && freeMode !== (item.freePaymentMode ?? "flexible"))
    patch.freePaymentMode = freeMode;
  if (
    free &&
    freeMode === "installments" &&
    suggestedCents !== Math.round((item.suggestedPaymentAmount ?? 0) * 100)
  )
    patch.suggestedPaymentAmount = suggestedCents / 100;
  const error = validateLoanRecordEdit({ loanReceivables }, item.id, patch);
  const changed = Object.keys(patch).length > 0;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (error || !changed || addingFiles) return;
    updateLoanRecord(item.id, patch);
    toast.success("Alterações salvas");
    if (onSaved) onSaved(); else onClose();
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAddingFiles(true);
    try {
      const added = await Promise.all(
        Array.from(files)
          .slice(0, Math.max(0, 6 - attachments.length))
          .map(compressAttachmentFile),
      );
      setAttachments((current) => [...current, ...added].slice(0, 6));
    } catch {
      toast.error("Não foi possível adicionar o anexo");
    } finally {
      setAddingFiles(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-loan-edit-dialog
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(`loan-details-${item.id}`)?.focus();
        }}
        className="glass-strong flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-3xl bg-white p-0 text-glass-ink dark:bg-[#f4f8ff]"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-black/5 px-5 py-4">
          <DialogHeader className="text-left">
            <DialogTitle>Editar registro</DialogTitle>
            <DialogDescription>
              {isCard ? "Cartão emprestado" : "Empréstimo"} · {item.contact}
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Fechar edição"
              className="glass flex size-10 shrink-0 items-center justify-center rounded-full text-glass-sub"
            >
              <X className="size-[18px]" />
            </button>
          </DialogClose>
        </div>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
            <p className="text-[12px] leading-relaxed text-glass-sub">
              Os dados gerais valem para{" "}
              {isCard ? "toda a compra" : "todo o empréstimo"}. O valor e o
              vencimento alteram apenas esta parcela.
            </p>
            <label className="block text-[12px] font-semibold text-glass-sub">
              Pessoa
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                maxLength={80}
                className={fieldClass}
                required
              />
            </label>
            <label className="block text-[12px] font-semibold text-glass-sub">
              Descrição
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={120}
                className={fieldClass}
              />
            </label>
            <label className="block text-[12px] font-semibold text-glass-sub">
              {free || (item.installments ?? 1) === 1
                ? "Valor do registro"
                : `Valor da parcela ${item.installment ?? 1} de ${item.installments}`}
              <input
                inputMode="numeric"
                value={formatCurrency(amountCents / 100)}
                disabled={item.status === "paid"}
                onChange={(event) =>
                  setAmountCents(
                    Number(event.target.value.replace(/\D/g, "")) || 0,
                  )
                }
                className={fieldClass}
              />
              {item.status === "paid" && (
                <span className="mt-1 block text-[11px] font-normal">
                  Reabra o registro para alterar o valor.
                </span>
              )}
            </label>
            {!isCard && (
              <label className="block text-[12px] font-semibold text-glass-sub">
                Data do empréstimo
                <input
                  type="date"
                  value={date}
                  max={localDateKey()}
                  onChange={(event) => setDate(event.target.value)}
                  className={fieldClass}
                />
              </label>
            )}
            {!free && !isCard && (
              <label className="block text-[12px] font-semibold text-glass-sub">
                Vencimento desta parcela
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className={fieldClass}
                />
              </label>
            )}
            {isCard && (
              <p className="rounded-2xl bg-primary/5 p-3 text-[12px] text-glass-sub">
                As datas continuam vinculadas ao fechamento e ao vencimento da
                fatura do cartão.
              </p>
            )}
            {!isCard && (
              <fieldset>
                <legend className="text-[12px] font-semibold text-glass-sub">
                  Forma de pagamento usada
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { id: "pix", label: "Pix" },
                    { id: "dinheiro", label: "Dinheiro" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={method === option.id}
                      onClick={() => setMethod(option.id)}
                      className={cn(
                        "min-h-11 rounded-xl px-3 text-[13px] font-semibold",
                        method === option.id
                          ? "bg-primary text-white"
                          : "glass text-glass-sub",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {free && (
              <fieldset>
                <legend className="text-[12px] font-semibold text-glass-sub">
                  Pagamento livre
                </legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { id: "flexible" as const, label: "Indefinido" },
                    { id: "installments" as const, label: "Em parcelas" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={freeMode === option.id}
                      onClick={() => setFreeMode(option.id)}
                      className={cn(
                        "min-h-11 rounded-xl px-3 text-[13px] font-semibold",
                        freeMode === option.id
                          ? "bg-primary text-white"
                          : "glass text-glass-sub",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {freeMode === "installments" && (
                  <label className="mt-3 block text-[12px] font-semibold text-glass-sub">
                    Valor combinado por parcela
                    <input
                      inputMode="numeric"
                      value={formatCurrency(suggestedCents / 100)}
                      onChange={(event) =>
                        setSuggestedCents(
                          Number(event.target.value.replace(/\D/g, "")) || 0,
                        )
                      }
                      className={fieldClass}
                    />
                  </label>
                )}
              </fieldset>
            )}
            <label className="block text-[12px] font-semibold text-[#9b655d]">
              Observação
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                rows={3}
                className={`${fieldClass} min-h-24 resize-none`}
              />
            </label>
            <label className="flex min-h-10 items-center gap-2 text-[12px] text-glass-sub">
              <input
                type="checkbox"
                checked={display === "multipleMedia"}
                onChange={(event) =>
                  setDisplay(event.target.checked ? "multipleMedia" : "hidden")
                }
                className="size-4 accent-primary"
              />
              Mostrar observação no card
            </label>
            <section>
              <h3 className="text-[12px] font-semibold text-glass-sub">
                Anexos · {attachments.length} de 6
              </h3>
              <div className="mt-2 space-y-2">
                {attachments.map((src, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-xl bg-primary/5 p-2"
                  >
                    {src.startsWith("data:image") ? (
                      <img
                        src={src}
                        alt={`Anexo ${index + 1}`}
                        className="size-10 rounded-lg object-cover"
                      />
                    ) : (
                      <Paperclip className="size-5 text-primary" />
                    )}
                    <span className="flex-1 text-[12px] text-glass-sub">
                      Anexo {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover anexo ${index + 1}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      className="flex size-10 items-center justify-center text-glass-sub"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <input
                type="file"
                multiple
                ref={inputRef}
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                disabled={addingFiles || attachments.length >= 6}
                onClick={() => inputRef.current?.click()}
                className="mt-2 min-h-10 text-[12px] font-semibold text-primary disabled:opacity-40"
              >
                {addingFiles ? "Adicionando..." : "Adicionar anexos"}
              </button>
            </section>
            {changed && error && (
              <p role="alert" className="text-[12px] text-[#be252c]">
                {error}
              </p>
            )}
          </div>
          <div className="shrink-0 border-t border-black/5 px-5 py-4">
            <button
              type="submit"
              disabled={!changed || Boolean(error) || addingFiles}
              className="min-h-11 w-full rounded-xl bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Salvar alterações
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
