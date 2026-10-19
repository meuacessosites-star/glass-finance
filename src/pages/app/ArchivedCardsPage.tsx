import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { CardVisual } from "./CardsPage";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore, type AppCard } from "@/lib/app-store";
import { getCardCommittedAmount } from "@/lib/card-invoice-view";
import { useLocalDate } from "@/hooks/use-local-date";

export default function ArchivedCardsPage() {
  const navigate = useNavigate();
  const today = useLocalDate();
  const { cards, transactions, updateCard } = useAppStore();
  const archivedCards = cards.filter((card) => card.archived === true);
  const openAmountByCard = Object.fromEntries(archivedCards.map((card) => [card.id, getCardCommittedAmount(card, transactions, today)]));

  const handleRestore = (card: AppCard) => {
    updateCard(card.id, { archived: false });
    toast(`${card.name} restaurado`);
    navigate("/dashboard/compras-cartao", { state: { cardId: card.id } });
  };

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Cartões Arquivados"
        titleClassName="mx-auto whitespace-nowrap text-center text-[17px]"
        onBack={() => navigate("/dashboard/compras-cartao")}
      />

      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Consulte e restaure cartões que não fazem parte do dia a dia.
      </p>

      <div className="flex items-center gap-2 px-1">
        <Archive className="size-4 shrink-0 text-glass-sub" />
        <p className="text-[12px] font-bold uppercase tracking-wide text-glass-sub">
          {archivedCards.length === 1
            ? "1 CARTÃO ARQUIVADO"
            : `${archivedCards.length} CARTÕES ARQUIVADOS`}
        </p>
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

