import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, Users } from "lucide-react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PersonAvatar } from "./PersonAvatar";

type PersonRecord = {
  _id: string;
  name: string;
  phone?: string;
  avatarType?: "letters" | "emoji" | "foto";
  avatarValue?: string;
  avatarColor?: string;
};

type PersonSelectorProps = {
  value?: string | null;
  onValueChange: (value: string | null) => void;
  onNavigateToPeople?: () => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
};

export function PersonSelector({
  value,
  onValueChange,
  onNavigateToPeople,
  required = false,
  label = "Pessoa",
  placeholder = "Selecionar pessoa",
  className,
}: PersonSelectorProps) {
  const navigate = useNavigate();
  const people = useQuery(api.people.list) as PersonRecord[] | undefined;
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const filteredPeople = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
    if (!normalizedSearch) return people ?? [];
    return (people ?? []).filter((person) =>
      person.name.toLocaleLowerCase().includes(normalizedSearch),
    );
  }, [people, searchTerm]);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setSearchTerm("");
  };
  const goToPeople = () => {
    setOpen(false);
    setSearchTerm("");
    onNavigateToPeople?.();
    navigate("/dashboard/pessoas");
  };
  const selectedPerson = useMemo(
    () => people?.find((person) => person._id === value),
    [people, value],
  );

  function selectPerson(personId: string) {
    onValueChange(personId);
    setSearchTerm("");
    setOpen(false);
  }

  return (
    <div className={cn("mt-6", className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          {label}
          {required ? " *" : ""}
        </p>
        {required && (
          <span className="text-[11px] text-glass-sub">Obrigatório</span>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="glass flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-white/70"
              aria-label={selectedPerson?.name ?? placeholder}
            >
              {selectedPerson ? (
                <PersonAvatar
                  name={selectedPerson.name}
                  avatarType={selectedPerson.avatarType}
                  avatarValue={selectedPerson.avatarValue}
                  backgroundColor={selectedPerson.avatarColor}
                  size="sm"
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-glass-sub">
                  <Users className="size-4" />
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[14px] font-semibold",
                  selectedPerson ? "text-glass-ink" : "text-glass-sub",
                )}
              >
                {selectedPerson?.name ?? placeholder}
              </span>
              <ChevronDown className="size-4 shrink-0 text-glass-sub" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            style={{ zIndex: 70 }}
            className="glass glass-strong w-[min(22rem,calc(100vw-2rem))] bg-white p-2 dark:bg-[#f4f8ff]"
          >
            <div className="mb-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-glass-sub">
              Pessoas cadastradas
            </div>
            <div className="glass glass-soft mb-2 flex items-center gap-2 rounded-xl px-3 py-2">
              <Search className="size-4 shrink-0 text-glass-sub" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Buscar pessoa..."
                aria-label="Buscar pessoa"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {people === undefined ? (
                <p className="px-2 py-3 text-[13px] text-glass-sub">
                  Carregando pessoas...
                </p>
              ) : people.length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-glass-sub">
                  Nenhuma pessoa cadastrada ainda.
                </p>
              ) : filteredPeople.length === 0 ? (
                <p className="px-2 py-3 text-[13px] text-glass-sub">
                  Nenhuma pessoa encontrada.
                </p>
              ) : (
                filteredPeople.map((person) => (
                  <button
                    key={person._id}
                    type="button"
                    onClick={() => selectPerson(person._id)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-black/5"
                  >
                    <PersonAvatar
                      name={person.name}
                      avatarType={person.avatarType}
                      avatarValue={person.avatarValue}
                      backgroundColor={person.avatarColor}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-glass-ink">
                      {person.name}
                    </span>
                    {person._id === value && (
                      <Check className="size-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={goToPeople}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border-t border-black/5 px-2 pt-3 text-left text-[13px] font-semibold text-primary"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10">
                <Plus className="size-4" />
              </span>
              Cadastrar nova pessoa
            </button>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={goToPeople}
          className="glass flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary transition-colors hover:bg-white/70"
          aria-label="Cadastrar nova pessoa"
        >
          <Plus className="size-5" />
        </button>
      </div>

    </div>
  );
}
