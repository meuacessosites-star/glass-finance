import { useState } from "react";
import { CreditCard, Plus, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { BackHeader } from "@/components/app/BackHeader";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#2F6BFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#FF9500",
  "#1FBF4F",
  "#00C7BE",
  "#0A84FF",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

export default function CardsPage() {
  const { cards, activeProfile, addCard, deleteCard } = useAppStore();
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome ao cartão");
      return;
    }
    const digits = last4.replace(/\D/g, "");
    if (digits.length !== 4) {
      toast("Informe os 4 últimos dígitos do cartão");
      return;
    }
    addCard({ name: trimmed, last4: digits, color });
    setName("");
    setLast4("");
    setColor(PALETTE[0]);
    toast("Cartão adicionado");
  };

  return (
    <div className="space-y-4">
      <BackHeader title="Cartões" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Cartões de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        cada perfil tem os seus.
      </p>

      {/* Cards */}
      <div className="space-y-4">
        {cards.length === 0 && (
          <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
              <CreditCard className="size-6 text-glass-faint" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-glass-ink">
                Nenhum cartão ainda
              </p>
              <p className="mt-1 text-[13px] text-glass-sub">
                Adicione seus cartões para controlar as compras de terceiros.
              </p>
            </div>
          </div>
        )}

        {cards.map((card) => (
          <div key={card.id} className="relative">
            <div
              className="relative overflow-hidden rounded-[1.7rem] p-5 text-white shadow-[0_18px_40px_-16px_rgba(15,40,90,0.5)]"
              style={{
                background: `linear-gradient(135deg, ${card.color}, ${card.color}bb)`,
              }}
            >
              <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-black/10 blur-2xl" />

              <div className="relative flex items-center justify-between">
                <span className="text-[12.5px] font-bold tracking-widest">
                  {card.name.toUpperCase()}
                </span>
                <Wifi className="size-5 rotate-90 opacity-80" strokeWidth={2.2} />
              </div>
              <p className="amount-tabular relative mt-8 text-[18px] font-semibold tracking-[0.18em]">
                •••• •••• •••• {card.last4}
              </p>
              <div className="relative mt-6 flex items-center justify-between">
                <span className="text-[11px] font-medium text-white/75">
                  GranaScan · Cartão pessoal
                </span>
                <div className="h-6 w-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-400/90" />
              </div>
            </div>

            <button
              type="button"
              aria-label={`Excluir ${card.name}`}
              onClick={() => {
                deleteCard(card.id);
                toast("Cartão removido");
              }}
              className="absolute -top-2.5 -right-2.5 flex size-8 items-center justify-center rounded-full bg-white/90 text-[#FF3B30] shadow-md backdrop-blur transition-transform active:scale-90 dark:bg-[#111c3c]"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div className="glass rounded-3xl p-4">
        <p className="text-[15px] font-bold text-glass-ink">Adicionar cartão</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do cartão (ex.: Nubank)"
          maxLength={24}
          className={cn(inputClass, "mt-3")}
        />
        <input
          value={last4}
          onChange={(e) =>
            setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          placeholder="Últimos 4 dígitos"
          inputMode="numeric"
          maxLength={4}
          className={cn(inputClass, "mt-2.5")}
        />

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Cor
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "size-8 rounded-full transition-transform active:scale-90",
                color === c &&
                  "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          Adicionar cartão
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        As compras parceladas por terceiros no seu cartão aparecem na aba
        Empréstimos → Cartão Emprestado.
      </p>
    </div>
  );
}
