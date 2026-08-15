import { useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, Target, Trash2, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import {
  formatCurrency,
  monthKey,
  monthTotals,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#FF9500",
  "#2F6BFF",
  "#AF52DE",
  "#1FBF4F",
  "#FF2D55",
  "#00C7BE",
  "#5856D6",
  "#0A84FF",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return Infinity;
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export default function GoalsPage() {
  const {
    goals,
    activeProfile,
    visibleTransactions,
    addGoal,
    updateGoal,
    deleteGoal,
  } = useAppStore();

  const [name, setName] = useState("");
  const [targetCents, setTargetCents] = useState(0);
  const [savedCents, setSavedCents] = useState(0);
  const [deadline, setDeadline] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sobra média mensal do perfil (receitas − despesas) em todos os meses.
  const monthlySurplus = useMemo(() => {
    const keys = [
      ...new Set(visibleTransactions.map((t) => monthKey(t.date))),
    ];
    const surpluses = keys.map((key) => {
      const { income, expense } = monthTotals(visibleTransactions, key);
      return income - expense;
    });
    if (surpluses.length === 0) return 0;
    return surpluses.reduce((s, x) => s + x, 0) / surpluses.length;
  }, [visibleTransactions]);

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const completedCount = goals.filter((g) => g.savedAmount >= g.targetAmount).length;
  const today = new Date().toISOString().slice(0, 10);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome à meta");
      return;
    }
    if (targetCents <= 0) {
      toast("Informe um valor alvo maior que zero");
      return;
    }
    const data = {
      name: trimmed,
      targetAmount: targetCents / 100,
      savedAmount: Math.min(savedCents, targetCents) / 100,
      deadline: deadline || undefined,
      color,
    };
    if (editingId) {
      updateGoal(editingId, data);
      toast("Meta atualizada");
    } else {
      addGoal(data);
      toast("Meta criada 🎯");
    }
    cancelEdit();
  };

  const startEdit = (id: string) => {
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    setEditingId(id);
    setName(g.name);
    setTargetCents(Math.round(g.targetAmount * 100));
    setSavedCents(Math.round(g.savedAmount * 100));
    setDeadline(g.deadline ?? "");
    setColor(g.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setTargetCents(0);
    setSavedCents(0);
    setDeadline("");
    setColor(PALETTE[0]);
  };

  /** Dica individual calculada com base no perfil do usuário. */
  const tipFor = (g: { targetAmount: number; savedAmount: number; deadline?: string }) => {
    const remaining = Math.max(0, g.targetAmount - g.savedAmount);
    if (remaining <= 0) {
      return {
        tone: "positive" as const,
        text: "Meta concluída! 🎉 Que tal definir a próxima?",
      };
    }
    const pct = Math.round((g.savedAmount / g.targetAmount) * 100);
    if (!g.deadline) {
      const months = monthlySurplus > 0 ? Math.ceil(remaining / monthlySurplus) : Infinity;
      return {
        tone: "info" as const,
        text:
          months === Infinity
            ? `Faltam ${formatCurrency(remaining)}. Com sua sobra atual, ainda não dá para estimar um prazo.`
            : `Faltam ${formatCurrency(remaining)} (${pct}%). Com sua sobra média de ${formatCurrency(
                monthlySurplus,
              )}/mês, você conclui em cerca de ${months} ${months === 1 ? "mês" : "meses"}.`,
      };
    }
    const monthsLeft = monthsBetween(today, g.deadline);
    if (monthsLeft <= 0) {
      return {
        tone: "warning" as const,
        text: `O prazo (${g.deadline.split("-").reverse().join("/")}) já chegou — redefina a data ou aumente o valor guardado.`,
      };
    }
    const needed = remaining / monthsLeft;
    if (needed <= monthlySurplus * 0.9) {
      return {
        tone: "positive" as const,
        text: `Guardando ${formatCurrency(needed)}/mês você chega em ${monthsLeft} ${monthsLeft === 1 ? "mês" : "meses"} — dentro da sua capacidade de ${formatCurrency(monthlySurplus)}/mês.`,
      };
    }
    return {
      tone: "warning" as const,
      text: `Precisaria guardar ${formatCurrency(needed)}/mês, acima da sua sobra de ${formatCurrency(
        monthlySurplus,
      )}/mês. Considere estender o prazo ou reduzir a meta.`,
    };
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Metas" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Objetivos de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        defina, acompanhe e receba dicas do seu próprio perfil.
      </p>

      {/* Summary */}
      <div className="glass glass-strong relative overflow-hidden rounded-[1.8rem] p-4">
        <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[#FF9500]/20 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#FF9500]/15">
            <Target className="size-6 text-[#FF9500]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-glass-sub">
              {completedCount} de {goals.length} concluídas
            </p>
            <p className="amount-tabular mt-0.5 text-[20px] font-bold leading-none text-glass-ink">
              {formatCurrency(totalSaved)}
              <span className="text-[13px] font-semibold text-glass-faint">
                {" "}
                de {formatCurrency(totalTarget)}
              </span>
            </p>
          </div>
          <TrendingUp className="size-5 shrink-0 text-[#17a443]" />
        </div>
      </div>

      {/* Capacity insight */}
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1FBF4F]/15">
          <TrendingUp className="size-4 text-[#17a443]" />
        </div>
        <p className="text-[12.5px] leading-relaxed text-glass-sub">
          Sua <span className="font-bold text-glass-ink">sobra média mensal</span> é{" "}
          <span className="amount-tabular font-bold text-[#17a443]">
            {formatCurrency(monthlySurplus)}
          </span>
          . É por isso que suas metas sabem quanto você consegue guardar.
        </p>
      </div>

      {/* List */}
      {goals.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#FF9500]/15">
            <Target className="size-6 text-[#FF9500]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma meta ainda
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Crie um objetivo (viagem, reserva de emergência, investimento) e
              receba dicas de como alcançá-lo.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const pct = Math.min(
              100,
              Math.round((g.savedAmount / g.targetAmount) * 100),
            );
            const done = g.savedAmount >= g.targetAmount;
            const tip = tipFor(g);
            return (
              <div key={g.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ backgroundColor: g.color }}
                  >
                    <Target className="size-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-glass-ink">
                      {g.name}
                    </p>
                    <p className="amount-tabular mt-0.5 text-[13.5px] font-semibold text-glass-sub">
                      {formatCurrency(g.savedAmount)}{" "}
                      <span className="text-glass-faint">de {formatCurrency(g.targetAmount)}</span>
                      {g.deadline && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-[11.5px] text-glass-faint">
                          <CalendarClock className="size-3" />
                          até {g.deadline.split("-").reverse().join("/")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Editar ${g.name}`}
                      onClick={() => startEdit(g.id)}
                      className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${g.name}`}
                      onClick={() => {
                        deleteGoal(g.id);
                        if (editingId === g.id) cancelEdit();
                        toast("Meta removida");
                      }}
                      className="flex size-9 items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30] transition-transform active:scale-90"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-black/25">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(3, done ? 100 : pct)}%`, backgroundColor: g.color }}
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 rounded-2xl px-3 py-2 text-[12px] leading-relaxed",
                    tip.tone === "positive" && "bg-[#1FBF4F]/10 text-[#17a443]",
                    tip.tone === "warning" && "bg-[#FF9500]/10 text-[#c77700]",
                    tip.tone === "info" && "bg-primary/5 text-glass-sub",
                  )}
                >
                  {tip.text}
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
            {editingId ? "Editar meta" : "Nova meta"}
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
          placeholder="Nome (ex.: Viagem para o Japão)"
          maxLength={40}
          className={cn(inputClass, "mt-3")}
        />

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Valor alvo
            </p>
            <input
              inputMode="numeric"
              value={formatBRL(targetCents)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setTargetCents(digits ? Number(digits) : 0);
              }}
              aria-label="Valor alvo"
              className={cn(inputClass, "mt-2 text-center")}
            />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Já guardado
            </p>
            <input
              inputMode="numeric"
              value={formatBRL(savedCents)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setSavedCents(digits ? Number(digits) : 0);
              }}
              aria-label="Valor já guardado"
              className={cn(inputClass, "mt-2 text-center")}
            />
          </div>
        </div>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Prazo <span className="normal-case text-glass-faint">(opcional)</span>
        </p>
        <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
          <CalendarClock className="size-4 shrink-0 text-glass-sub" />
          <input
            type="date"
            value={deadline}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </label>

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
          onClick={handleSave}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          {editingId ? "Salvar alterações" : "Criar meta"}
        </button>
      </div>
    </div>
  );
}
