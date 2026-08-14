import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  CreditCard,
  HandCoins,
  Landmark,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { HorizontalScroll } from "./HorizontalScroll";
import type { PaymentMethodId } from "./PaymentMethodSelector";

type LoanDirection = "lent" | "borrowed";

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

/**
 * Registro rápido de dinheiro ou cartão de terceiros. Ele persiste no mesmo
 * histórico de transações do app, mantendo o sinal financeiro coerente:
 * emprestei = saída; peguei = entrada.
 */
export function LoanTransactionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addTransaction, categories } = useAppStore();
  const [direction, setDirection] = useState<LoanDirection>("lent");
  const [cents, setCents] = useState(0);
  const [contact, setContact] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("pix");
  const [installments, setInstallments] = useState(1);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const amountLabel = useMemo(() => formatAmount(cents), [cents]);
  const isLent = direction === "lent";
  const categoryId =
    categories.find((category) => category.id === "transferencias")?.id ??
    categories.find((category) => category.id === "outros")?.id ??
    categories[0]?.id ??
    "outros";
  const canSave = cents > 0 && contact.trim().length > 0;

  const reset = () => {
    setDirection("lent");
    setCents(0);
    setContact("");
    setDescription("");
    setPaymentMethod("pix");
    setInstallments(1);
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
    const normalizedDescription = description.trim();
    const isInstallmentPurchase = paymentMethod === "cartao" && installments > 1;
    const title = isLent
      ? `Emprestei para ${normalizedContact}`
      : `Peguei de ${normalizedContact}`;
    const note = [
      normalizedDescription || undefined,
      `Contato: ${normalizedContact}`,
      isInstallmentPurchase ? `Cartão em ${installments}x` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    addTransaction({
      title,
      categoryId,
      amount: (isLent ? -1 : 1) * (cents / 100),
      date,
      note,
      paymentMethod,
      recurrence: isInstallmentPurchase ? "parcelada" : undefined,
      installments: isInstallmentPurchase ? installments : undefined,
      currentInstallment: isInstallmentPurchase ? 1 : undefined,
    });

    toast(isLent ? "Empréstimo registrado" : "Entrada registrada", {
      description: isLent
        ? "O valor já aparece como uma saída no seu histórico."
        : "O valor já aparece como uma entrada no seu histórico.",
    });
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
                Registre dinheiro ou cartão de terceiros
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
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
              <button
                type="button"
                onClick={() => setDirection("lent")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
                  isLent ? "bg-white shadow-sm" : "text-glass-sub",
                )}
              >
                <ArrowUpRight className="size-4 text-[#FF3B30]" />
                <span className={isLent ? "text-[#FF3B30]" : "text-glass-sub"}>
                  Emprestei
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("borrowed")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
                  !isLent ? "bg-white shadow-sm" : "text-glass-sub",
                )}
              >
                <ArrowDownLeft className="size-4 text-[#17a443]" />
                <span className={!isLent ? "text-[#17a443]" : "text-glass-sub"}>
                  Peguei
                </span>
              </button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Valor
              </p>
              <input
                inputMode="numeric"
                value={amountLabel}
                onChange={(event) => handleAmount(event.target.value)}
                placeholder="R$ 0,00"
                aria-label="Valor"
                className={cn(
                  "mt-1 w-full bg-transparent text-center text-[38px] font-bold tracking-tight outline-none",
                  isLent ? "text-[#FF3B30]" : "text-[#17a443]",
                )}
              />
              <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-primary/30" />
            </div>

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Contato
              </p>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="Nome do contato/amigo"
                maxLength={40}
                className={cn(inputClass, "mt-2")}
              />
            </div>

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
                Forma de pagamento
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

            {paymentMethod === "cartao" && (
              <div className="mt-5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                  Parcelas <span className="normal-case text-glass-faint">(opcional)</span>
                </p>
                <label className="glass glass-soft mt-2 flex items-center gap-2.5 rounded-2xl px-3.5 py-3">
                  <HandCoins className="size-4 shrink-0 text-glass-sub" />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={24}
                    value={installments}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      setInstallments(Number.isFinite(next) ? Math.min(24, Math.max(1, next)) : 1);
                    }}
                    className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none"
                  />
                  <span className="text-[12px] font-semibold text-glass-sub">vezes</span>
                </label>
              </div>
            )}

            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Data
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
            {paymentMethod === "cartao" && installments > 1 && cents > 0 && (
              <div className="glass glass-soft mb-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-sub">
                    Cada parcela
                  </p>
                  <p className="amount-tabular text-[17px] font-bold leading-tight text-glass-ink">
                    {formatAmount(Math.round(cents / installments))}
                  </p>
                </div>
                <p className="text-right text-[12px] font-semibold text-glass-sub">
                  {installments}× de {amountLabel}
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
