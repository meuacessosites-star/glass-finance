import { useEffect, useId, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Check, ChevronDown, CreditCard } from "lucide-react";
import { Link } from "react-router";
import type { AppCard } from "@/lib/app-store";
import { getCardBillingChoices } from "@/lib/card-billing";
import { getCardLoanCycle } from "@/lib/card-loans";
import { cardPaymentStyle, cardPaymentTone } from "@/lib/payment-method-theme";
import { cn } from "@/lib/utils";

const dateLabel = (date: string) => date.split("-").reverse().join("/");
const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

export function CardLoanBillingFields({
  cards,
  cardId,
  purchaseDate,
  invoiceMonth,
  installments = 1,
  onCardChange,
  onInvoiceChange,
}: {
  cards: AppCard[];
  cardId: string;
  purchaseDate: string;
  invoiceMonth?: string;
  installments?: number;
  onCardChange: (value: string) => void;
  onInvoiceChange: (value: string) => void;
}) {
  const id = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const available = cards.filter((card) => !card.archived);
  const card = available.find((card) => card.id === cardId);
  const choices = card ? getCardBillingChoices(card, purchaseDate) : null;
  const cycle = getCardLoanCycle(card, purchaseDate, invoiceMonth);
  const currentMonth = choices?.current.month;
  const nextMonth = choices?.next.month;
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceMonth, setChoiceMonth] = useState<string | undefined>();
  const choiceTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const valid = invoiceMonth === currentMonth || invoiceMonth === nextMonth;
    setChoiceMonth(valid ? invoiceMonth : undefined);
    setChoiceOpen(Boolean(currentMonth && nextMonth && !valid));
  }, [cardId, purchaseDate, invoiceMonth, currentMonth, nextMonth]);
  return (
    <div
      className="space-y-3"
      onKeyDown={(event) => {
        if (pickerOpen && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setPickerOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <label
        htmlFor={id}
        className="block text-[12px] font-semibold text-glass-sub"
      >
        Cartão utilizado
      </label>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-expanded={pickerOpen}
        aria-controls={`${id}-cards`}
        disabled={!available.length}
        onClick={() => setPickerOpen((open) => !open)}
        className="glass glass-soft flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2 text-left text-glass-ink transition-colors hover:bg-white/70 disabled:opacity-50"
      >
        <span
          style={card ? cardPaymentStyle(card.color) : undefined}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
            card
              ? cardPaymentTone
              : "border-transparent bg-primary/10 text-primary",
          )}
        >
          <CreditCard className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {card?.name ?? "Selecionar cartão"}
          </span>
          {card && (
            <span className="mt-0.5 block text-[11px] text-glass-sub">
              Final {card.last4}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-glass-sub transition-transform",
            pickerOpen && "rotate-180",
          )}
        />
      </button>
      {pickerOpen && (
        <div
          id={`${id}-cards`}
          role="group"
          aria-label="Cartões disponíveis"
          className="rounded-3xl border border-white/80 bg-[#f4f8ff] p-2 shadow-[0_12px_30px_-20px_rgba(35,65,110,0.35)] dark:border-white/15 dark:bg-[#18273d]"
        >
          <p className="px-2 pb-2 pt-1 text-[11px] font-semibold text-glass-sub">
            Escolha o cartão
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
            {available.map((option) => {
              const selected = option.id === cardId;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onCardChange(option.id);
                    setPickerOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary/30 bg-primary/10"
                      : "border-transparent hover:bg-white/80 dark:hover:bg-white/5",
                  )}
                >
                  <span
                    style={cardPaymentStyle(option.color)}
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                      cardPaymentTone,
                    )}
                  >
                    <CreditCard className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13px] font-semibold text-glass-ink">
                      {option.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-glass-sub">
                      Final {option.last4}
                    </span>
                  </span>
                  {selected && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!available.length && (
        <p className="text-[12px] text-glass-sub">
          Cadastre um cartão com fechamento e vencimento em{" "}
          <Link
            className="font-semibold text-primary underline"
            to="/dashboard/cartoes"
          >
            Meus cartões
          </Link>
          .
        </p>
      )}
      {card && (!card.closingDay || !card.dueDay) && (
        <p className="text-[12px] text-[#b52a32]">
          Preencha o fechamento e o vencimento deste cartão em{" "}
          <Link className="font-semibold underline" to="/dashboard/cartoes">
            Meus cartões
          </Link>
          .
        </p>
      )}
      {choices && (
        <div className="space-y-2 rounded-2xl bg-primary/5 p-3">
          <p className="text-[12px] font-semibold text-glass-ink">
            O cartão fechou em {dateLabel(choices.current.closingDate)}.
          </p>
          {!cycle && (
            <p className="text-[12px] text-glass-sub">
              Escolha em qual mês começa a primeira fatura para continuar.
            </p>
          )}
          <button
            ref={choiceTriggerRef}
            type="button"
            onClick={() => {
              setChoiceMonth(cycle?.month);
              setChoiceOpen(true);
            }}
            className="min-h-11 w-full rounded-xl bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary"
          >
            {cycle ? "Alterar primeira fatura" : "Escolher primeira fatura"}
          </button>
        </div>
      )}
      {cycle && (
        <div className="space-y-1 rounded-2xl bg-primary/5 px-3 py-2.5 text-[12px] text-glass-sub">
          <p className="font-semibold text-glass-ink">
            Primeira fatura: {monthLabel(cycle.month)}
          </p>
          <p>
            {installments > 1
              ? `1ª de ${installments} parcelas`
              : "Parcela única"}
          </p>
          <p>
            Fechamento{" "}
            <strong className="text-glass-ink">
              {dateLabel(cycle.closingDate)}
            </strong>
          </p>
          <p>
            Vencimento{" "}
            <strong className="text-glass-ink">
              {dateLabel(cycle.dueDate)}
            </strong>
          </p>
          <p className="text-[11px]">
            {installments > 1
              ? "As próximas parcelas vencem nos meses seguintes, conforme o vencimento deste cartão."
              : "Esta compra entra na fatura indicada acima."}
          </p>
        </div>
      )}
      {choices && (
        <AlertDialog.Root open={choiceOpen} onOpenChange={setChoiceOpen}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-[#0b1630]/55 backdrop-blur-sm" />
            <AlertDialog.Content
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                choiceTriggerRef.current?.focus();
              }}
              className="fixed left-1/2 top-1/2 z-[110] max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-3xl border border-white/70 bg-[#f4f8ff] p-5 text-glass-ink shadow-xl outline-none dark:border-white/15 dark:bg-[#18273d]"
            >
              <AlertDialog.Title className="text-[18px] font-bold">
                Em qual mês começa a primeira fatura?
              </AlertDialog.Title>
              <AlertDialog.Description className="text-[13px] leading-relaxed text-glass-sub">
                Na data da compra, {dateLabel(purchaseDate)}, o cartão{" "}
                {card?.name} já havia fechado em{" "}
                {dateLabel(choices.current.closingDate)}. Deseja colocar{" "}
                {installments > 1 ? "a primeira parcela" : "esta compra"} na
                fatura atual ou na próxima?
              </AlertDialog.Description>
              <fieldset className="space-y-2">
                <legend className="sr-only">Primeira fatura da compra</legend>
                {[
                  { label: "Fatura atual", cycle: choices.current },
                  { label: "Próxima fatura", cycle: choices.next },
                ].map(({ label, cycle }) => (
                  <label
                    key={cycle.month}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-3",
                      choiceMonth === cycle.month
                        ? "border-primary bg-primary/10"
                        : "border-glass-ink/15 bg-white/60 dark:bg-white/5",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${id}-first-invoice`}
                      value={cycle.month}
                      checked={choiceMonth === cycle.month}
                      onChange={() => setChoiceMonth(cycle.month)}
                      className="mt-1 size-5 shrink-0 accent-primary"
                    />
                    <span className="space-y-1 text-[12px]">
                      <span className="block font-semibold text-glass-ink">
                        {label} · {monthLabel(cycle.month)}
                      </span>
                      <span className="block">
                        {installments > 1 ? "1ª parcela" : "Parcela única"}:{" "}
                        {dateLabel(cycle.dueDate)}
                      </span>
                      <span className="block text-glass-sub">
                        Fechamento {dateLabel(cycle.closingDate)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="text-[12px] text-glass-sub">
                {installments > 1
                  ? "A 1ª parcela será no mês escolhido. A 2ª no mês seguinte, e assim por diante."
                  : "A compra ficará no mês da fatura escolhida."}
              </p>
              <div className="space-y-2">
                <AlertDialog.Action asChild>
                  <button
                    type="button"
                    disabled={!choiceMonth}
                    onClick={() => {
                      if (choiceMonth) onInvoiceChange(choiceMonth);
                    }}
                    className="min-h-11 w-full rounded-2xl bg-primary px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    Confirmar primeira fatura
                  </button>
                </AlertDialog.Action>
                <AlertDialog.Cancel className="min-h-11 w-full rounded-2xl border border-glass-ink/10 px-4 py-3 text-[13px] font-semibold text-glass-sub">
                  Voltar
                </AlertDialog.Cancel>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </div>
  );
}
