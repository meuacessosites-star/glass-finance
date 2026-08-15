import { useMemo, useState } from "react";
import { CalendarDays, Landmark, Pencil, Plus, Trash2, X } from "lucide-react";
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

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** Data da i-ésima parcela (1-based) a partir da data da primeira. */
function dueDateFor(startDate: string, index: number): string {
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return startDate;
  const absolute = month - 1 + (index - 1);
  const y = year + Math.floor(absolute / 12);
  const m = ((absolute % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(
    Math.min(day, lastDay),
  ).padStart(2, "0")}`;
}

export default function FinancingsPage() {
  const {
    financings,
    financingsInFlow,
    setFinancingsInFlow,
    activeProfile,
    categories,
    addFinancing,
    updateFinancing,
    deleteFinancing,
  } = useAppStore();

  const [name, setName] = useState("");
  const [totalCents, setTotalCents] = useState(0);
  const [installments, setInstallments] = useState(12);
  const [currentInstallment, setCurrentInstallment] = useState(1);
  const [installmentCents, setInstallmentCents] = useState(0);
  const [dueDay, setDueDay] = useState(5);
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [categoryId, setCategoryId] = useState("moradia");
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalLabel = useMemo(() => formatBRL(totalCents), [totalCents]);
  const installmentLabel = useMemo(
    () => formatBRL(installmentCents),
    [installmentCents],
  );

  const totalFinanced = financings.reduce((s, f) => s + f.totalAmount, 0);
  const monthlyTotal = financings
    .filter((f) => f.currentInstallment <= f.installments)
    .reduce((s, f) => s + f.installmentValue, 0);
  const remainingTotal = financings.reduce(
    (s, f) => s + Math.max(0, f.installments - f.currentInstallment + 1) * f.installmentValue,
    0,
  );

  const handleTotal = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setTotalCents(digits ? Number(digits) : 0);
    if (installments > 0) setInstallmentCents(Math.floor(Number(digits || 0) / installments));
  };
  const handleInstallments = (value: string) => {
    const next = Number(value.replace(/\D/g, ""));
    const clamped = Number.isFinite(next) ? Math.min(480, Math.max(1, next)) : 1;
    setInstallments(clamped);
    if (totalCents > 0) setInstallmentCents(Math.floor(totalCents / clamped));
  };

  const startEdit = (id: string) => {
    const f = financings.find((x) => x.id === id);
    if (!f) return;
    setEditingId(id);
    setName(f.name);
    setTotalCents(Math.round(f.totalAmount * 100));
    setInstallments(f.installments);
    setCurrentInstallment(f.currentInstallment);
    setInstallmentCents(Math.round(f.installmentValue * 100));
    setDueDay(f.dueDay);
    setStartDate(f.startDate);
    setCategoryId(f.categoryId ?? "moradia");
    setColor(f.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setTotalCents(0);
    setInstallments(12);
    setCurrentInstallment(1);
    setInstallmentCents(0);
    setDueDay(5);
    setStartDate(new Date().toISOString().slice(0, 10));
    setCategoryId("moradia");
    setColor(PALETTE[0]);
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome ao financiamento");
      return;
    }
    if (totalCents <= 0 || installmentCents <= 0) {
      toast("Informe o valor total e o valor da parcela");
      return;
    }
    const data = {
      name: trimmed,
      totalAmount: totalCents / 100,
      installments,
      currentInstallment: Math.min(currentInstallment, installments),
      installmentValue: installmentCents / 100,
      dueDay,
      startDate,
      categoryId: categoryId || undefined,
      color,
    };
    if (editingId) {
      updateFinancing(editingId, data);
      toast("Financiamento atualizado");
    } else {
      addFinancing(data);
      toast("Financiamento adicionado");
    }
    cancelEdit();
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Financiamentos" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Parcelas fixas de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        carro, casa, faculdade e outros.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass rounded-2xl p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-glass-sub">
            Financiado
          </p>
          <p className="amount-tabular mt-1 text-[15px] font-bold text-glass-ink">
            {formatCurrency(totalFinanced)}
          </p>
        </div>
        <div className="glass rounded-2xl p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-glass-sub">
            Parcelas/mês
          </p>
          <p className="amount-tabular mt-1 text-[15px] font-bold text-[#FF3B30]">
            {formatCurrency(monthlyTotal)}
          </p>
        </div>
        <div className="glass rounded-2xl p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-glass-sub">
            Restante
          </p>
          <p className="amount-tabular mt-1 text-[15px] font-bold text-[#FF9500]">
            {formatCurrency(remainingTotal)}
          </p>
        </div>
      </div>

      {/* Toggle: show installments in the flow */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-glass-ink">
              Mostrar parcelas junto com as transações
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-glass-sub">
              {financingsInFlow
                ? "As parcelas aparecem na tela inicial, em Transações e nos Relatórios."
                : "As parcelas ficam visíveis apenas nesta aba."}
            </p>
          </div>
          <Switch
            checked={financingsInFlow}
            onCheckedChange={(v) => {
              setFinancingsInFlow(v);
              toast(
                v
                  ? "Parcelas integradas ao fluxo"
                  : "Parcelas só nesta aba",
              );
            }}
            aria-label="Mostrar parcelas junto com as transações"
          />
        </div>
      </div>

      {/* List */}
      {financings.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#2F6BFF]/15">
            <Landmark className="size-6 text-[#2F6BFF]" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhum financiamento ainda
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Adicione seu financiamento para acompanhar parcelas e saldo devedor.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {financings.map((f) => {
            const done = f.currentInstallment > f.installments;
            const pct = Math.min(
              100,
              Math.round((f.currentInstallment / f.installments) * 100),
            );
            const nextDue = dueDateFor(f.startDate, f.currentInstallment + 1);
            return (
              <div key={f.id} className="glass rounded-3xl p-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ backgroundColor: f.color }}
                  >
                    <Landmark className="size-5" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-glass-ink">
                      {f.name}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-glass-sub">
                      Parcela {Math.min(f.currentInstallment, f.installments)} de{" "}
                      {f.installments} · {formatCurrency(f.installmentValue)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Editar ${f.name}`}
                      onClick={() => startEdit(f.id)}
                      className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${f.name}`}
                      onClick={() => {
                        deleteFinancing(f.id);
                        if (editingId === f.id) cancelEdit();
                        toast("Financiamento removido");
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
                    style={{ width: `${Math.max(3, done ? 100 : pct)}%`, backgroundColor: f.color }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-glass-faint">
                  <span>{done ? "Quitado 🎉" : `${pct}% pago`}</span>
                  {!done && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      Próxima em {formatDate(nextDue)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit form */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-bold text-glass-ink">
            {editingId ? "Editar financiamento" : "Novo financiamento"}
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
          placeholder="Nome (ex.: Carro · VW Polo)"
          maxLength={40}
          className={cn(inputClass, "mt-3")}
        />

        <div className="mt-3 text-center">
          <input
            inputMode="numeric"
            value={totalLabel}
            onChange={(e) => handleTotal(e.target.value)}
            placeholder="R$ 0,00"
            aria-label="Valor total financiado"
            className="w-full bg-transparent text-center text-[32px] font-bold tracking-tight text-[#2F6BFF] outline-none"
          />
          <div className="mx-auto mt-1 h-0.5 w-14 rounded-full bg-primary/40" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Parcelas
            </p>
            <input
              inputMode="numeric"
              value={installments}
              onChange={(e) => handleInstallments(e.target.value)}
              className={cn(inputClass, "mt-2")}
            />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Parcela atual
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={installments}
              value={currentInstallment}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCurrentInstallment(
                  Number.isFinite(next)
                    ? Math.min(installments, Math.max(1, next))
                    : 1,
                );
              }}
              className={cn(inputClass, "mt-2")}
            />
          </div>
        </div>

        <div className="mt-3 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
            Valor da parcela
          </p>
          <input
            inputMode="numeric"
            value={installmentLabel}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              setInstallmentCents(digits ? Number(digits) : 0);
            }}
            aria-label="Valor da parcela"
            className="w-full bg-transparent text-center text-[26px] font-bold tracking-tight text-glass-ink outline-none"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Dia do vencimento
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDueDay(
                  Number.isFinite(next)
                    ? Math.min(31, Math.max(1, next))
                    : 1,
                );
              }}
              className={cn(inputClass, "mt-2")}
            />
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Primeira parcela
            </p>
            <label className="glass glass-soft mt-2 flex items-center gap-2 rounded-2xl px-3.5 py-3">
              <CalendarDays className="size-4 shrink-0 text-glass-sub" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent text-[14px] font-semibold text-glass-ink outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </label>
          </div>
        </div>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Categoria
        </p>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                categoryId === c.id
                  ? "bg-primary/10 text-primary ring-2 ring-primary/40"
                  : "glass text-glass-sub",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              {c.label}
            </button>
          ))}
        </div>

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
          {editingId ? "Salvar alterações" : "Adicionar financiamento"}
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        O valor da parcela é preenchido automaticamente (total ÷ parcelas), mas
        pode ser ajustado — financiamentos têm juros, então a parcela final
        costuma ser maior.
      </p>
    </div>
  );
}
