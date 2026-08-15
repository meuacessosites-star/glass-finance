import { useMemo, useState } from "react";
import { Pencil, PiggyBank, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/lib/app-store";
import { formatCurrency } from "@/lib/mock-data";
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
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

export default function ReservesPage() {
  const {
    reserves,
    reservesInBalance,
    setReservesInBalance,
    activeProfile,
    addReserve,
    updateReserve,
    deleteReserve,
  } = useAppStore();

  const [name, setName] = useState("");
  const [cents, setCents] = useState(0);
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reservesTotal = useMemo(
    () => reserves.reduce((s, r) => s + r.amount, 0),
    [reserves],
  );
  const amountLabel = useMemo(
    () =>
      (cents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
    [cents],
  );

  const startEdit = (id: string) => {
    const reserve = reserves.find((r) => r.id === id);
    if (!reserve) return;
    setEditingId(id);
    setName(reserve.name);
    setCents(Math.round(reserve.amount * 100));
    setColor(reserve.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setCents(0);
    setColor(PALETTE[0]);
  };

  const handleAmount = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setCents(digits ? Number(digits) : 0);
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome ao cofrinho");
      return;
    }
    if (cents <= 0) {
      toast("Informe um valor maior que zero");
      return;
    }
    const amount = cents / 100;
    if (editingId) {
      updateReserve(editingId, { name: trimmed, amount, color });
      toast("Cofrinho atualizado");
    } else {
      addReserve({ name: trimmed, amount, color });
      toast("Cofrinho criado");
    }
    cancelEdit();
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Reservas" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Cofrinhos e reservas de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        guarde dinheiro para objetivos (viagem, investimento, emergência).
      </p>

      {/* Summary */}
      <div className="glass glass-strong relative overflow-hidden rounded-[1.8rem] p-4">
        <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[#1FBF4F]/20 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1FBF4F]/15">
            <PiggyBank className="size-6 text-[#17a443]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-glass-sub">
              Guardado em reservas
            </p>
            <p className="amount-tabular mt-0.5 text-[24px] font-bold leading-none text-glass-ink">
              {formatCurrency(reservesTotal)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white/50 px-2.5 py-1 text-[11px] font-semibold text-glass-sub">
            {reserves.length} {reserves.length === 1 ? "cofrinho" : "cofrinhos"}
          </span>
        </div>
      </div>

      {/* Toggle: include in balance */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-glass-ink">
              Incluir reservas no saldo da tela inicial
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-glass-sub">
              {reservesInBalance
                ? "O saldo na tela inicial mostra tudo junto (reservas incluídas)."
                : "O saldo na tela inicial mostra só o valor disponível; as reservas ficam visíveis apenas aqui."}
            </p>
          </div>
          <Switch
            checked={reservesInBalance}
            onCheckedChange={(v) => {
              setReservesInBalance(v);
              toast(
                v
                  ? "Reservas aparecem junto com o saldo"
                  : "Reservas separadas do saldo",
              );
            }}
            aria-label="Incluir reservas no saldo da tela inicial"
          />
        </div>
      </div>

      {/* List */}
      {reserves.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#1FBF4F]/15">
            <PiggyBank className="size-6 text-[#17a443]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhum cofrinho ainda
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Crie reservas para separar dinheiro dos seus objetivos.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reserves.map((r) => {
            const pct =
              reservesTotal > 0 ? Math.round((r.amount / reservesTotal) * 100) : 0;
            return (
              <div key={r.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ backgroundColor: r.color }}
                  >
                    <PiggyBank className="size-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-glass-ink">
                      {r.name}
                    </p>
                    <p className="amount-tabular mt-0.5 text-[15px] font-bold text-glass-ink">
                      {formatCurrency(r.amount)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Editar ${r.name}`}
                      onClick={() => startEdit(r.id)}
                      className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${r.name}`}
                      onClick={() => {
                        deleteReserve(r.id);
                        if (editingId === r.id) cancelEdit();
                        toast("Cofrinho removido");
                      }}
                      className="flex size-9 items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30] transition-transform active:scale-90"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-black/25">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: r.color }}
                  />
                </div>
                <p className="mt-1 text-[11.5px] text-glass-faint">
                  {pct}% do total reservado
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit form */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-glass-ink">
            {editingId ? "Editar cofrinho" : "Novo cofrinho"}
          </p>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="flex items-center gap-1 rounded-full bg-black/5 px-2.5 py-1 text-[12px] font-semibold text-glass-sub transition-colors active:scale-95"
            >
              <X className="size-3.5" />
              Cancelar
            </button>
          )}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Viagem, Investimentos, Emergência)"
          maxLength={30}
          className={cn(inputClass, "mt-3")}
        />
        <div className="mt-3 text-center">
          <input
            inputMode="numeric"
            value={amountLabel}
            onChange={(e) => handleAmount(e.target.value)}
            placeholder="R$ 0,00"
            aria-label="Valor reservado"
            className="w-full bg-transparent text-center text-[34px] font-bold tracking-tight text-[#17a443] outline-none"
          />
          <div className="mx-auto mt-1 h-0.5 w-14 rounded-full bg-[#1FBF4F]/40" />
        </div>

        <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
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
          onClick={handleSave}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          {editingId ? "Salvar alterações" : "Adicionar cofrinho"}
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        As reservas são contabilizadas à parte do histórico: ao criar um
        cofrinho, o valor fica guardado aqui e pode aparecer junto ou separado
        do saldo da tela inicial, conforme o botão acima.
      </p>
    </div>
  );
}
