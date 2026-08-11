import { useEffect, useState } from "react";
import {
  Check,
  LockKeyhole,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { PinDots, PinKeypad } from "@/components/app/PinPad";
import { ProfilePinGate } from "@/components/app/ProfilePinGate";
import { useAppStore, type AppProfile } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const EMOJIS = ["🌿", "🐱", "⚡", "🌙", "🌵", "🎧", "📸", "🎮", "🍕", "🚀"];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

type PinMode = "menu" | "create" | "change" | "remove";
type PinStep = "current" | "first" | "confirm";

const stepLabel: Record<PinMode, Record<PinStep, string>> = {
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

export default function ProfilesPage() {
  const {
    profiles,
    activeProfileId,
    activeProfile,
    addProfile,
    deleteProfile,
    setActiveProfile,
    setPin,
    removePin,
    verifyPin,
  } = useAppStore();

  // New profile form
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  // Switch gate (target profile's PIN)
  const [gateProfile, setGateProfile] = useState<AppProfile | null>(null);

  // PIN section — always manages the ACTIVE profile's PIN
  const [pinMode, setPinMode] = useState<PinMode>("menu");
  const [pinStep, setPinStep] = useState<PinStep>("first");
  const [pinDigits, setPinDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState("");

  // When the active profile changes, reset the PIN section to its status view.
  useEffect(() => {
    setPinMode("menu");
    setPinStep("first");
    setPinDigits("");
    setFirstPin("");
    setPinError("");
  }, [activeProfileId]);

  // ---- Profile switching (PIN-gated) ----
  const selectProfile = (profile: AppProfile) => {
    if (profile.id === activeProfileId) return;
    if (profile.data.pin) {
      setGateProfile(profile);
      return;
    }
    setActiveProfile(profile.id);
    toast(`Agora usando "${profile.name}"`);
  };

  const handleAddProfile = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome ao perfil");
      return;
    }
    addProfile({ name: trimmed, emoji });
    setName("");
    setEmoji(EMOJIS[0]);
    toast("Perfil criado e ativado", {
      description: "O novo perfil começa com categorias e cartões padrão.",
    });
  };

  const handleDeleteProfile = (id: string, profileName: string) => {
    const ok = deleteProfile(id);
    if (!ok) {
      toast("Não é possível excluir", {
        description: "Mantenha pelo menos um perfil na conta.",
      });
      return;
    }
    toast(`Perfil "${profileName}" excluído`);
  };

  // ---- PIN section flow (active profile) ----
  const resetPinFlow = () => {
    setPinMode("menu");
    setPinStep("first");
    setPinDigits("");
    setFirstPin("");
    setPinError("");
  };

  const handlePinDigit = (d: string) => {
    if (pinDigits.length >= 4) return;
    const next = pinDigits + d;
    setPinDigits(next);
    setPinError("");
    if (next.length < 4) return;

    window.setTimeout(() => {
      if (pinStep === "current") {
        if (!verifyPin(next)) {
          setPinError("PIN incorreto, tente novamente");
          setPinDigits("");
          return;
        }
        if (pinMode === "remove") {
          removePin();
          toast("PIN removido", {
            description: `"${activeProfile?.name}" não pede mais senha.`,
          });
          resetPinFlow();
          return;
        }
        setPinStep("first");
        setPinDigits("");
        return;
      }
      if (pinStep === "first") {
        setFirstPin(next);
        setPinStep("confirm");
        setPinDigits("");
        return;
      }
      if (next === firstPin) {
        setPin(next);
        toast(pinMode === "create" ? "PIN criado" : "PIN atualizado", {
          description:
            "O PIN será pedido ao abrir o app ou ao trocar para este perfil.",
        });
        resetPinFlow();
        return;
      }
      setPinStep("first");
      setPinError("Os PINs não conferem. Digite o novo PIN novamente.");
      setPinDigits("");
    }, 140);
  };

  const handlePinBack = () => {
    if (pinStep === "confirm") {
      setPinStep("first");
      setPinDigits("");
      setPinError("");
      return;
    }
    if (pinStep === "first" && pinMode === "change") {
      setPinStep("current");
      setPinDigits("");
      setPinError("");
      return;
    }
    resetPinFlow();
  };

  const activePin = !!activeProfile?.data.pin;

  return (
    <div className="space-y-4">
      <SettingsHeader title="Perfis" />

      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Users className="size-5 text-primary" />
        </div>
        <p className="text-[12.5px] leading-relaxed text-glass-sub">
          Cada perfil tem categorias, cartões e PIN próprios. Perfis protegidos
          por PIN pedem a senha na hora de trocar.
        </p>
      </div>

      {/* Profile list */}
      <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          const protectedProfile = !!profile.data.pin;
          return (
            <div key={profile.id} className="flex items-center gap-2 py-3">
              <button
                type="button"
                onClick={() => selectProfile(profile)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 text-left transition-colors",
                  !active && "hover:bg-white/50",
                )}
              >
                <div
                  className={cn(
                    "relative flex size-11 shrink-0 items-center justify-center rounded-full text-lg shadow-[0_6px_16px_-4px_rgba(47,107,255,0.45)]",
                    active
                      ? "bg-gradient-to-br from-[#5b9dff] to-[#5856d6]"
                      : "bg-white/70",
                  )}
                >
                  {profile.emoji}
                  {protectedProfile && (
                    <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#2F6BFF] shadow">
                      <LockKeyhole className="size-2.5 text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-glass-ink">
                    {profile.name}
                  </p>
                  <p className="truncate text-[12px] text-glass-sub">
                    {active
                      ? "Perfil ativo"
                      : protectedProfile
                        ? "Protegido por PIN"
                        : "Toque para usar"}
                  </p>
                </div>
              </button>
              {active && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1FBF4F]/15">
                  <Check className="size-3.5 text-[#17a443]" strokeWidth={3} />
                </span>
              )}
              <button
                type="button"
                aria-label={`Excluir ${profile.name}`}
                onClick={() => handleDeleteProfile(profile.id, profile.name)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] active:scale-90"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* New profile form */}
      <div className="glass rounded-3xl p-4">
        <p className="text-[15px] font-bold text-glass-ink">Novo perfil</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (ex.: Família, Trabalho…)"
          maxLength={24}
          className={cn(inputClass, "mt-3")}
        />
        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Avatar
        </p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Avatar ${e}`}
              onClick={() => setEmoji(e)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-2xl text-xl transition-all",
                emoji === e ? "bg-primary/15 ring-2 ring-primary" : "glass glass-soft",
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAddProfile}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          Criar perfil
        </button>
      </div>

      {/* PIN section — always the active profile's PIN */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl",
              activePin ? "bg-[#1FBF4F]/15" : "bg-[#FF9500]/15",
            )}
          >
            {activePin ? (
              <ShieldCheck className="size-5 text-[#17a443]" />
            ) : (
              <ShieldOff className="size-5 text-[#d97b00]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold text-glass-ink">
              PIN de segurança
            </p>
            <p className="text-[12.5px] text-glass-sub">
              {activePin
                ? `"${activeProfile?.name}" pede PIN ao abrir e ao trocar de perfil`
                : `Sem PIN em "${activeProfile?.name}"`}
            </p>
          </div>
        </div>

        {pinMode === "menu" ? (
          <>
            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setPinMode(activePin ? "change" : "create");
                  setPinStep(activePin ? "current" : "first");
                  setPinDigits("");
                  setPinError("");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
              >
                <LockKeyhole className="size-4" />
                {activePin ? "Trocar PIN" : "Criar PIN"}
              </button>
              {activePin && (
                <button
                  type="button"
                  onClick={() => {
                    setPinMode("remove");
                    setPinStep("current");
                    setPinDigits("");
                    setPinError("");
                  }}
                  className="glass glass-strong flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14.5px] font-semibold text-[#FF3B30] transition-colors hover:brightness-105 active:scale-[0.98]"
                >
                  Remover PIN
                </button>
              )}
            </div>
            <p className="mt-3 px-1 text-[12px] leading-relaxed text-glass-faint">
              Se esquecer o PIN, use “Esqueci o PIN” na tela de bloqueio — ele é
              removido para você criar um novo.
            </p>
          </>
        ) : (
          <div className="text-center">
            <p className="mt-4 text-[14px] font-semibold text-glass-ink">
              {stepLabel[pinMode][pinStep]}
            </p>
            <div className="mt-5">
              <PinDots length={pinDigits.length} error={!!pinError} />
            </div>
            <p className="mt-2 h-4 text-[12px] font-semibold text-[#FF3B30]">
              {pinError}
            </p>
            <div className="mx-auto mt-3 w-full max-w-[216px]">
              <PinKeypad
                onDigit={handlePinDigit}
                onBackspace={() => setPinDigits((d) => d.slice(0, -1))}
              />
            </div>
            <button
              type="button"
              onClick={handlePinBack}
              className="mt-4 text-[13px] font-semibold text-glass-sub underline-offset-2 transition-colors hover:text-glass-ink hover:underline"
            >
              {pinStep === "current"
                ? "Cancelar"
                : pinStep === "first" && pinMode === "change"
                  ? "Voltar"
                  : "Recomeçar"}
            </button>
          </div>
        )}
      </div>

      {/* Switch gate */}
      {gateProfile && (
        <ProfilePinGate
          profile={gateProfile}
          onVerified={() => {
            const target = gateProfile;
            setGateProfile(null);
            setActiveProfile(target.id);
            toast(`Agora usando "${target.name}"`);
          }}
          onCancel={() => setGateProfile(null)}
        />
      )}
    </div>
  );
}
