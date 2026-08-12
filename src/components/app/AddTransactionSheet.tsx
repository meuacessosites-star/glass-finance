import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import {
  PaymentMethodSelector,
  type CardMode,
  type PaymentMethodId,
} from "./PaymentMethodSelector";

// ---------------------------------------------------------------------------
// AddTransactionSheet — full-screen iOS-style page opened by “Adicionar
// Manual” in the + menu. Saves the transaction into the ACTIVE profile's
// store, so it shows up in the Home summary, the history and the reports.
// ---------------------------------------------------------------------------

const INCOME_IDS = new Set(["salario", "freelance"]);

type TxType = "expense" | "income";

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

export function AddTransactionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { categories, cards, addTransaction } = useAppStore();
  const [type, setType] = useState<TxType>("expense");
  const [cents, setCents] = useState(0);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | "">("");
  const [cardMode, setCardMode] = useState<CardMode | "">("");
  const [cardId, setCardId] = useState<string | null>(null);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setType("expense");
    setCents(0);
    setTitle("");
    setDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("");
    setCardMode("");
    setCardId(null);
    const fallback = categories.find((c) => !INCOME_IDS.has(c.id));
    setCategoryId(fallback?.id ?? categories[0]?.id ?? "outros");
  }, [open, categories]);

  const switchType = (t: TxType) => {
    setType(t);
    if (t === "income" && !INCOME_IDS.has(categoryId)) {
      const income = categories.find((c) => INCOME_IDS.has(c.id));
      setCategoryId(income?.id ?? categories[0]?.id ?? "outros");
    } else if (t === "expense" && INCOME_IDS.has(categoryId)) {
      const expense = categories.find((c) => !INCOME_IDS.has(c.id));
      setCategoryId(expense?.id ?? categories[0]?.id ?? "outros");
    }
  };

  // Money input: keep only digits; the field always shows the formatted BRL
  // value (typing appends to the right, like a calculator).
  const handleAmount = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    setCents(digits ? parseInt(digits, 10) : 0);
  };

  const amountLabel = (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const canSave = cents > 0 && title.trim().length > 0 && !!categoryId;

  const handleSave = () => {
    if (!canSave) return;
    addTransaction({
      title: title.trim(),
      categoryId,
      amount: type === "expense" ? -cents / 100 : cents / 100,
      date,
      paymentMethod: paymentMethod || undefined,
      cardId: cardId ?? undefined,
      cardMode: paymentMethod === "cartao" ? cardMode || undefined : undefined,
    });
    toast(type === "expense" ? "Despesa adicionada" : "Receita adicionada", {
      description: "Já aparece no seu resumo e no histórico.",
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="add-tx"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 330 }}
          className="glass glass-strong absolute inset-0 z-[55] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight text-glass-ink">
                Adicionar manual
              </h3>
              <p className="text-[12.5px] text-glass-sub">
                Registre um gasto ou ganho
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
            >
              <X className="size-[18px]" />
            </button>
          </div>

          {/* Form */}
          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-3">
            {/* Type */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition-all",
                    type === t ? "bg-white shadow-sm" : "text-glass-sub",
                  )}
                >
                  {t === "expense" ? (
                    <ArrowDownLeft className="size-4 text-[#FF3B30]" />
                  ) : (
                    <ArrowUpRight className="size-4 text-[#17a443]" />
                  )}
                  <span
                    className={
                      type === t
                        ? t === "expense"
                          ? "text-[#FF3B30]"
                          : "text-[#17a443]"
                        : "text-glass-sub"
                    }
                  >
                    {t === "expense" ? "Despesa" : "Receita"}
                  </span>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="mt-6 text-center">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Valor
              </p>
              <input
                inputMode="numeric"
                value={amountLabel}
                onChange={(e) => handleAmount(e.target.value)}
                placeholder="R$ 0,00"
                aria-label="Valor"
                className={cn(
                  "mt-1 w-full bg-transparent text-center text-[38px] font-bold tracking-tight outline-none",
                  type === "expense" ? "text-[#FF3B30]" : "text-[#17a443]",
                )}
              />
              <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-primary/30" />
            </div>

            {/* Description */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Descrição
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "expense"
                    ? "Ex.: Padaria do Zé"
                    : "Ex.: Freelance · Landing page"
                }
                maxLength={40}
                className={cn(inputClass, "mt-2")}
              />
            </div>

            {/* Category */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Categoria
              </p>
              <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-0.5">
                {categories.map((c) => {
                  const selected = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all",
                        selected
                          ? "text-white shadow-[0_6px_16px_-6px_rgba(47,107,255,0.5)]"
                          : "glass text-glass-sub",
                      )}
                      style={
                        selected ? { backgroundColor: c.color } : undefined
                      }
                    >
                      <CategoryIcon
                        categoryId={c.id}
                        size="size-5"
                        iconSize="size-3"
                      />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment method */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Forma de pagamento
              </p>
              <PaymentMethodSelector
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v);
                  if (v === "cartao") setCardMode("credito");
                  else {
                    setCardMode("");
                    setCardId(null);
                  }
                }}
                cardMode={cardMode}
                onCardModeChange={setCardMode}
                cardId={cardId}
                onCardChange={setCardId}
                cards={cards}
              />
            </div>

            {/* Date */}
            <div className="mt-6">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Data
              </p>
              <label className="glass glass-soft mt-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3">
                <CalendarDays className="size-4 shrink-0 text-glass-sub" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full bg-transparent text-[15px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
                />
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-7 pt-2">
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
              Adicionar {type === "expense" ? "despesa" : "receita"}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
