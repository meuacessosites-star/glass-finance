import type { LoanReceivable } from "@/lib/app-store";
import { getLoanInstallmentHistory } from "@/lib/loan-history";
import { cn } from "@/lib/utils";

/** The same saved history as Details, without creating installments or dates. */
export function LoanInstallmentProgress({
  item,
  items,
  today,
  onDetails,
}: {
  item: LoanReceivable;
  items: LoanReceivable[];
  today: string;
  onDetails: () => void;
}) {
  const parts = getLoanInstallmentHistory(item, items, today);
  if (parts.length < 2) return null;
  const received = parts.filter((part) => part.status === "paid").length;
  const description = `${received} de ${parts.length} parcelas registradas recebidas. Verde: recebida. Cinza: ainda não recebida.`;
  return (
    <button
      type="button"
      onClick={onDetails}
      aria-label={`${description} Ver detalhes das parcelas de ${item.contact}.`}
      title={description}
      className="pointer-events-auto flex min-h-7 w-fit max-w-full flex-wrap items-center gap-1.5 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {parts.map((part) => (
        <span
          key={part.id}
          aria-hidden="true"
          title={`${part.number}ª parcela: ${part.status === "paid" ? "recebida" : "ainda não recebida"}`}
          className={cn(
            "size-2 shrink-0 rounded-full",
            part.status === "paid"
              ? "bg-[#1fbf4f] dark:bg-[#66d887]"
              : "bg-[#cbd0d9] dark:bg-[#737f91]",
          )}
        />
      ))}
    </button>
  );
}
