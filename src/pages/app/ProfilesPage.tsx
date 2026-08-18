import { useState } from "react";
import {
  Check,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { PinDots, PinKeypad } from "@/components/app/PinPad";
import { PinUsageSelector } from "@/components/app/PinUsageSelector";
import { ProfilePinGate } from "@/components/app/ProfilePinGate";
import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import { AvatarEditor } from "@/components/app/AvatarEditor";
import {
  useAppStore,
  type AppProfile,
  type ProfileAvatar as ProfileAvatarType,
} from "@/lib/app-store";
import { cn } from "@/lib/utils";

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

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; profile: AppProfile }
  | null;

export default function ProfilesPage() {
  const {
    profiles,
    activeProfileId,
    activeProfile,
    pinUsage,
    addProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
    setPin,
    removePin,
    verifyPin,
  } = useAppStore();

  // Avatar/name editor (create or edit)
  const [editor, setEditor] = useState<EditorState>(null);

  // Switch gate (target profile's PIN)
  const [gateProfile, setGateProfile] = useState<AppProfile | null>(null);

  // PIN section — always manages the ACTIVE profile's PIN
  const [pinMode, setPinMode] = useState<PinMode>("menu");
  const [pinStep, setPinStep] = useState<PinStep>("first");
  const [pinDigits, setPinDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState("");

  const resetPinFlow = () => {
    setPinMode("menu");
    setPinStep("first");
    setPinDigits("");
    setFirstPin("");
    setPinError("");
  };

  // ---- Profile switching (PIN-gated) ----
  const selectProfile = (profile: AppProfile) => {
    if (profile.id === activeProfileId) return;
    if (profile.data.pin) {
      setGateProfile(profile);
      return;
    }
    resetPinFlow();
    setActiveProfile(profile.id);
    toast(`Agora usando "${profile.name}"`);
  };

  const handleEditorSave = (data: {
    name: string;
    avatar: ProfileAvatarType;
  }) => {
    if (editor?.mode === "edit") {
      updateProfile(editor.profile.id, data);
      toast("Perfil atualizado", { description: "Nome e avatar salvos." });
    } else {
      addProfile(data);
      toast("Perfil criado e ativado", {
        description: "O novo perfil começa com categorias e cartões padrão.",
      });
    }
    setEditor(null);
  };

  const handleDeleteProfile = (id: string, profileName: string) => {
    const ok = deleteProfile(id);
    if (!ok) {
      toast("Não é possível excluir", {
        description: "Mantenha pelo menos um perfil na conta.",
      });
      return;
    }
    if (id === activeProfileId) resetPinFlow();
    toast(`Perfil "${profileName}" excluído`);
  };

  // ---- PIN section flow (active profile) ----
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
          Cada perfil tem categorias, cartões e PIN próprios. Toque no lápis
          para editar nome e avatar (emoji ou foto).
        </p>
      </div>

      {/* Profile list */}
      <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          const protectedProfile = !!profile.data.pin;
          return (
            <div key={profile.id} className="flex items-center gap-1.5 py-3">
              <button
                type="button"
                onClick={() => selectProfile(profile)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 text-left transition-colors",
                  !active && "hover:bg-white/50",
                )}
              >
                <div className="relative shrink-0">
                  <ProfileAvatar
                    profile={profile}
                    className={cn(
                      "size-11 shadow-[0_6px_16px_-4px_rgba(47,107,255,0.45)]",
                      active &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-white/60",
                    )}
                    emojiClassName="text-lg"
                  />
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
                aria-label={`Editar ${profile.name}`}
                onClick={() => setEditor({ mode: "edit", profile })}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-primary/10 hover:text-primary active:scale-90"
              >
                <Pencil className="size-4" />
              </button>
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

      {/* Add profile — opens the same editor used for editing */}
      <button
        type="button"
        onClick={() => setEditor({ mode: "create" })}
        className="glass flex w-full items-center justify-center gap-2 rounded-3xl py-4 text-[15px] font-semibold text-primary transition-colors hover:bg-white/60 active:scale-[0.99]"
      >
        <Plus className="size-4" strokeWidth={2.5} />
        Adicionar perfil
      </button>

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
                ? pinUsage === "open"
                  ? `"${activeProfile?.name}" pede PIN ao abrir e ao trocar de perfil`
                  : `"${activeProfile?.name}" pede PIN só ao trocar de perfil`
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
            <div className="mt-4 border-t border-black/5 pt-4">
              <PinUsageSelector />
            </div>
            <p className="mt-4 px-1 text-[12px] leading-relaxed text-glass-faint">
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
            resetPinFlow();
            setActiveProfile(target.id);
            toast(`Agora usando "${target.name}"`);
          }}
          onCancel={() => setGateProfile(null)}
        />
      )}

      {/* Create / edit profile sheet */}
      <AvatarEditor
        open={editor !== null}
        profile={editor?.mode === "edit" ? editor.profile : null}
        onSave={handleEditorSave}
        onClose={() => setEditor(null)}
      />
    </div>
  );
}
