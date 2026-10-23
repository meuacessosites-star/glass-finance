import { usePrivateCurrency } from "@/components/app/BalancePrivacy";
import "@/components/app/invoice-glass-band.css";
import { getCardCommittedAmount, parseInvoiceMoney } from "@/lib/card-invoice-view";
import { getCardGlassBackground, getInvoiceHeaderAppearances, type InvoiceHeaderAppearance } from "@/lib/card-header-appearance";
import { useLocalDate } from "@/hooks/use-local-date";
import { CardRemovalDialog } from "@/components/app/CardRemovalDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CreditCard,
  Pencil,
  Plus,
  Save,
  Search,
  Archive,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router";
import { CardBrandMark } from "@/components/app/CardBrandMark";
import { BankSuggestionInput } from "@/components/app/BankSuggestionInput";
import { CategoryColorPicker } from "@/components/app/CategoryColorPicker";
import { SearchHighlight } from "@/components/app/SearchHighlight";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore, type AppCard } from "@/lib/app-store";
import { formatCurrency } from "@/lib/mock-data";
import { normalizeSearchText } from "@/lib/transaction-view";
import {
  CARD_BRAND_LABELS,
  detectCardBrand,
  findBankPreset,
  getInvoiceHeaderColor,
  type CardBrand,
} from "@/lib/card-appearance";
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
  invoiceHeaderColorMode: "bank" | "card";
  brand: CardBrand;
  brandCustomized: boolean;
};

const EMPTY_FORM: CardFormState = {
  name: "",
  institution: "",
  last4: "",
  totalLimit: "",
  closingDay: "",
  dueDay: "",
  color: PALETTE[0],
  invoiceHeaderColorMode: "card",
  brand: "card",
  brandCustomized: false,
};

function isHexColor(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function normalizeHexInput(value: string): string {
  const digits = value.replace(/[^0-9a-f]/gi, "").slice(0, 6);
  return `#${digits.toUpperCase()}`;
}

function parseAmount(value: string): number | undefined {
  return value.trim() ? (parseInvoiceMoney(value) ?? undefined) : undefined;
}

function parseDay(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 31
    ? parsed
    : undefined;
}

export function CardVisual({
  card,
  openAmount = 0,
  onEdit,
  onDelete,
  searchQuery,
  appearance,
}: {
  card: AppCard;
  openAmount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  searchQuery?: string;
  appearance?: InvoiceHeaderAppearance;
}) {
  const formatCurrency = usePrivateCurrency();
  const limit = card.totalLimit;
  const availableLimit =
    typeof limit === "number" ? Math.max(0, limit - openAmount) : undefined;
  const usagePercent =
    typeof limit === "number" && limit > 0
      ? Math.min(100, Math.max(0, (openAmount / limit) * 100))
      : 0;
  const visual = appearance ?? getInvoiceHeaderAppearances([{ ...card, archived: false }])[card.id];
  const details = [
    card.closingDay ? `Fechamento: Dia ${card.closingDay}` : "Fechamento: —",
    card.dueDay ? `Vencimento: Dia ${card.dueDay}` : "Vencimento: —",
  ].join(" · ");

  return (
    <div className="relative">
      <div
        className="invoice-glass-band group relative overflow-hidden rounded-[1.7rem] border border-white/30 p-5 text-white shadow-[0_28px_55px_-18px_rgba(15,40,90,0.72),inset_0_1px_0_rgba(255,255,255,0.42),inset_0_-1px_0_rgba(0,0,0,0.18)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_34px_64px_-18px_rgba(15,40,90,0.78),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.22)] [transform:perspective(1000px)_rotateX(2deg)]"
        style={{
          backgroundColor: visual.middle,
          backgroundImage: getCardGlassBackground(visual),
          textShadow: "0 1px 2px rgba(0,0,0,0.75), 0 0 1px rgba(0,0,0,0.7)",
        }}
      >

        <div className="relative flex items-center justify-between">
          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1.5">
              {onEdit && (
                <button
                  type="button"
                  aria-label={`Editar ${card.name}`}
                  onClick={onEdit}
                  className="flex size-7 items-center justify-center rounded-lg border border-white/25 bg-black/10 text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-md transition-colors hover:bg-white/20 active:scale-90"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  aria-label={`Excluir ${card.name}`}
                  onClick={onDelete}
                  className="flex size-7 items-center justify-center rounded-lg border border-white/25 bg-black/10 text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-md transition-colors hover:bg-[#FF3B30]/80 active:scale-90"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          )}
          <Wifi
            className="ml-auto size-5 rotate-90 opacity-80"
            strokeWidth={2.2}
          />
        </div>

        <div className="relative mt-5">
          <span className="text-[12.5px] font-bold tracking-widest">
            <SearchHighlight
              query={searchQuery}
              className="text-[#132235] dark:text-[#132235] dark:bg-[#FFE58F]"
            >
              {card.name.toUpperCase()}
            </SearchHighlight>
          </span>
          <p className="mt-0.5 text-[11px] font-medium text-white/75">
            <SearchHighlight
              query={searchQuery}
              className="text-[#132235] dark:text-[#132235] dark:bg-[#FFE58F]"
            >
              {card.institution || "Banco / instituição"}
            </SearchHighlight>
          </p>
        </div>
        <p className="amount-tabular relative mt-8 text-[18px] font-semibold tracking-[0.18em]">
          •••• •••• ••••{" "}
          <SearchHighlight
            query={searchQuery}
            className="text-[#132235] dark:text-[#132235] dark:bg-[#FFE58F]"
          >
            {card.last4 || "0000"}
          </SearchHighlight>
        </p>
        <div className="relative mt-5 grid grid-cols-2 gap-2 text-[10px] font-medium text-white/75">
          <span>
            Limite total{" "}
            {typeof limit === "number" ? formatCurrency(limit) : "—"}
          </span>
          <span className="text-right">{details}</span>
        </div>
        <div className="relative mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold">
          <span>
            <span className="block text-[9px] font-medium uppercase tracking-wide text-white/65">
              Em aberto
            </span>
            {formatCurrency(openAmount)}
          </span>
          <span className="text-right">
            <span className="block text-[9px] font-medium uppercase tracking-wide text-white/65">
              Disponível
            </span>
            {typeof availableLimit === "number"
              ? formatCurrency(availableLimit)
              : "—"}
          </span>
        </div>
        <div className="relative mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/15">
            <div
              className="h-full rounded-full bg-white/85 transition-[width] duration-300"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[9px] font-medium text-white/65">
            {typeof limit === "number" && limit > 0
              ? `${Math.round(usagePercent)}% utilizado`
              : "Limite não informado"}
          </p>
        </div>
        <div className="relative mt-4 flex items-center justify-between">
          <span className="text-[11px] font-medium text-white/75">
            GranaScan · Cartão pessoal
          </span>
          <CardBrandMark card={card} className="[text-shadow:none]" />
        </div>
      </div>
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
        invoiceHeaderColorMode: form.invoiceHeaderColorMode,
        brand: form.brand,
      }}
    />
  );
}

export default function CardsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const today = useLocalDate();
  const request = location.state as { editCardId?: string; returnInvoiceMonth?: string } | null;
  const requestedEditId = request?.editCardId;
  const {
    cards,
    transactions,
    loanTransactions,
    loanReceivables,
    activeProfile,
    addCard,
    updateCard,
    deleteCard,
  } = useAppStore();

  const cardAppearances = useMemo(() => getInvoiceHeaderAppearances(cards), [cards]);

  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = normalizeSearchText(searchQuery.trim());
  const activeCards = cards.filter((card) => !card.archived);
  const filteredCards = activeCards.filter(
    (card) =>
      !normalizedQuery ||
      normalizeSearchText(
        `${card.name} ${card.institution ?? ""} ${card.last4}`,
      ).includes(normalizedQuery),
  );
  useEffect(() => {
    setSearchQuery("");
  }, [activeProfile?.id]);
  const openAmountByCard = Object.fromEntries(cards.map((card) => [card.id, getCardCommittedAmount(card, transactions, today)]));
  const [removingCard, setRemovingCard] = useState<AppCard | null>(null);
  const initialEditingCard = cards.find((card) => card.id === requestedEditId);
  const [form, setForm] = useState<CardFormState>(() =>
    initialEditingCard
      ? {
          name: initialEditingCard.name,
          institution: initialEditingCard.institution ?? "",
          last4: initialEditingCard.last4,
          totalLimit:
            typeof initialEditingCard.totalLimit === "number"
              ? initialEditingCard.totalLimit.toFixed(2).replace(".", ",")
              : "",
          closingDay: initialEditingCard.closingDay
            ? String(initialEditingCard.closingDay)
            : "",
          dueDay: initialEditingCard.dueDay
            ? String(initialEditingCard.dueDay)
            : "",
          color: initialEditingCard.color,
          invoiceHeaderColorMode: initialEditingCard.invoiceHeaderColorMode ?? "bank",
          brand: detectCardBrand(initialEditingCard),
          brandCustomized: Boolean(initialEditingCard.brand),
        }
      : EMPTY_FORM,
  );
  const [editingId, setEditingId] = useState<string | null>(
    initialEditingCard?.id ?? null,
  );

  const displayedFormColor = form.invoiceHeaderColorMode === "bank"
    ? getInvoiceHeaderColor(form)
    : form.color;
  const handleColorChange = (color: string) => {
    setForm((current) => ({ ...current, color, invoiceHeaderColorMode: "card" }));
  };

  const updateField = <K extends keyof CardFormState>(
    field: K,
    value: CardFormState[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleInstitutionChange = (value: string) => {
    const preset = findBankPreset(value);
    setForm((current) => ({
      ...current,
      institution: preset ? preset.name : value,
      ...(preset ? { color: preset.color, invoiceHeaderColorMode: "bank" as const } : {}),
      ...(!current.brandCustomized ? { brand: preset?.brand ?? "card" } : {}),
    }));
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
      invoiceHeaderColorMode: card.invoiceHeaderColorMode ?? "bank",
      brand: detectCardBrand(card),
      brandCustomized: Boolean(card.brand),
    });
    window.requestAnimationFrame(() => {
      const editor = document.getElementById("card-editor");
      editor?.scrollIntoView({ block: "start", behavior: "smooth" });
      editor?.querySelector("input")?.focus({ preventScroll: true });
    });
  };

  const handledEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedEditId || handledEdit.current === location.key) return;
    const card = cards.find((item) => item.id === requestedEditId);
    if (!card) return;
    handledEdit.current = location.key;
    handleEdit(card);
  }, [requestedEditId, location.key, cards]);
  const editorProfile = useRef(activeProfile?.id);
  useEffect(() => {
    if (editorProfile.current === activeProfile?.id) return;
    editorProfile.current = activeProfile?.id; resetForm(); setRemovingCard(null);
  }, [activeProfile?.id]);

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

    const totalLimit = parseAmount(form.totalLimit);
    if (form.totalLimit.trim() && totalLimit === undefined) {
      toast("Informe um limite válido, como 1.500,00"); return;
    }
    const color = isHexColor(form.color) ? form.color : PALETTE[0];
    const data = {
      name: trimmedName,
      institution: form.institution.trim() || undefined,
      brand: form.brand,
      last4: digits,
      totalLimit,
      closingDay,
      dueDay,
      color,
      invoiceHeaderColorMode: form.invoiceHeaderColorMode,
    };

    if (editingId) {
      updateCard(editingId, data);
      toast("Cartão atualizado");
    } else {
      addCard(data);
      toast("Cartão adicionado");
    }
    resetForm();
    if (editingId && requestedEditId) navigate("/dashboard/compras-cartao", { state: { cardId: editingId, invoiceMonth: request?.returnInvoiceMonth } });
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Cartões" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Cartões de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span>{" "}
        — cada perfil tem os seus.
      </p>

      <div className="glass grid min-h-11 min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2xl px-3">
        <Search className="size-4 shrink-0 text-glass-faint" />
        <input
          type="search"
          enterKeyHint="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Buscar cartão, banco ou final..."
          aria-label="Buscar cartões por nome, banco ou últimos quatro dígitos"
          className="h-11 w-full min-w-0 bg-transparent text-[16px] text-glass-ink outline-none placeholder:text-glass-faint sm:text-[15px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:appearance-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Limpar busca de cartões"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-glass-faint hover:text-glass-ink focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {normalizedQuery && (
        <p role="status" className="px-1 text-[12px] text-glass-sub">
          {filteredCards.length} de {activeCards.length}{" "}
          {activeCards.length === 1 ? "cartão" : "cartões"}
        </p>
      )}
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

        {normalizedQuery &&
          activeCards.length > 0 &&
          filteredCards.length === 0 && (
            <div className="glass rounded-3xl px-5 py-6 text-center">
              <p className="text-[14px] font-semibold text-glass-ink">
                Nenhum cartão encontrado
              </p>
              <p className="mt-1 break-words text-[12px] text-glass-sub">
                Tente outro nome, banco ou os últimos quatro dígitos.
              </p>
            </div>
          )}
        {filteredCards.map((card) => (
          <CardVisual
            key={card.id}
            searchQuery={searchQuery}
            card={card}
            appearance={cardAppearances[card.id]}
            openAmount={openAmountByCard[card.id] ?? 0}
            onEdit={() => handleEdit(card)}
            onDelete={() => setRemovingCard(card)}
          />
        ))}

        {cards.length > 0 && activeCards.length === 0 && (
          <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-glass-ink/10">
              <Archive className="size-6 text-glass-faint" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-glass-ink">
                Todos os cartões estão arquivados
              </p>
              <p className="mt-1 text-[13px] text-glass-sub">
                Abra Arquivados para consultar ou restaurar um cartão.
              </p>
              <button type="button" onClick={() => navigate("/dashboard/cartoes/arquivados")} className="mt-3 min-h-11 rounded-full bg-primary px-4 text-[12px] font-bold text-white">Abrir arquivados</button>
            </div>
          </div>
        )}
      </div>

      <div id="card-editor" className="glass scroll-mt-4 rounded-3xl p-4">
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
        <BankSuggestionInput
          value={form.institution}
          onChange={handleInstitutionChange}
          onSelect={(bank) => handleInstitutionChange(bank.name)}
          className={inputClass}
        />
        <div className="mt-3 rounded-2xl border border-glass-ink/10 p-3">
          <p className="text-[12px] font-semibold text-glass-ink">
            Bandeira do cartão
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-glass-sub">
            Confira a sugestão e escolha a bandeira que aparece no seu cartão.
          </p>
          <div
            role="group"
            aria-label="Bandeira do cartão"
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {(Object.keys(CARD_BRAND_LABELS) as CardBrand[]).map((brand) => (
              <button
                key={brand}
                type="button"
                aria-label={`Bandeira ${CARD_BRAND_LABELS[brand]}`}
                aria-pressed={form.brand === brand}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    brand,
                    brandCustomized: true,
                  }))
                }
                className={cn(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[12px] font-semibold",
                  form.brand === brand
                    ? "border-primary bg-primary text-white"
                    : "border-glass-ink/10 bg-white/30 text-glass-ink dark:bg-white/5",
                )}
              >
                {form.brand === brand && (
                  <Check className="size-3.5 shrink-0" />
                )}
                {brand === "card" ? (
                  "Não informada"
                ) : (
                  <CardBrandMark
                    card={{ name: "", brand }}
                    className={cn(
                      "border-0 bg-transparent p-0 backdrop-blur-none",
                      form.brand === brand ? "text-white" : "text-glass-ink",
                    )}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
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
              updateField(
                "closingDay",
                e.target.value.replace(/\D/g, "").slice(0, 2),
              )
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
              aria-pressed={displayedFormColor.toUpperCase() === color.toUpperCase()}
              onClick={() => handleColorChange(color)}
              className={cn(
                "size-11 bg-clip-content rounded-full p-1.5 transition-transform active:scale-90",
                displayedFormColor.toUpperCase() === color.toUpperCase() &&
                  "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/60 dark:ring-offset-[#111c3c]",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <CategoryColorPicker
            value={isHexColor(displayedFormColor) ? displayedFormColor : PALETTE[0]}
            palette={PALETTE}
            onChange={handleColorChange}
          />
          <input
            value={displayedFormColor}
            onChange={(e) =>
              handleColorChange(normalizeHexInput(e.target.value))
            }
            onBlur={() => {
              if (!isHexColor(displayedFormColor)) handleColorChange(PALETTE[0]);
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
          {editingId ? (
            <Save className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {editingId ? "Salvar alterações" : "Adicionar cartão"}
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        As compras parceladas por terceiros no seu cartão aparecem na aba
        Empréstimos → Cartão Emprestado.
      </p>
      {removingCard && <CardRemovalDialog card={removingCard} mode="delete" transactions={[...transactions, ...loanTransactions]} receivables={loanReceivables}
        onClose={() => setRemovingCard(null)} onArchive={() => { updateCard(removingCard.id, { archived: true }); if (editingId === removingCard.id) resetForm(); setRemovingCard(null); toast("Cartão arquivado. Você pode restaurá-lo em Arquivados."); }}
        onDelete={() => { deleteCard(removingCard.id); if (editingId === removingCard.id) resetForm(); setRemovingCard(null); toast("Cartão removido"); }} />}
    </div>
  );
}
