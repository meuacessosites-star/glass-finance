import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/app-store";
import { PinDots, PinKeypad } from "./PinPad";

/**
 * Full-screen lock shown inside the phone frame whenever a PIN is set and the
 * current session has not been unlocked yet. "Esqueci o PIN" clears the PIN
 * (demo recovery — there is no real account recovery in a mock-data app).
 */
export function PinLock({ onUnlocked }: { onUnlocked: () => void }) {
  const { verifyPin, removePin, activeProfile } = useAppStore();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  const handleDigit = (d: string) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError(false);
    if (next.length === 4) {
      window.setTimeout(() => {
        if (verifyPin(next)) {
          setDigits("");
          onUnlocked();
        } else {
          setError(true);
          setDigits("");
        }
      }, 140);
    }
  };

  const handleForgot = () => {
    removePin();
    setDigits("");
    onUnlocked();
    toast("PIN removido", {
      description: "Defina um novo PIN na tela de segurança.",
    });
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-gradient-to-b from-[#dcebfe] via-[#eef1fe] to-white px-8 dark:from-[#0b1630] dark:via-[#111c3c] dark:to-[#0a1122]">
      <div className="glass glass-strong flex size-16 items-center justify-center rounded-[1.4rem] shadow-[0_10px_30px_-10px_rgba(47,107,255,0.5)]">
        <LockKeyhole className="size-7 text-primary" strokeWidth={2.2} />
      </div>
      <h2 className="mt-5 text-[22px] font-bold tracking-tight text-glass-ink">
        GranaScan
      </h2>
      <p className="mt-1 text-[13.5px] text-glass-sub">
        {activeProfile?.name
          ? `Perfil “${activeProfile.name}” · digite o PIN`
          : "Digite seu PIN para continuar"}
      </p>

      <div className="mt-9">
        <PinDots length={digits.length} error={error} />
      </div>
      <p className="mt-3 h-4 text-[12.5px] font-semibold text-[#FF3B30]">
        {error ? "PIN incorreto, tente novamente" : ""}
      </p>

      <div className="mt-6 w-full max-w-[236px]">
        <PinKeypad
          onDigit={handleDigit}
          onBackspace={() => setDigits((d) => d.slice(0, -1))}
        />
      </div>

      <button
        type="button"
        onClick={handleForgot}
        className="mt-8 text-[13px] font-semibold text-glass-sub underline-offset-2 transition-colors hover:text-glass-ink hover:underline"
      >
        Esqueci o PIN
      </button>
    </div>
  );
}
