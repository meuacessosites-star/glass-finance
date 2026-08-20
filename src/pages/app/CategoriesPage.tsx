import { useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
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
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const MAX_CATEGORY_IMAGE_BYTES = 2 * 1024 * 1024;

type Rgb = { r: number; g: number; b: number };

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#?/, "#");
  const expanded = /^#[0-9A-Fa-f]{3}$/.test(raw)
    ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`
    : raw;
  return HEX_PATTERN.test(expanded) ? expanded.toUpperCase() : null;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function parseRgb(value: string): string | null {
  const match = value.match(/^(?:rgb\s*\(\s*)?(\d{1,3})\s*[,;]\s*(\d{1,3})\s*[,;]\s*(\d{1,3})\s*\)?$/i);
  if (!match) return null;
  const channels = match.slice(1).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export default function CategoriesPage() {
  const {
    categories,
    activeProfile,
    showCategoryNameOnCard,
    setShowCategoryNameOnCard,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useAppStore();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [hexInput, setHexInput] = useState(PALETTE[0]);
  const [rgbInput, setRgbInput] = useState(() => {
    const rgb = hexToRgb(PALETTE[0]);
    return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  });
  const [icon, setIcon] = useState(categoryIconOptions[0].id);
  const [image, setImage] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);

  const applyColor = (next: string) => {
    const normalized = normalizeHex(next);
    if (!normalized) return false;
    const rgb = hexToRgb(normalized);
    setColor(normalized);
    setHexInput(normalized);
    setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
    return true;
  };

  const startEdit = (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    setEditingId(id);
    setLabel(category.label);
    applyColor(category.color);
    setIcon(category.icon);
    setImage(category.image);
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel("");
    applyColor(PALETTE[0]);
    setIcon(categoryIconOptions[0].id);
    setImage(undefined);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Escolha um arquivo de imagem");
      return;
    }
    if (file.size > MAX_CATEGORY_IMAGE_BYTES) {
      toast("A imagem deve ter no máximo 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast("Digite um nome para a categoria");
      return;
    }
    const data = { label: trimmed, color, icon, image };
    if (editingId) {
      updateCategory(editingId, data);
      toast("Categoria atualizada");
    } else {
      addCategory(data);
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
      <SettingsHeader title="Categorias" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Categorias de <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        cada perfil tem as suas.
      </p>

      <div className="glass glass-soft rounded-3xl p-4">
        <div>
          <p className="text-[15px] font-bold text-glass-ink">Exibição nos cards</p>
          <p className="mt-1 text-[12px] font-medium leading-4 text-glass-faint">
            Escolha se os cards mostram o nome da categoria junto do ícone.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={showCategoryNameOnCard}
            onClick={() => setShowCategoryNameOnCard(true)}
            className={cn(
              "min-h-11 rounded-2xl px-3 py-2 text-[12px] font-bold transition-colors",
              showCategoryNameOnCard
                ? "bg-primary text-white shadow-sm"
                : "glass glass-soft text-glass-sub hover:text-glass-ink",
            )}
          >
            Nome + ícone
          </button>
          <button
            type="button"
            aria-pressed={!showCategoryNameOnCard}
            onClick={() => setShowCategoryNameOnCard(false)}
            className={cn(
              "min-h-11 rounded-2xl px-3 py-2 text-[12px] font-bold transition-colors",
              !showCategoryNameOnCard
                ? "bg-primary text-white shadow-sm"
                : "glass glass-soft text-glass-sub hover:text-glass-ink",
            )}
          >
            Somente ícone
          </button>
        </div>
      </div>

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
                className="flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-white/60 active:scale-90"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Excluir ${category.label}`}
                onClick={() => handleDelete(category.id, category.label)}
                className="flex size-11 items-center justify-center rounded-full text-glass-sub transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30] active:scale-90"
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

        <div className="mt-3 flex items-center gap-2">
          {image ? (
            <img
              src={image}
              alt="Pré-visualização da categoria"
              className="size-11 rounded-2xl object-cover"
            />
          ) : (
            <div className="glass glass-soft flex size-11 items-center justify-center rounded-2xl text-glass-sub">
              <ImagePlus className="size-5" />
            </div>
          )}
          <label className="glass glass-soft flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold text-glass-sub transition-colors hover:text-glass-ink active:scale-[0.98]">
            <Upload className="size-4" />
            {image ? "Trocar imagem" : "Adicionar imagem"}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="sr-only"
            />
          </label>
          {image && (
            <button
              type="button"
              onClick={() => setImage(undefined)}
              className="min-h-11 px-2 text-[12px] font-semibold text-glass-faint underline underline-offset-2"
            >
              Remover
            </button>
          )}
        </div>

        {/* Color picker */}
        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Cor
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {PALETTE.map((paletteColor) => (
            <button
              key={paletteColor}
              type="button"
              aria-label={`Cor ${paletteColor}`}
              onClick={() => applyColor(paletteColor)}
              className={cn(
                "size-11 rounded-full transition-transform active:scale-90",
                color === paletteColor &&
                  "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
              )}
              style={{ backgroundColor: paletteColor }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="glass glass-soft flex size-11 cursor-pointer items-center justify-center rounded-2xl overflow-hidden">
            <input
              type="color"
              value={color}
              onChange={(event) => applyColor(event.target.value)}
              aria-label="Selecionar cor na roda de cores"
              className="size-16 cursor-pointer border-0 bg-transparent"
            />
          </label>
          <input
            value={hexInput}
            onChange={(event) => setHexInput(event.target.value)}
            onBlur={() => {
              if (!applyColor(hexInput)) setHexInput(color);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!applyColor(hexInput)) setHexInput(color);
              }
            }}
            aria-label="Código hexadecimal da cor"
            placeholder="#3B82F6"
            maxLength={7}
            className={cn(inputClass, "w-32 px-3 py-2.5 text-[13px]")}
          />
          <input
            value={rgbInput}
            onChange={(event) => setRgbInput(event.target.value)}
            onBlur={() => {
              const next = parseRgb(rgbInput);
              if (next) applyColor(next);
              else {
                const rgb = hexToRgb(color);
                setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const next = parseRgb(rgbInput);
                if (next) applyColor(next);
              }
            }}
            aria-label="Código RGB da cor"
            placeholder="R, G, B"
            className={cn(inputClass, "w-32 px-3 py-2.5 text-[13px]")}
          />
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
