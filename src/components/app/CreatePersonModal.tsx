import { useState } from "react";
import { Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "./PersonAvatar";

export type CreatePersonModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
};

export function CreatePersonModal({
  open,
  onOpenChange,
  onCreated,
}: CreatePersonModalProps) {
  const createPerson = useMutation(api.people.create);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function closeAndReset(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setPhone("");
    }
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Informe o nome da pessoa");
      return;
    }

    setIsSaving(true);
    try {
      const id = await createPerson({
        name: trimmedName,
        phone: phone.trim() || undefined,
      });
      onCreated?.(String(id));
      toast.success("Pessoa cadastrada");
      closeAndReset(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar a pessoa",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogContent className="glass glass-strong border-0">
        <DialogHeader>
          <div className="mx-auto mb-2">
            <PersonAvatar name={name || "Nova pessoa"} size="lg" />
          </div>
          <DialogTitle>Nova pessoa</DialogTitle>
          <DialogDescription>
            Cadastre um contato para vinculá-lo às suas transações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block text-left">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Nome completo
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Maria Silva"
              className="mt-2 glass"
              autoFocus
            />
          </label>
          <label className="block text-left">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
              Telefone (opcional)
            </span>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(11) 99999-9999"
              inputMode="tel"
              className="mt-2 glass"
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => closeAndReset(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSaving}>
            <Plus className="mr-2 size-4" />
            {isSaving ? "Salvando..." : "Cadastrar pessoa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
