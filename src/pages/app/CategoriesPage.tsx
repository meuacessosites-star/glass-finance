import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BackHeader } from "@/components/app/BackHeader";
import { CategoryIcon, categoryIconOptions } from "@/components/app/CategoryIcon";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#2F6BFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#FF6482",
  "#FF9500",
  "#FF9F0A",
  "#1FBF4F",
  "#00C7BE",
  "#32ADE6",
  "#0A84FF",
  "#8E8E93",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

export default function CategoriesPage() {
  const { categories, activeProfile, addCategory, updateCategory, deleteCategory } =
    useAppStore();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState(categoryIconOptions[0].id);
  const [editingId, setEditingId] = useState<string | null>(null);

  const startEdit = (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    setEditingId(id);
    setLabel(category.label);
    setColor(category.color);
    setIcon(category.icon);
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel("");
    setColor(PALETTE[0]);
    setIcon(categoryIconOptions[0].id);
  };

  const handleSave = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast("Digite um nome para a categoria");
      return;
    }
    if (editingId) {
      updateCategory(editingId, { label: trimmed, color, icon });
      toast("Categoria atualizada");
    } else {
      addCategory({ label: trimmed, color, icon });
      toast("Categoria criada");
    }
    resetForm();
  };

  const handleDelete = (id: string, name: string) => {
    deleteCategory(id);
    if (editingId === id) resetForm();
    toast("Categoria removida", {
      description: `As transações de "${name}" passam a aparecer como Outros.`,
    });
  };

  return (
    <div className="space-y-4">
      <BackHeader title="Categorias" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Categorias de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        cada perfil tem as suas.
      </p>

      {/* List */}
      <div className="glass divide-y divide-black/5 rounded-3xl px-4 py-1.5">
        {categories.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-glass-sub">
            Nenhuma categoria ainda. Crie a primeira abaixo.
          </p>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="flex items-center gap-3 py-3">
              <CategoryIcon
                categoryId={category.id}
                size="size-10"
                iconSize="size-[18px]"
              />
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-glass-ink">
                {category.label}
              </p>
              <button
                type="button"
                aria-label={`Editar ${category.label}`}
                onClick={() => startEdit(category.id)}
                className="flex size-8 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-white/60 active:scale-90"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Excluir ${category.label}`}
                onClick={() => handleDelete(category.id, category.label)}
                className="flex size-8 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] active:scale-90"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add / edit form */}
      <div className="glass rounded-3xl p-4">
        <p className="text-[15px] font-bold text-glass-ink">
          {editingId ? "Editar categoria" : "Nova categoria"}
        </p>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Mercado, Pets, Viagem…"
          maxLength={24}
          className={cn(inputClass, "mt-3")}
        />

        {/* Icon picker */}
        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Ícone
        </p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {categoryIconOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-label={`Ícone ${option.id}`}
              onClick={() => setIcon(option.id)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-2xl transition-all",
                icon === option.id
                  ? "bg-primary/15 ring-2 ring-primary"
                  : "glass glass-soft text-glass-sub hover:text-glass-ink",
              )}
            >
              <option.icon className="size-5" />
            </button>
          ))}
        </div>

        {/* Color picker */}
        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Cor
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "size-8 rounded-full transition-transform active:scale-90",
                color === c &&
                  "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
          >
            <Plus className="size-4" />
            {editingId ? "Salvar alterações" : "Adicionar categoria"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="glass glass-strong rounded-full px-5 py-3 text-[14px] font-semibold text-glass-ink transition-colors hover:brightness-105 active:scale-[0.98]"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
