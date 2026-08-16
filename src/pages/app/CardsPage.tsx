import { useState } from "react";
import {
  CreditCard,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore, type AppCard } from "@/lib/app-store";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const PALETTE = [
  "#2F6BFF",
  "#5856D6",
  "#AF52DE",
  "#FF2D55",
  "#FF9500",
  "#1FBF4F",
  "#00C7BE",
  "#0A84FF",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

type CardFormState = {
  name: string;
  institution: string;
  last4: string;
  totalLimit: string;
  closingDay: string;
  dueDay: string;
  color: string;
};

const EMPTY_FORM: CardFormState = {
  name: "",
  institution: "",
  last4: "",
  totalLimit: "",
  closingDay: "",
  dueDay: "",
  color: PALETTE[0],
};

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function normalizeHexInput(value: string): string {
  const digits = value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function parseAmount(value: string): number | undefined {
  const cleaned = value.replace(/[^0-9,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseDay(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31
    ? parsed
    : undefined;
}

function CardVisual({
  card,
  onEdit,
  onDelete,
}: {
  card: AppCard;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const limit = card.totalLimit ?? 0;
  const details = [
    card.closingDay ? `Fecha ${card.closingDay}` : "Fecha —",
    card.dueDay ? `Vence ${card.dueDay}` : "Vence —",
  ].join(" · ");

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden rounded-[1.7rem] p-5 text-white shadow-[0_18px_40px_-16px_rgba(15,40,90,0.5)]"
        style={{
          background: `linear-gradient(135deg, ${card.color}, ${card.color}bb)`,
        }}
      >
        <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-32 w-32 rounded-full bg-black/10 blur-2xl" />

        <div className="relative flex items-center justify-between">
          <div>
            <span className="text-[12.5px] font-bold tracking-widest">
              {card.name.toUpperCase()}
            </span>
            <p className="mt-0.5 text-[11px] font-medium text-white/75">
              {card.institution || "Banco / instituição"}
            </p>
          </div>
          <Wifi className="size-5 rotate-90 opacity-80" strokeWidth={2.2} />
        </div>
        <p className="amount-tabular relative mt-8 text-[18px] font-semibold tracking-[0.18em]">
          •••• •••• •••• {card.last4 || "0000"}
        </p>
        <div className="relative mt-5 grid grid-cols-2 gap-2 text-[10px] font-medium text-white/75">
          <span>Limite {formatCurrency(limit)}</span>
          <span className="text-right">{details}</span>
        </div>
        <div className="relative mt-4 flex items-center justify-between">
          <span className="text-[11px] font-medium text-white/75">
            GranaScan · Cartão pessoal
          </span>
          <div className="h-6 w-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-400/90" />
        </div>
      </div>

      {onEdit && (
        <button
          type="button"
          aria-label={`Editar ${card.name}`}
          onClick={onEdit}
          className="absolute -right-2.5 -top-2.5 flex size-8 items-center justify-center rounded-full bg-white/90 text-primary shadow-md backdrop-blur transition-transform active:scale-90 dark:bg-[#111c3c]"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          aria-label={`Excluir ${card.name}`}
          onClick={onDelete}
          className={cn(
            "absolute -top-2.5 flex size-8 items-center justify-center rounded-full bg-white/90 text-[#FF3B30] shadow-md backdrop-blur transition-transform active:scale-90 dark:bg-[#111c3c]",
            onEdit ? "right-11" : "right-2.5",
          )}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function FormCardPreview({ form }: { form: CardFormState }) {
  const safeColor = isHexColor(form.color) ? form.color : PALETTE[0];
  return (
    <CardVisual
      card={{
        id: "preview",
        name: form.name.trim() || "Nome do cartão",
        institution: form.institution.trim() || "Banco / instituição",
        last4: form.last4 || "0000",
        totalLimit: parseAmount(form.totalLimit) ?? 0,
        closingDay: parseDay(form.closingDay),
        dueDay: parseDay(form.dueDay),
        color: safeColor,
      }}
    />
  );
}

export default function CardsPage() {
  const {
    cards,
    activeProfile,
    addCard,
    updateCard,
    deleteCard,
  } = useAppStore();
  const [form, setForm] = useState<CardFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateField = <K extends keyof CardFormState>(
    field: K,
    value: CardFormState[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleEdit = (card: AppCard) => {
    setEditingId(card.id);
    setForm({
      name: card.name,
      institution: card.institution ?? "",
      last4: card.last4,
      totalLimit:
        typeof card.totalLimit === "number"
          ? card.totalLimit.toFixed(2).replace(".", ",")
          : "",
      closingDay: card.closingDay ? String(card.closingDay) : "",
      dueDay: card.dueDay ? String(card.dueDay) : "",
      color: card.color,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast("Dê um nome ao cartão");
      return;
    }

    const digits = form.last4.replace(/\D/g, "");
    if (digits.length !== 4) {
      toast("Informe os 4 últimos dígitos do cartão");
      return;
    }

    const closingDay = parseDay(form.closingDay);
    if (form.closingDay && !closingDay) {
      toast("O fechamento deve ser um dia entre 1 e 31");
      return;
    }

    const dueDay = parseDay(form.dueDay);
    if (form.dueDay && !dueDay) {
      toast("O vencimento deve ser um dia entre 1 e 31");
      return;
    }

    const color = isHexColor(form.color) ? form.color : PALETTE[0];
    const data = {
      name: trimmedName,
      institution: form.institution.trim() || undefined,
      last4: digits,
      totalLimit: parseAmount(form.totalLimit),
      closingDay,
      dueDay,
      color,
    };

    if (editingId) {
      updateCard(editingId, data);
      toast("Cartão atualizado");
    } else {
      addCard(data);
      toast("Cartão adicionado");
    }
    resetForm();
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Cartões" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Cartões de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        cada perfil tem os seus.
      </p>

      <div className="space-y-4">
        {cards.length === 0 && (
          <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
              <CreditCard className="size-6 text-glass-faint" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-glass-ink">
                Nenhum cartão ainda
              </p>
              <p className="mt-1 text-[13px] text-glass-sub">
                Adicione seus cartões para controlar as compras de terceiros.
              </p>
            </div>
          </div>
        )}

        {cards.map((card) => (
          <CardVisual
            key={card.id}
            card={card}
            onEdit={() => handleEdit(card)}
            onDelete={() => {
              deleteCard(card.id);
              if (editingId === card.id) resetForm();
              toast("Cartão removido");
            }}
          />
        ))}
      </div>

      <div className="glass rounded-3xl p-4">
        <FormCardPreview form={form} />
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[15px] font-bold text-glass-ink">
            {editingId ? "Editar cartão" : "Adicionar cartão"}
          </p>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-glass-sub transition-colors hover:text-glass-ink"
            >
              <X className="size-3.5" />
              Cancelar
            </button>
          )}
        </div>

        <input
          value={form.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="Nome do cartão (ex.: Roxinho)"
          maxLength={24}
          className={cn(inputClass, "mt-3")}
        />
        <input
          value={form.institution}
          onChange={(e) => updateField("institution", e.target.value)}
          placeholder="Banco / instituição (ex.: Nubank)"
          maxLength={32}
          className={cn(inputClass, "mt-2.5")}
        />
        <input
          value={form.last4}
          onChange={(e) =>
            updateField("last4", e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          placeholder="Últimos 4 dígitos"
          inputMode="numeric"
          maxLength={4}
          className={cn(inputClass, "mt-2.5")}
        />

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <input
            value={form.totalLimit}
            onChange={(e) => updateField("totalLimit", e.target.value)}
            placeholder="Limite total (R$)"
            inputMode="decimal"
            className={inputClass}
          />
          <input
            value={form.closingDay}
            onChange={(e) =>
              updateField("closingDay", e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            placeholder="Dia de fechamento"
            inputMode="numeric"
            maxLength={2}
            className={inputClass}
          />
        </div>
        <input
          value={form.dueDay}
          onChange={(e) =>
            updateField("dueDay", e.target.value.replace(/\D/g, "").slice(0, 2))
          }
          placeholder="Dia de vencimento"
          inputMode="numeric"
          maxLength={2}
          className={cn(inputClass, "mt-2.5")}
        />

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
          Cor do cartão
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Cor ${color}`}
              onClick={() => updateField("color", color)}
              className={cn(
                "size-8 rounded-full transition-transform active:scale-90",
                form.color === color &&
                  "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <label className="relative flex size-8 cursor-pointer overflow-hidden rounded-full border-2 border-white/70 shadow-sm dark:border-[#111c3c]">
            <input
              type="color"
              value={isHexColor(form.color) ? form.color : PALETTE[0]}
              onChange={(e) => updateField("color", e.target.value.toUpperCase())}
              className="absolute inset-[-8px] size-14 cursor-pointer"
              aria-label="Escolher cor personalizada"
            />
          </label>
          <input
            value={form.color}
            onChange={(e) => updateField("color", normalizeHexInput(e.target.value))}
            onBlur={() => {
              if (!isHexColor(form.color)) updateField("color", PALETTE[0]);
            }}
            placeholder="#FF5733"
            maxLength={7}
            className="glass glass-soft w-28 rounded-xl px-3 py-2 text-[13px] font-semibold uppercase text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint"
            aria-label="Código Hex da cor"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          {editingId ? <Save className="size-4" /> : <Plus className="size-4" />}
          {editingId ? "Salvar alterações" : "Adicionar cartão"}
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        As compras parceladas por terceiros no seu cartão aparecem na aba
        Empréstimos → Cartão Emprestado.
      </p>
    </div>
  );
}
