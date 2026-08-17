import { Archive, ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { CardVisual } from "./CardsPage";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore, type AppCard } from "@/lib/app-store";
import { currentMonthKey } from "@/lib/mock-data";

export default function ArchivedCardsPage() {
  const navigate = useNavigate();
  const { cards, transactions, updateCard } = useAppStore();
  const archivedCards = cards.filter((card) => card.archived === true);
  const openAmountByCard = transactions.reduce<Record<string, number>>(
    (totals, transaction) => {
      if (
        transaction.amount < 0 &&
        transaction.cardMode === "credito" &&
        transaction.cardId &&
        transaction.date.startsWith(currentMonthKey)
      ) {
        totals[transaction.cardId] =
          (totals[transaction.cardId] ?? 0) + Math.abs(transaction.amount);
      }
      return totals;
    },
    {},
  );

  const handleRestore = (card: AppCard) => {
    updateCard(card.id, { archived: false });
    toast(`${card.name} restaurado`);
    navigate("/dashboard/compras-cartao");
  };

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Cartões Arquivados"
        titleClassName="whitespace-nowrap text-[17px]"
      />

      <div className="flex min-w-0 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Archive className="size-4 shrink-0 text-glass-sub" />
          <p className="truncate text-[12px] font-medium text-glass-faint">
            {archivedCards.length === 1
              ? "1 cartão arquivado"
              : `${archivedCards.length} cartões arquivados`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/dashboard/compras-cartao")}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-95"
        >
          <ArrowLeft className="size-3.5" />
          Voltar
        </button>
      </div>

      {archivedCards.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <Archive className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhum cartão arquivado
            </p>
            <p className="mt-1 max-w-[280px] text-[13px] leading-relaxed text-glass-sub">
              Quando você arquivar um cartão, ele aparecerá exclusivamente nesta tela.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/cartoes")}
            className="glass rounded-full px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
          >
            Ir para gestão de cartões
          </button>
        </div>
      ) : (
        <div className="space-y-4 px-1">
          {archivedCards.map((card) => (
            <div key={card.id} className="mx-auto w-full max-w-[420px] space-y-2">
              <CardVisual
                card={card}
                openAmount={openAmountByCard[card.id] ?? 0}
              />
              <button
                type="button"
                onClick={() => handleRestore(card)}
                className="glass flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
              >
                <RotateCcw className="size-3.5" />
                Restaurar cartão
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

