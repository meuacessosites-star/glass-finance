import { useId, useRef, useState } from "react";
import {
  CARD_BRAND_LABELS,
  getBankSuggestions,
  type BankPreset,
} from "@/lib/card-appearance";
import { cn } from "@/lib/utils";

export function BankSuggestionInput({
  value,
  onChange,
  onSelect,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (bank: BankPreset) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const suggestions = getBankSuggestions(value);
  const select = (bank: BankPreset) => {
    onSelect(bank);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  };
  return (
    <div
      className="mt-2.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <input
        ref={input}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Banco / instituição (ex.: Mercado Pago)"
        aria-label="Banco ou instituição"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        autoComplete="off"
        maxLength={40}
        className={className}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (suggestions.length)
              setActive((previous) =>
                previous < 0
                  ? event.key === "ArrowDown"
                    ? 0
                    : suggestions.length - 1
                  : (previous +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      suggestions.length) %
                    suggestions.length,
              );
          }
          if (
            event.key === "Enter" &&
            open &&
            active >= 0 &&
            suggestions[active]
          ) {
            event.preventDefault();
            select(suggestions[active]);
          }
        }}
      />
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label="Sugestões de bancos"
          className="glass-strong mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border border-glass-ink/10 p-1"
        >
          {suggestions.length ? (
            suggestions.map((bank, index) => (
              <button
                key={bank.name}
                id={`${id}-${index}`}
                type="button"
                role="option"
                aria-selected={active === index}
                onClick={() => select(bank)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left",
                  active === index ? "bg-primary/15" : "hover:bg-primary/5",
                )}
              >
                <span
                  className="size-7 shrink-0 rounded-lg border border-glass-ink/10"
                  style={{ backgroundColor: bank.color }}
                  aria-label="Cor sugerida"
                />
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-glass-ink">
                  {bank.name}
                </span>
                <span className="text-[10.5px] text-glass-sub">
                  {bank.brand
                    ? CARD_BRAND_LABELS[bank.brand]
                    : "Escolha a bandeira"}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-[12px] text-glass-sub">
              Banco não listado? Você pode continuar com o nome digitado e
              escolher a cor e a bandeira.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
