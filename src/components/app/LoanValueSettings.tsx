import { Check } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LoanValueMode } from "@/lib/loan-value-display";
import { cn } from "@/lib/utils";

export function LoanValueSettings({
  open,
  onOpenChange,
  mode,
  onModeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: LoanValueMode;
  onModeChange: (mode: LoanValueMode) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="glass-strong flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 text-glass-ink"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("loan-value-settings-trigger")?.focus();
        }}
      >
        <DialogHeader className="shrink-0 px-5 py-4 pr-12 text-left">
          <DialogTitle>Aparência dos valores</DialogTitle>
          <DialogDescription>
            Escolha as cores e os símbolos dos valores nos registros de
            empréstimos e cartão emprestado.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-5">
          <div
            role="group"
            aria-label="Cores e símbolos dos valores"
            className="space-y-3"
          >
            {(
              [
                {
                  id: "status",
                  label: "Conforme o status",
                  description:
                    "O que falta receber fica vermelho com −. O que já foi recebido fica verde com +.",
                },
                {
                  id: "uniform",
                  label: "Todos iguais",
                  description:
                    "Todos os valores ficam verdes com +, independentemente do status.",
                },
              ] as const
            ).map(({ id, label, description }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => onModeChange(id)}
                className={cn(
                  "flex w-full gap-3 rounded-2xl border p-3 text-left",
                  mode === id
                    ? "border-primary/40 bg-primary/10"
                    : "border-black/10 bg-white/40 dark:border-white/15 dark:bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    mode === id
                      ? "border-primary bg-primary text-white"
                      : "border-glass-sub/40",
                  )}
                >
                  {mode === id && <Check className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">
                    {label}
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-glass-sub">
                    {description}
                  </span>
                  <span
                    className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-bold"
                    aria-hidden="true"
                  >
                    <span
                      className={
                        id === "status"
                          ? "text-[#d63036] dark:text-[#ff9b96]"
                          : "text-[#17a443] dark:text-[#7edb9d]"
                      }
                    >
                      {id === "status" ? "−" : "+"}R$ 125,50
                    </span>
                    <span className="text-[#17a443] dark:text-[#7edb9d]">
                      +R$ 250,00
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-glass-sub">
            Sua escolha fica salva neste perfil. Os valores e os cálculos
            continuam os mesmos.
          </p>
          <DialogClose asChild>
            <button
              type="button"
              className="min-h-11 rounded-2xl bg-primary px-4 py-3 text-[13px] font-semibold text-white"
            >
              Concluir
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
