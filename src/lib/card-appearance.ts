import { normalizeSearchText } from "./transaction-view";

export const CARD_BRAND_LABELS = {
  mastercard: "Mastercard",
  visa: "Visa",
  elo: "Elo",
  amex: "American Express",
  hipercard: "Hipercard",
  card: "Não informada",
} as const;
export type CardBrand = keyof typeof CARD_BRAND_LABELS;
export type BankPreset = {
  name: string;
  aliases: string[];
  color: string;
  brand?: CardBrand;
};

/** Display suggestions only; card variants and user choices can differ. */
export const BANK_PRESETS: BankPreset[] = [
  {
    aliases: ["nubank", "nu"],
    name: "Nubank",
    color: "#820AD1",
    brand: "mastercard",
  },
  {
    aliases: ["inter", "banco inter"],
    name: "Inter",
    color: "#FF7A00",
    brand: "mastercard",
  },
  {
    aliases: ["c6", "c6 bank", "c6bank"],
    name: "C6 Bank",
    color: "#111111",
    brand: "mastercard",
  },
  { aliases: ["itau", "banco itau"], name: "Itaú", color: "#EC7000" },
  {
    aliases: ["santander", "banco santander"],
    name: "Santander",
    color: "#EC0000",
  },
  {
    aliases: ["bradesco", "banco bradesco"],
    name: "Bradesco",
    color: "#CC092F",
  },
  {
    aliases: ["banco do brasil", "bb"],
    name: "Banco do Brasil",
    color: "#F8CC46",
  },
  {
    aliases: ["caixa", "caixa economica", "caixa economica federal"],
    name: "Caixa",
    color: "#005CA9",
  },
  {
    aliases: ["mercado pago", "mercadopago", "mp"],
    name: "Mercado Pago",
    color: "#009EE3",
    brand: "visa",
  },
  {
    aliases: ["picpay", "pic pay"],
    name: "PicPay",
    color: "#21C25E",
    brand: "mastercard",
  },
  {
    aliases: ["pagbank", "pag bank", "pagseguro"],
    name: "PagBank",
    color: "#00A868",
    brand: "visa",
  },
  {
    aliases: ["neon", "banco neon"],
    name: "Neon",
    color: "#00A8D6",
    brand: "visa",
  },
];

const normalize = (value: string) =>
  normalizeSearchText(value.trim()).replace(/\s+/g, " ");

export function findBankPreset(value: string) {
  const text = normalize(value);
  return BANK_PRESETS.find((preset) =>
    preset.aliases.some((alias) => text === normalize(alias)),
  );
}

/** The invoice strip can use the bank suggestion without changing the saved card color. */
export function getInvoiceHeaderColor(card: { institution?: string; color: string; invoiceHeaderColorMode?: "bank" | "card" }): string {
  const saved = /^#[0-9a-f]{6}$/i.test(card.color) ? card.color : "#2F6BFF";
  return card.invoiceHeaderColorMode === "card" ? saved : findBankPreset(card.institution ?? "")?.color ?? saved;
}


export function getBankSuggestions(value: string) {
  const query = normalize(value);
  return BANK_PRESETS.filter(
    (preset) =>
      !query ||
      normalize(`${preset.name} ${preset.aliases.join(" ")}`).includes(query),
  );
}

export function sanitizeCardBrand(value: unknown): CardBrand | undefined {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(CARD_BRAND_LABELS, value)
    ? (value as CardBrand)
    : undefined;
}

/** Explicit selection always wins, including an intentional unknown brand. */
export function detectCardBrand(card: {
  name: string;
  institution?: string;
  brand?: unknown;
}): CardBrand {
  const saved = sanitizeCardBrand(card.brand);
  if (saved) return saved;
  const text = normalize(`${card.name} ${card.institution ?? ""}`);
  if (/master\s*card|\bmc\b/.test(text)) return "mastercard";
  if (/\bvisa\b/.test(text)) return "visa";
  if (/\belo\b/.test(text)) return "elo";
  if (/\bamex\b|american express/.test(text)) return "amex";
  if (/hipercard/.test(text)) return "hipercard";
  const preset = findBankPreset(card.institution ?? "");
  if (preset?.brand) return preset.brand;
  // Keep the appearance of older cards until a brand is explicitly chosen.
  if (/\b(?:nubank|nu|inter|c6)\b/.test(text)) return "mastercard";
  if (/\b(?:itau|santander|bradesco|bb|caixa)\b/.test(text)) return "visa";
  return "card";
}
