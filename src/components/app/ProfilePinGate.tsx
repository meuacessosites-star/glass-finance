import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { LockKeyhole } from "lucide-react";
import type { AppProfile } from "@/lib/app-store";
import { PinDots, PinKeypad } from "./PinPad";

/**
 * Centered PIN prompt (portaled into the phone screen) shown when switching
 * to a profile that has a PIN configured. Self-contained: it manages its own
 * digits and error state and only reports back on success or cancel.
 * Rendered above the sidebar (z-[60]) so it works even with the menu open.
 */
export function ProfilePinGate({
  profile,
  onVerified,
  onCancel,
}: {
  profile: AppProfile;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState(false);

  const handleDigit = (d: string) => {
    if (digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError(false);
    if (next.length === 4) {
      window.setTimeout(() => {
        if (profile.data.pin === next) {
          setDigits("");
          onVerified();
        } else {
          setError(true);
          setDigits("");
        }
      }, 140);
    }
  };

  const screen = document.getElementById("app-screen");
  if (!screen) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-[60] flex items-center justify-center bg-[#0b1630]/45 px-8 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
        className="glass glass-strong w-full max-w-[300px] rounded-[2rem] bg-white p-5 text-center dark:bg-[#f4f8ff]"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <LockKeyhole className="size-5 text-primary" strokeWidth={2.2} />
        </div>
        <p className="mt-3 text-[16px] font-bold text-glass-ink">
          Perfil protegido
        </p>
        <p className="mt-0.5 text-[12.5px] text-glass-sub">
          Digite o PIN de “{profile.name}” para usá-lo
        </p>
        <div className="mt-5">
          <PinDots length={digits.length} error={error} />
        </div>
        <p className="mt-2 h-4 text-[12px] font-semibold text-[#FF3B30]">
          {error ? "PIN incorreto, tente novamente" : ""}
        </p>
        <div className="mx-auto mt-3 w-full max-w-[216px]">
          <PinKeypad
            onDigit={handleDigit}
            onBackspace={() => setDigits((d) => d.slice(0, -1))}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-5 text-[13px] font-semibold text-glass-sub underline-offset-2 transition-colors hover:text-glass-ink hover:underline"
        >
          Cancelar
        </button>
      </motion.div>
    </motion.div>,
    screen,
  );
}
