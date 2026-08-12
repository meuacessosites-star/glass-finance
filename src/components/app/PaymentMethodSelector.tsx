import { Banknote, Barcode, CreditCard, Landmark, QrCode, Receipt, Send } from "lucide-react";
import type { AppCard } from "@/lib/app-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// PaymentMethodSelector — shared form control for the manual-add and the
// receipt-scan flows. A horizontal chip row picks the method (Pix, Dinheiro,
// Cartão, Crédito, Débito, Boleto, Transferência); picking "Cartão" reveals
// a second row with the user's saved cards (from the Cards screen).
// ---------------------------------------------------------------------------

export type PaymentMethodId =
  | "pix"
  | "dinheiro"
  | "cartao"
  | "credito"
  | "debito"
  | "boleto"
  | "transferencia";

export const PAYMENT_METHODS: {
  id: PaymentMethodId;
  label: string;
  icon: typeof QrCode;
}[] = [
  { id: "pix", label: "Pix", icon: QrCode },
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "cartao", label: "Cartão", icon: CreditCard },
  { id: "credito", label: "Crédito", icon: Landmark },
  { id: "debito", label: "Débito", icon: Receipt },
  { id: "boleto", label: "Boleto", icon: Barcode },
  { id: "transferencia", label: "Transferência", icon: Send },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  credito: "Crédito",
  debito: "Débito",
  boleto: "Boleto",
  transferencia: "Transferência",
};

/** Payment method id inferred from a raw OCR/payment label, or \"\" when none. */
export function normalizePaymentMethod(
  raw?: string | null,
): PaymentMethodId | "" {
  if (!raw) return "";
  const r = raw.toLowerCase();
  if (r.includes("pix")) return "pix";
  if (r.includes("dinheiro")) return "dinheiro";
  if (r.includes("credito") || r.includes("crédito")) return "credito";
  if (r.includes("debito") || r.includes("débito")) return "debito";
  if (r.includes("boleto")) return "boleto";
  if (r.includes("transfer")) return "transferencia";
  if (r.includes("cartao") || r.includes("cartão") || r.includes("card"))
    return "cartao";
  return "";
}

export function PaymentMethodSelector({
  value,
  onValueChange,
  cardId,
  onCardChange,
  cards,
  income = false,
}: {
  value: PaymentMethodId | "";
  onValueChange: (v: PaymentMethodId | "") => void;
  cardId: string | null;
  onCardChange: (cardId: string | null) => void;
  cards: AppCard[];
  /** When true, only income-appropriate methods show (Pix, Dinheiro, Transferência). */
  income?: boolean;
}) {
  const options = income
    ? PAYMENT_METHODS.filter((m) =>
        ["pix", "dinheiro", "transferencia"].includes(m.id),
      )
    : PAYMENT_METHODS;

  return (
    <div>
      <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {options.map((m) => {
          const Icon = m.icon;
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onValueChange(m.id);
                // Switching away from a card method drops the card selection.
                if (m.id !== "cartao") onCardChange(null);
              }}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-95",
                selected
                  ? "bg-primary text-white shadow-[0_6px_16px_-6px_rgba(47,107,255,0.5)]"
                  : "glass text-glass-sub",
              )}
            >
              <Icon className="size-3.5" strokeWidth={2.4} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Saved-card row — only when "Cartão" is the selected method */}
      {value === "cartao" && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-0.5">
          <button
            type="button"
            onClick={() => onCardChange(null)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-95",
              cardId === null
                ? "bg-glass-ink text-white"
                : "glass text-glass-sub",
            )}
          >
            <CreditCard className="size-3.5" strokeWidth={2.4} />
            Sem cartão
          </button>
          {cards.map((c) => {
            const selected = cardId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCardChange(c.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[12.5px] font-semibold transition-all active:scale-95",
                  selected
                    ? "text-white shadow-[0_6px_16px_-6px_rgba(15,40,90,0.45)]"
                    : "glass text-glass-sub",
                )}
                style={selected ? { backgroundColor: c.color } : undefined}
              >
                <span
                  className="flex size-6 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: c.color }}
                >
                  <CreditCard className="size-3" strokeWidth={2.6} />
                </span>
                {c.name} ····{c.last4}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
