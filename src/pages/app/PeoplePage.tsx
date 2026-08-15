import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import { initials } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type PersonRecord = Doc<"people">;

const tintFor = (name: string) => {
  const palette = ["#2F6BFF", "#AF52DE", "#1FBF4F", "#FF9500", "#FF2D55", "#00C7BE"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return palette[hash % palette.length];
};

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

/** Exibe o número armazenado (dígitos) no formato brasileiro comum. */
function formatPhone(digits: string) {
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

export default function PeoplePage() {
  const { activeProfile } = useAppStore();
  const people = useQuery(api.people.list) as PersonRecord[] | undefined;
  const createPerson = useMutation(api.people.create);
  const updatePerson = useMutation(api.people.update);
  const removePerson = useMutation(api.people.remove);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<Id<"people"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"people"> | null>(null);

  const startEdit = (id: Id<"people">) => {
    const person = people?.find((p) => p._id === id);
    if (!person) return;
    setEditingId(id);
    setName(person.name);
    setPhone(person.phone ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");
    setPhone("");
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Dê um nome à pessoa");
      return;
    }
    if (isSaving) return;

    const digits = phone.replace(/\D/g, "").slice(0, 15);
    setIsSaving(true);
    try {
      if (editingId) {
        await updatePerson({
          id: editingId,
          name: trimmed,
          phone: digits || undefined,
        });
        toast("Pessoa atualizada");
      } else {
        await createPerson({ name: trimmed, phone: digits || undefined });
        toast("Pessoa adicionada");
      }
      cancelEdit();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a pessoa",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: Id<"people">) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await removePerson({ id });
      if (editingId === id) cancelEdit();
      toast("Pessoa removida");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível remover a pessoa",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const waHref = (person: Pick<PersonRecord, "name" | "phone">) => {
    const digits = person.phone?.replace(/\D/g, "") ?? "";
    if (!digits) return null;
    const firstName = person.name.trim().split(" ")[0] || person.name;
    const message = `Oi ${firstName}! Tudo bem? Vim lembrar daquele valor combinado 😊`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Pessoas" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Contatos de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        guarde o WhatsApp ou telefone para cobranças.
      </p>

      {/* List */}
      {people === undefined ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <UserRound className="size-6 text-glass-faint" />
          </div>
          <p className="text-[13px] text-glass-sub">Carregando pessoas...</p>
        </div>
      ) : people.length === 0 ? (
        <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
            <UserRound className="size-6 text-glass-faint" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-glass-ink">
              Nenhuma pessoa ainda
            </p>
            <p className="mt-1 text-[13px] text-glass-sub">
              Adicione contatos para cobrar valores e devoluções pelo WhatsApp.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
          {people.map((person) => {
            const wa = waHref(person);
            return (
              <div key={person._id} className="flex items-center gap-3.5 py-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                  style={{ backgroundColor: tintFor(person.name) }}
                >
                  {initials(person.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-glass-ink">
                    {person.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-glass-sub">
                    {person.phone ? (
                      <>
                        <Phone className="size-3 text-glass-faint" />
                        {formatPhone(person.phone)}
                      </>
                    ) : (
                      "Sem número cadastrado"
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Cobrar ${person.name} no WhatsApp`}
                      className="flex size-9 items-center justify-center rounded-full bg-[#1FBF4F]/15 text-[#17a443] transition-transform active:scale-90"
                    >
                      <MessageCircle className="size-[17px]" strokeWidth={2.3} />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Editar ${person.name}`}
                    onClick={() => startEdit(person._id)}
                    className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${person.name}`}
                    onClick={() => void handleDelete(person._id)}
                    className="flex size-9 items-center justify-center rounded-full bg-[#FF3B30]/10 text-[#FF3B30] transition-transform active:scale-90"
                  >
                    <Trash2 className="size-4" />
                  </button>
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
            {editingId ? "Editar pessoa" : "Adicionar pessoa"}
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
          placeholder="Nome (ex.: Ana Paula)"
          maxLength={40}
          className={cn(inputClass, "mt-3")}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="WhatsApp ou telefone (ex.: 11 99999-9999)"
          inputMode="tel"
          maxLength={20}
          className={cn(inputClass, "mt-2.5")}
        />

        <button
          type="button"
          onClick={() => void handleSave()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <Plus className="size-4" />
          {editingId ? "Salvar alterações" : "Adicionar pessoa"}
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        O ícone verde abre o WhatsApp com uma mensagem de cobrança pronta. Se o
        número for só telefone, ele continua salvo aqui para consulta.
      </p>
    </div>
  );
}
