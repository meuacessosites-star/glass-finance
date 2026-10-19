import type { AppCard } from "@/lib/app-store";
import { cn } from "@/lib/utils";
import { CARD_BRAND_LABELS, detectCardBrand } from "@/lib/card-appearance";

type CardBrandMarkProps = {
  card: Pick<AppCard, "name" | "institution" | "brand">;
  className?: string;
};

export function CardBrandMark({ card, className }: CardBrandMarkProps) {
  const brand = detectCardBrand(card);
  const label =
    brand === "card" ? "Bandeira não informada" : CARD_BRAND_LABELS[brand];

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center gap-1 rounded-md border border-white/25 bg-black/10 px-2 py-1 text-white/90 backdrop-blur-md",
        className,
      )}
    >
      {brand === "mastercard" ? (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 28 18"
            className="h-4 w-6 shrink-0"
          >
            <circle cx="10" cy="9" r="7" fill="#EB001B" />
            <circle cx="18" cy="9" r="7" fill="#F79E1B" />
          </svg>
          <span className="text-[8px] font-bold tracking-tight">
            mastercard
          </span>
        </>
      ) : brand === "visa" ? (
        <span className="text-[11px] font-black italic tracking-tight">
          VISA
        </span>
      ) : brand !== "card" ? (
        <span className="text-[9px] font-bold tracking-tight">
          {CARD_BRAND_LABELS[brand]}
        </span>
      ) : (
        <span className="text-[9px] font-bold tracking-[0.12em]">CARD</span>
      )}
    </span>
  );
}
