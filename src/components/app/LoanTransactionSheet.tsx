import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  CreditCard,
  HandCoins,
  Infinity as InfinityIcon,
  Landmark,
  Repeat2,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { HorizontalScroll } from "./HorizontalScroll";
import type { PaymentMethodId } from "./PaymentMethodSelector";
import { PersonSelector } from "./PersonSelector";

type CollectionMode = "fixed" | "open";

const PAYMENT_OPTIONS: {
  id: Extract<PaymentMethodId, "pix" | "dinheiro" | "cartao">;
  label: string;
  Icon: typeof Landmark;
}[] = [
  { id: "pix", label: "Pix", Icon: Landmark },
  { id: "dinheiro", label: "Dinheiro", Icon: Wallet },
  { id: "cartao", label: "Cartão", Icon: CreditCard },
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-3.5 py-3 text-[14px] font-semibold text-glass-ink outline-none placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

function formatAmount(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function isoForMonth(year: number, month: number, dueDay: number) {
  const day = Math.min(dueDay, daysInMonth(year, month));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function scheduledDueDates(baseDate: string, dueDay: number, installments: number) {
  const [year, month, day] = baseDate.split("-").map(Number);
  if (!year || !month || !day) return [];

  let firstMonth = month - 1;
  let firstYear = year;
  const firstDate = isoForMonth(firstYear, firstMonth, dueDay);
  if (firstDate < baseDate) {
    firstMonth += 1;
    if (firstMonth === 12) {
      firstMonth = 0;
      firstYear += 1;
    }
  }

  return Array.from({ length: installments }, (_, index) => {
    const absoluteMonth = firstMonth + index;
    return isoForMonth(
      firstYear + Math.floor(absoluteMonth / 12),
      absoluteMonth % 12,
      dueDay,
    );
  });
}

/**
 * Registra valores disponibilizados a terceiros e acompanha a devolução.
 * A saída acontece imediatamente; as devoluções ficam como contas a receber
 * agendadas ou como uma dívida em aberto vinculada ao contato.
 */
export function LoanTransactionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { createLoanRecord, categories } = useAppStore();
  const people = useQuery(api.people.list) as Array<{ _id: string; name: string }> | undefined;
  const [cents, setCents] = useState(0);
  const [personId, setPersonId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("pix");
  const [collectionMode, setCollectionMode] = useState<CollectionMode>("fixed");
  const [installments, setInstallments] = useState(1);
  const [dueDay, setDueDay] = useState(() => new Date().getDate());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const amountLabel = useMemo(() => formatAmount(cents), [cents]);
  const contact = people?.find((person) => person._id === personId)?.name ?? "";
  const categoryId =
    categories.find((category) => category.id === "transferencias")?.id ??
    categories.find((category) => category.id === "outros")?.id ??
    categories[0]?.id ??
    "outros";
  const canSave = cents > 0 && Boolean(personId) && contact.trim().length > 0;
  const dueDates = useMemo(
    () =>
      collectionMode === "fixed"
        ? scheduledDueDates(date, dueDay, installments)
        : [],
    [collectionMode, date, dueDay, installments],
  );
  const installmentCents = installments > 0 ? Math.floor(cents / installments) : 0;
  const remainderCents = installments > 0 ? cents % installments : 0;

  const reset = () => {
    setCents(0);
    setPersonId(null);
    setDescription("");
    setPaymentMethod("pix");
    setCollectionMode("fixed");
    setInstallments(1);
    setDueDay(new Date().getDate());
    setDate(new Date().toISOString().slice(0, 10));
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAmount = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setCents(digits ? Number(digits) : 0);
  };

  const handleSave = () => {
    if (!canSave) return;

    const normalizedContact = contact.trim();
    const normalizedDescription = description.trim() || undefined;
    const receivables = dueDates.map((dueDate, index) => {
      const amountInCents = installmentCents + (index < remainderCents ? 1 : 0);
      return {
        amount: amountInCents / 100,
        dueDate,
        installment: index + 1,
        installments,
      };
    });

    createLoanRecord({
      contact: normalizedContact,
      description: normalizedDescription,
      amount: cents / 100,
      date,
      categoryId,
      paymentMethod,
      collectionMode,
      receivables: collectionMode === "fixed" ? receivables : undefined,
    });

    toast(
      collectionMode === "fixed"
        ? "Empréstimo e cobranças agendados"
        : "Dívida em aberto registrada",
      {
        description:
          collectionMode === "fixed"
            ? `${installments} conta${installments > 1 ? "s" : ""} a receber de ${normalizedContact}.`
            : `A devolução de ${normalizedContact} ficou registrada sem vencimento fixo.`,
      },
    );
    handleClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="loan-transaction"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className="glass glass-strong absolute inset-0 z-[55] flex flex-col"
        >
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                Empréstimo / Cartão
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                Registre o valor e acompanhe a devolução
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={handleClose}
              className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
            >
              <X className="size-[18px]" />
            </button>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
            <div className="mt-3 text-center">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Valor emprestado
              </p>
              <input
                inputMode="numeric"
                value={amountLabel}
                onChange={(event) => handleAmount(event.target.value)}
                placeholder="R$ 0,00"
                aria-label="Valor emprestado"
                className="mt-1 w-full bg-transparent text-center text-[38px] font-bold tracking-tight text-[#FF3B30] outline-none"
              />
              <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-primary/30" />
            </div>

            <PersonSelector
              value={personId}
              onValueChange={setPersonId}
              onNavigateToPeople={onClose}
              required
              label="Nome do contato"
              placeholder="Selecionar pessoa"
            />
            <p className="mt-1.5 px-1 text-[11.5px] text-glass-faint">
              Essencial para acompanhar quem precisa devolver o valor.
            </p>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Descrição <span className="normal-case text-glass-faint">(opcional)</span>
              </p>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ex.: Compra no shopping ou dinheiro vivo"
                maxLength={80}
                className={cn(inputClass, "mt-2")}
              />
            </div>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Forma de pagamento usada
              </p>
              <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">
                {PAYMENT_OPTIONS.map(({ id, label, Icon }) => {
                  const selected = paymentMethod === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentMethod(id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                        selected
                          ? "bg-primary/10 text-primary ring-2 ring-primary/40"
                          : "glass text-glass-sub",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  );
                })}
              </HorizontalScroll>
            </div>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Como a pessoa vai pagar?
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-black/5 p-1">
                <button
                  type="button"
                  onClick={() => setCollectionMode("fixed")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition-all",
                    collectionMode === "fixed" ? "bg-white text-primary shadow-sm" : "text-glass-sub",
                  )}
                >
                  <Repeat2 className="size-4" />
                  Fixo/Parcelado
                </button>
                <button
                  type="button"
                  onClick={() => setCollectionMode("open")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition-all",
                    collectionMode === "open" ? "bg-white text-primary shadow-sm" : "text-glass-sub",
                  )}
                >
                  <InfinityIcon className="size-4" />
                  Pagamento livre
                </button>
              </div>
            </div>

            {collectionMode === "fixed" && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Parcelas
                  </p>
                  <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
                    <HandCoins className="size-4 shrink-0 text-glass-sub" />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={48}
                      value={installments}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setInstallments(Number.isFinite(next) ? Math.min(48, Math.max(1, next)) : 1);
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-glass-ink outline-none"
                    />
                    <span className="text-[12px] font-semibold text-glass-sub">x</span>
                  </label>
                </div>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                    Dia do vencimento
                  </p>
                  <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
                    <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={31}
                      value={dueDay}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        setDueDay(Number.isFinite(next) ? Math.min(31, Math.max(1, next)) : 1);
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-glass-ink outline-none"
                    />
                  </label>
                </div>
              </div>
            )}

            {collectionMode === "open" && (
              <div className="glass glass-soft mt-5 rounded-2xl px-4 py-3">
                <p className="text-[13px] font-semibold text-glass-ink">Dívida em aberto</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-glass-sub">
                  O valor ficará vinculado a {contact.trim() || "este contato"}, sem vencimento mensal definido.
                </p>
              </div>
            )}

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Data da saída
              </p>
              <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                />
              </label>
            </div>
          </div>

          <div className="px-5 pb-7 pt-2">
            {collectionMode === "fixed" && cents > 0 && dueDates.length > 0 && (
              <div className="glass glass-soft mb-3 rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                      Conta a receber
                    </p>
                    <p className="amount-tabular text-[17px] font-bold leading-tight text-[#17a443]">
                      {formatAmount(installmentCents + (remainderCents > 0 ? 1 : 0))}
                    </p>
                  </div>
                  <p className="text-right text-[12px] font-semibold text-glass-sub">
                    {installments}× · todo dia {dueDay}
                  </p>
                </div>
                <p className="mt-1.5 text-[11.5px] text-glass-faint">
                  Primeira devolução em {formatDate(dueDates[0])}.
                </p>
              </div>
            )}
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]",
                !canSave && "opacity-50",
              )}
            >
              <Check className="size-[18px]" strokeWidth={2.6} />
              Salvar registro
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
