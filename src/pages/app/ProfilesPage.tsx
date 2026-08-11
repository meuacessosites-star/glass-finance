import { useState } from "react";
import { Check, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { BackHeader } from "@/components/app/BackHeader";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const EMOJIS = ["🌿", "🐱", "⚡", "🌙", "🌵", "🎧", "📸", "🎮", "🍕", "🚀"];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

export default function ProfilesPage() {
  const { profiles, activeProfileId, addProfile, deleteProfile, setActiveProfile } =
    useAppStore();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome ao perfil");
      return;
    }
    addProfile({ name: trimmed, emoji });
    setName("");
    setEmoji(EMOJIS[0]);
    toast("Perfil criado e ativado");
  };

  const handleDelete = (id: string, profileName: string) => {
    const ok = deleteProfile(id);
    if (!ok) {
      toast("Não é possível excluir", {
        description: "Mantenha pelo menos um perfil na conta.",
      });
      return;
    }
    toast(`Perfil "${profileName}" excluído`);
  };

  return (
    <div className="space-y-4">
      <BackHeader title="Perfis" />

      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Users className="size-5 text-primary" />
        </div>
        <p className="text-[12.5px] leading-relaxed text-glass-sub">
          Cada perfil tem nome e avatar próprios. Toque em um perfil para usá-lo
          nesta conta.
        </p>
      </div>

      {/* Profile list */}
      <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          return (
            <div key={profile.id} className="flex items-center gap-3 py-3">
              <button
                type="button"
                onClick={() => {
                  setActiveProfile(profile.id);
                  toast(`Agora usando "${profile.name}"`);
                }}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 text-left transition-colors",
                  !active && "hover:bg-white/50",
                )}
              >
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-full text-lg shadow-[0_6px_16px_-4px_rgba(47,107,255,0.45)]",
                    active
                      ? "bg-gradient-to-br from-[#5b9dff] to-[#5856d6]"
                      : "bg-white/70",
                  )}
                >
                  {profile.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-glass-ink">
                    {profile.name}
                  </p>
                  <p className="text-[12px] text-glass-sub">
                    {active ? "Perfil ativo" : "Toque para usar"}
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
                onClick={() => handleDelete(profile.id, profile.name)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] active:scale-90"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add form */}
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
                emoji === e
                  ? "bg-primary/15 ring-2 ring-primary"
                  : "glass glass-soft",
              )}
            >
              {e}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          Criar perfil
        </button>
      </div>
    </div>
  );
}
