import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCategoryMonthlyLimit } from "@/lib/report-budgets";

export function ReportCategoryLimitEditor({
  monthlyLimit,
  onSave,
  onCancel,
}: {
  monthlyLimit: number | null;
  onSave: (amount: number | null) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"fixed" | "none">(
    monthlyLimit === null ? "none" : "fixed",
  );
  const [input, setInput] = useState(
    monthlyLimit?.toFixed(2).replace(".", ",") ?? "",
  );
  const amount = parseCategoryMonthlyLimit(input);
  return (
    <form
      className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (mode === "none" || amount !== null)
          onSave(mode === "none" ? null : amount);
      }}
    >
      <h3 className="text-[13px] font-bold">Limite desta categoria</h3>
      <div
        role="group"
        aria-label="Como acompanhar os gastos"
        className="grid grid-cols-2 gap-2"
      >
        {(
          [
            { id: "fixed", label: "Definir limite" },
            { id: "none", label: "Sem limite" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={mode === option.id}
            onClick={() => setMode(option.id)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[12px] font-semibold",
              mode === option.id
                ? "border-primary bg-primary text-white"
                : "border-glass-ink/15 bg-white/40 text-glass-sub dark:bg-white/5",
            )}
          >
            {mode === option.id && <Check className="size-3.5 shrink-0" />}
            {option.label}
          </button>
        ))}
      </div>
      {mode === "fixed" ? (
        <label className="block text-[12px] font-semibold">
          Valor mensal (R$)
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            inputMode="decimal"
            type="text"
            autoComplete="off"
            placeholder="Ex.: 500,00"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-glass-ink/15 bg-white/60 px-3 text-[16px] text-glass-ink outline-none focus:border-primary dark:bg-white/5"
          />
          <span className="mt-1 block text-[11px] font-normal text-glass-sub">
            Esse valor será usado para cada mês. Os gastos registrados continuam
            os mesmos.
          </span>
        </label>
      ) : (
        <p className="text-[12px] leading-relaxed text-glass-sub">
          Acompanhe o total gasto e a média dos meses anteriores, sem definir um
          teto de gastos.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mode === "fixed" && amount === null}
          className="min-h-11 flex-1 rounded-xl bg-primary px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Salvar escolha
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl px-3 py-2 text-[13px] font-semibold text-glass-sub"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
