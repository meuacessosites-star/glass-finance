import { useState } from "react";
import { LockKeyhole, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { BackHeader } from "@/components/app/BackHeader";
import { PinDots, PinKeypad } from "@/components/app/PinPad";
import { useAppStore } from "@/lib/app-store";

type Mode = "menu" | "create" | "change" | "remove";
type Step = "current" | "first" | "confirm";

const stepLabel: Record<Mode, Record<Step, string>> = {
  menu: { current: "", first: "", confirm: "" },
  create: {
    current: "",
    first: "Digite um PIN de 4 dígitos",
    confirm: "Confirme o PIN",
  },
  change: {
    current: "Digite o PIN atual",
    first: "Digite o novo PIN",
    confirm: "Confirme o novo PIN",
  },
  remove: { current: "Digite seu PIN para remover", first: "", confirm: "" },
};

export default function PinPage() {
  const { pin, setPin, removePin, verifyPin } = useAppStore();
  const [mode, setMode] = useState<Mode>("menu");
  const [step, setStep] = useState<Step>("first");
  const [digits, setDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");

  const reset = () => {
    setMode("menu");
    setStep("first");
    setDigits("");
    setFirstPin("");
    setError("");
  };

  const fail = (message: string) => {
    setError(message);
    setDigits("");
  };

  const handleDigit = (d: string) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError("");
    if (next.length < 4) return;

    window.setTimeout(() => {
      if (step === "current") {
        if (!verifyPin(next)) {
          fail("PIN incorreto, tente novamente");
          return;
        }
        if (mode === "remove") {
          removePin();
          toast("PIN removido", {
            description: "Seu app não pede mais senha para abrir.",
          });
          reset();
          return;
        }
        // change → ask for the new PIN
        setStep("first");
        setDigits("");
        return;
      }
      if (step === "first") {
        setFirstPin(next);
        setStep("confirm");
        setDigits("");
        return;
      }
      // confirm
      if (next === firstPin) {
        setPin(next);
        toast(mode === "create" ? "PIN criado" : "PIN atualizado", {
          description:
            "O app agora pede o PIN para abrir — digite-o na próxima tela.",
        });
        reset();
        return;
      }
      setStep("first");
      fail("Os PINs não conferem. Digite o novo PIN novamente.");
    }, 140);
  };

  const handleBack = () => {
    if (mode === "menu") return;
    if (step === "confirm") {
      setStep("first");
      setDigits("");
      setError("");
      return;
    }
    if (step === "first" && mode === "change") {
      setStep("current");
      setDigits("");
      setError("");
      return;
    }
    reset();
  };

  return (
    <div className="space-y-4">
      <BackHeader title="PIN" />

      {/* Status + actions */}
      {mode === "menu" ? (
        <>
          <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                pin ? "bg-[#1FBF4F]/15" : "bg-[#FF9500]/15"
              }`}
            >
              {pin ? (
                <ShieldCheck className="size-5 text-[#17a443]" />
              ) : (
                <ShieldOff className="size-5 text-[#d97b00]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold text-glass-ink">
                {pin ? "Proteção ativada" : "Proteção desativada"}
              </p>
              <p className="text-[12.5px] text-glass-sub">
                {pin
                  ? "O app pede o PIN de 4 dígitos para abrir."
                  : "Crie um PIN para proteger seu app."}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setMode(pin ? "change" : "create");
                setStep(pin ? "current" : "first");
                setDigits("");
                setError("");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
            >
              <LockKeyhole className="size-4" />
              {pin ? "Trocar PIN" : "Criar PIN"}
            </button>
            {pin && (
              <button
                type="button"
                onClick={() => {
                  setMode("remove");
                  setStep("current");
                  setDigits("");
                  setError("");
                }}
                className="glass glass-strong flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14.5px] font-semibold text-[#FF3B30] transition-colors hover:brightness-105 active:scale-[0.98]"
              >
                Remover PIN
              </button>
            )}
          </div>

          <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
            Se esquecer o PIN, use “Esqueci o PIN” na tela de bloqueio — ele
            será removido para você criar um novo.
          </p>
        </>
      ) : (
        <>
          <div className="glass rounded-3xl p-4 text-center">
            <p className="text-[14.5px] font-semibold text-glass-ink">
              {stepLabel[mode][step]}
            </p>
            <div className="mt-6">
              <PinDots length={digits.length} error={!!error} />
            </div>
            <p className="mt-3 h-4 text-[12.5px] font-semibold text-[#FF3B30]">
              {error}
            </p>
            <div className="mx-auto mt-4 w-full max-w-[236px]">
              <PinKeypad
                onDigit={handleDigit}
                onBackspace={() => setDigits((d) => d.slice(0, -1))}
              />
            </div>
            <button
              type="button"
              onClick={handleBack}
              className="mt-6 text-[13px] font-semibold text-glass-sub underline-offset-2 transition-colors hover:text-glass-ink hover:underline"
            >
              {step === "current"
                ? "Cancelar"
                : step === "first" && mode === "change"
                  ? "Voltar"
                  : "Recomeçar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
