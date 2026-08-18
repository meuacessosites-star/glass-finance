import { Banknote, Barcode, CreditCard, QrCode, Send, Wallet } from "lucide-react";
import type { AppCard } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { HorizontalScroll } from "./HorizontalScroll";

// ---------------------------------------------------------------------------
// PaymentMethodSelector — shared form control for the manual-add and the
// receipt-scan flows. A horizontal chip row picks the method (Pix, Dinheiro,
// Cartão, Boleto, Transferência); picking "Cartão" expands it into a
// Crédito/Débito toggle plus a row with the user's saved cards.
// ---------------------------------------------------------------------------

export type PaymentMethodId =
  | "pix"
  | "dinheiro"
  | "cartao"
  | "boleto"
  | "transferencia"
  | "saldo";
export type CardMode = "credito" | "debito";

export const PAYMENT_METHODS: {
  id: PaymentMethodId;
  label: string;
  icon: typeof QrCode;
}[] = [
  { id: "pix", label: "Pix", icon: QrCode },
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "cartao", label: "Cartão", icon: CreditCard },
  { id: "boleto", label: "Boleto", icon: Barcode },
  { id: "transferencia", label: "Transferência", icon: Send },
  { id: "saldo", label: "Saldo", icon: Wallet },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  boleto: "Boleto",
  transferencia: "Transferência",
  saldo: "Saldo",
};

export const CARD_MODE_LABELS: Record<CardMode, string> = {
  credito: "Crédito",
  debito: "Débito",
};

/**
 * Normalizes a raw OCR/payment label into a payment-method id. Crédito and
 * Débito are card MODES, not separate methods: both map to "cartao", and the
 * mode is returned separately (so the selector can preselect it).
 */
export function normalizePaymentMethod(
  raw?: string | null,
): { method: PaymentMethodId | ""; cardMode: CardMode | "" } {
  if (!raw) return { method: "", cardMode: "" };
  const r = raw.toLowerCase();
  if (r.includes("pix")) return { method: "pix", cardMode: "" };
  if (r.includes("dinheiro")) return { method: "dinheiro", cardMode: "" };
  if (r.includes("boleto")) return { method: "boleto", cardMode: "" };
  if (r.includes("transfer")) return { method: "transferencia", cardMode: "" };
  if (r.includes("saldo")) return { method: "saldo", cardMode: "" };
  if (r.includes("credito") || r.includes("crédito"))
    return { method: "cartao", cardMode: "credito" };
  if (r.includes("debito") || r.includes("débito"))
    return { method: "cartao", cardMode: "debito" };
  if (r.includes("cartao") || r.includes("cartão") || r.includes("card"))
    return { method: "cartao", cardMode: "" };
  return { method: "", cardMode: "" };
}

export function PaymentMethodSelector({
  value,
  onValueChange,
  cardMode,
  onCardModeChange,
  cardId,
  onCardChange,
  cards,
}: {
  value: PaymentMethodId | "";
  onValueChange: (v: PaymentMethodId | "") => void;
  cardMode: CardMode | "";
  onCardModeChange: (m: CardMode) => void;
  cardId: string | null;
  onCardChange: (cardId: string | null) => void;
  cards: AppCard[];
}) {
  const expanded = value === "cartao";

  return (
    <div>
      {/* Method chips */}
      <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">
        {PAYMENT_METHODS.map((m) => {
          const Icon = m.icon;
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onValueChange(m.id);
                if (m.id !== "cartao") onCardChange(null);
              }}                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-95",
                  selected
                    ? "bg-primary text-white shadow-[0_6px_16px_-6px_rgba(47,107,255,0.5)]"
                    : "glass text-glass-sub",
                )}
            >
              <Icon className="size-3.5" strokeWidth={2.4} />
              {m.label}
            </button>
          );            })}
      </HorizontalScroll>

      {/* Expanded card section: Crédito/Débito + saved cards */}
      {expanded && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
            {(["credito", "debito"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onCardModeChange(mode)}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13.5px] font-semibold transition-all",
                  cardMode === mode ? "bg-white shadow-sm" : "text-glass-sub",
                )}
              >
                <CreditCard
                  className={cn(
                    "size-4",
                    cardMode === mode
                      ? mode === "credito"
                        ? "text-[#2F6BFF]"
                        : "text-[#FF9500]"
                      : "text-glass-faint",
                  )}
                />
                <span
                  className={cn(
                    cardMode === mode
                      ? mode === "credito"
                        ? "text-[#2F6BFF]"
                        : "text-[#FF9500]"
                      : "",
                  )}
                >
                  {CARD_MODE_LABELS[mode]}
                </span>
              </button>
            ))}
          </div>

          <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">
            <button
              type="button"
              onClick={() => onCardChange(null)}                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-95",
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
                    "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-3.5 text-[12.5px] font-semibold transition-all active:scale-95",
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
            {cards.length === 0 && (
              <p className="shrink-0 py-2 pr-1 text-[12px] text-glass-sub">
                Nenhum cartão salvo — adicione em Cartões (menu lateral).
              </p>
            )}
          </HorizontalScroll>
        </>
      )}
    </div>
  );
}
