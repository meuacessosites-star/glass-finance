import jsQR from "jsqr";
import * as Tesseract from "tesseract.js";

// ---------------------------------------------------------------------------
// Escanear Nota — client-side OCR (Tesseract.js, Portuguese) plus a parser
// that turns raw receipt text into structured fields: merchant, BRL amount,
// category, date and time. All heuristics are safe: if nothing matches, the
// field stays empty so the user can fill it manually.
// ---------------------------------------------------------------------------

export type ScanCategory = {
  id: string;
  label: string;
  color: string;
  icon: string;
  keywords: string[];
};

/**
 * Categories the scanner can suggest. ids that match the seeded categories
 * are reused; the others ("Restaurantes", "Café", …) are created on demand
 * by the scan screen when they don't exist yet.
 */
export const SCAN_CATEGORIES: ScanCategory[] = [
  {
    id: "restaurantes",
    label: "Restaurantes",
    color: "#FF7A45",
    icon: "alimentacao",
    keywords: [
      "restaurante",
      "ifood",
      "uber eats",
      "rappi",
      "lanchonete",
      "pizzaria",
      "pizza",
      "hamburgueria",
      "burger",
      "sorveteria",
      "trattoria",
      "churrascaria",
      "sushi",
    ],
  },
  {
    id: "alimentacao",
    label: "Alimentação",
    color: "#FF9F0A",
    icon: "alimentacao",
    keywords: [
      "supermercado",
      "hipermercado",
      "mercado",
      "emporio",
      "sacolao",
      "padaria",
      "pao de acucar",
      "pão de açúcar",
      "carrefour",
      "assai",
      "atacadao",
      "atacadista",
      "hortifruti",
      "frutaria",
      "acougue",
      "sadia",
      "pereciveis",
    ],
  },
  {
    id: "cafe",
    label: "Café",
    color: "#A97B50",
    icon: "cafe",
    keywords: ["cafeteria", "cafe", "starbucks", "espresso"],
  },
  {
    id: "transporte",
    label: "Transporte",
    color: "#0A84FF",
    icon: "transporte",
    keywords: [
      "uber",
      "99pop",
      "taxi",
      "posto",
      "shell",
      "ipiranga",
      "petrobras",
      "combustivel",
      "combustível",
      "estacionamento",
      "metro",
      "onibus",
      "pedagio",
    ],
  },
  {
    id: "moradia",
    label: "Moradia",
    color: "#5856D6",
    icon: "moradia",
    keywords: [
      "aluguel",
      "condominio",
      "condomínio",
      "energisa",
      "enel",
      "copel",
      "ceea",
      "conta de luz",
      "conta de agua",
      "fatura de agua",
      "agua e esgoto",
      "conta de energia",
      "telefonia",
      "internet fibra",
      "saneamento",
    ],
  },
  {
    id: "manutencao",
    label: "Manutenção",
    color: "#FF9F0A",
    icon: "manutencao",
    keywords: [
      "oficina",
      "mecanica",
      "mecânica",
      "conserto",
      "manutencao",
      "manutenção",
      "auto pecas",
      "auto peças",
      "borracharia",
    ],
  },
  {
    id: "saude",
    label: "Saúde",
    color: "#FF2D55",
    icon: "saude",
    keywords: [
      "farmacia",
      "farmácia",
      "droga",
      "medicamento",
      "drogaraia",
      "drogasil",
      "raia",
      "hospital",
      "clinica",
      "dentista",
    ],
  },
  {
    id: "academia",
    label: "Academia",
    color: "#AF52DE",
    icon: "academia",
    keywords: ["academia", "smart fit", "gym", "musculacao"],
  },
  {
    id: "lazer",
    label: "Lazer",
    color: "#FF3B30",
    icon: "lazer",
    keywords: ["cinema", "ingresso", "show", "teatro", "parque", "cinemark"],
  },
  {
    id: "viagem",
    label: "Viagem",
    color: "#32ADE6",
    icon: "viagem",
    keywords: ["hotel", "airbnb", "voo", "passagem", "hostel", "turismo"],
  },
  {
    id: "pets",
    label: "Pets",
    color: "#FF6482",
    icon: "pets",
    keywords: ["pet shop", "petshop", "racao", "ração", "veterinario", "veterinário"],
  },
  {
    id: "compras",
    label: "Compras",
    color: "#FF6482",
    icon: "compras",
    keywords: [
      "renner",
      "roupas",
      "calcados",
      "calçados",
      "lojas",
      "amazon",
      "magazine",
      "casas bahia",
      "zara",
      "shein",
      "shopee",
      "mercadolivre",
    ],
  },
  {
    id: "presentes",
    label: "Presentes",
    color: "#FFCC00",
    icon: "presentes",
    keywords: ["presente", "lembrancinha", "boutique"],
  },
  {
    id: "salario",
    label: "Salário",
    color: "#34C759",
    icon: "salario",
    keywords: [
      "salario",
      "salário",
      "holerite",
      "pagamento de salario",
      "pagamento de salário",
      "folha de pagamento",
    ],
  },
  {
    id: "freelance",
    label: "Freelance",
    color: "#AF52DE",
    icon: "freelance",
    keywords: ["freelance", "freela", "pro labore", "prolabore"],
  },
  {
    id: "assinaturas",
    label: "Assinaturas",
    color: "#00C7BE",
    icon: "assinaturas",
    keywords: [
      "netflix",
      "spotify",
      "assinatura",
      "mensalidade",
      "apple",
      "google play",
      "prime video",
      "disney plus",
    ],
  },
  {
    id: "educacao",
    label: "Educação",
    color: "#32ADE6",
    icon: "educacao",
    keywords: ["escola", "faculdade", "curso", "livraria", "papelaria", "colegio"],
  },
  {
    id: "outros",
    label: "Outros",
    color: "#8E8E93",
    icon: "outros",
    keywords: [],
  },
];

export type ScanResult = {
  title: string;
  amount: number; // positive BRL value
  categoryId: string;
  date: string; // yyyy-mm-dd ("" when not found)
  time: string; // HH:MM ("" when not found)
  type: "income" | "expense"; // receita/despesa
  paymentMethod: string; // pix | dinheiro | cartao | credito | debito | boleto | transferencia | ""
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * A digit position in OCR text — thermal print confuses 0/O, 5/S, 1/l/I,
 * 2/Z, 8/B, 4/A, 6/G and 7/T, so these letters are accepted where a digit
 * is expected.
 */
/** Character-class BODY (no brackets) — reused inside the AMOUNT lookahead. */
const D_BODY = "0-9OoIiLlSZB4AaGgTt";
const D = `[${D_BODY}]`;

/** Maps OCR letter confusions back to digits ("9O" → "90", "l4" → "14",
 * "1A" → "14", "3G" → "36", "2T" → "27"). */
function ocrDigits(token: string): string {
  return token
    .replace(/[Oo]/g, "0")
    .replace(/[Ss]/g, "5")
    .replace(/[IiLl]/g, "1")
    .replace(/[Zz]/g, "2")
    .replace(/[Bb]/g, "8")
    .replace(/[Aa]/g, "4")
    .replace(/[Gg]/g, "6")
    .replace(/[Tt]/g, "7");
}

/** norm() plus the same letter→digit mapping, applied to BOTH the receipt
 * text and the category keywords so "5UPERMERCADO" still matches
 * "supermercado" — and clean text keeps matching too. */
const ocrNorm = (s: string) =>
  norm(s)
    .replace(/o/g, "0")
    .replace(/s/g, "5")
    .replace(/[il]/g, "1")
    .replace(/z/g, "2")
    .replace(/b/g, "8")
    .replace(/a/g, "4");

/** "1.234,56" / "12,50" / "1.250" → number. */
export function parseBrl(input: string): number {
  let t = input.replace(/[^\d.,]/g, "");
  if (!t) return 0;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && hasDot) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    t = t.replace(",", ".");
  } else if (hasDot) {
    const after = t.split(".")[1] ?? "";
    if (after.length === 3) t = t.replace(".", "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Picks the best amount, most-reliable source first:
 *   1. an explicit "total/valor/a pagar" line — keyword and number must share
 *      the same line (a newline is a different field, never the total);
 *   2. any "R$" value (the symbol may OCR as "RS"/"R5"), from the bottom;
 *   3. any remaining number token, from the bottom, skipping change/ID/address
 *      lines. Amounts survive OCR noise: "28,9O", "3G,50", "28 90", "R$ 28"
 *      and "T0TAL" all resolve.
 */
/** A BRL amount token. The lookahead requires at least one REAL digit so a
 * fuzzy letter class never lets "TOTAL"'s own letters be read as a number
 * (e.g. the trailing "L" of "VALOR TOTAL" becoming 1). */
const AMOUNT_RE = `((?=[${D_BODY}]*[0-9])${D}+(?:[.,]${D}{3})*(?:[.,;”"'’ ]+${D}{1,2})?)`;

/** Letter → OCR confusion set, used to build fuzzy keywords. */
const L: Record<string, string> = {
  t: "[t17]",
  o: "[0o4]",
  a: "[a4]",
  l: "[l1]",
  p: "[p]",
  g: "[g]",
  r: "[r]",
  v: "[v]",
};
const fuzzy = (w: string) => w.split("").map((c) => L[c] ?? c).join("");

/** "total" / "valor" / "a pagar" tolerating the T→1/7, O→0/4, A→4, L→1 swaps. */
const TOTAL_KINDS =
  `${fuzzy("total")}(?: ${fuzzy("a")} ${fuzzy("pagar")}| ${fuzzy("pago")})?` +
  `|${fuzzy("valor")}(?: ${fuzzy("total")})?` +
  `|${fuzzy("a")} ${fuzzy("pagar")}`;

/** Lines that carry values different from the total (change, IDs, addresses). */
const BAD_AMOUNT_LINE =
  /troco|dinheiro|cnpj|cpf\b|inscricao|\bie\b|telefone|fone|\btel\b|endereco|rua\b|avenida|\bav\.|qtd|quantidade|unid|caixa|operador|consumidor|protocolo|validade|venc|leitura|sequencial/i;

/** Masks valid dates and times so they never read as BRL amounts (day/month
 * are validated so amounts like "1.234,56" and "12.50" stay unmasked). */
const maskDatesTimes = (line: string) =>
  line
    .replace(
      /(?:0[1-9]|[12]\d|3[01])[\/.\-](?:0[1-9]|1[0-2])(?:[\/.\-]\d{2,4})?/g,
      " ",
    )
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, " ");

/** Strict-digit BRL tokens on one line (dates/times masked first). */
function amountTokens(line: string): string[] {
  const out: string[] = [];
  for (const m of maskDatesTimes(line).matchAll(
    /([0-9]+(?:[.,][0-9]{3})*(?:[., ]+[0-9]{1,2})?)/g,
  )) {
    const t = m[1].trim();
    if (t.length >= 2) out.push(t);
  }
  return out;
}

function findAmount(text: string): number {
  // 1) Explicit total/valor line (keyword and number on the same line).
  const totalLine = text.match(
    new RegExp(
      `^\\s*(?:${TOTAL_KINDS})\\b(?!\\s*(?:de\\s+)?itens)[^\\n0-9]*${AMOUNT_RE}`,
      "im",
    ),
  );
  if (totalLine) {
    const n = parseAmountToken(totalLine[1]);
    if (n > 0) return n;
  }
  const totalAnywhere = text.match(
    new RegExp(
      `\\b(?:${TOTAL_KINDS})\\b(?!\\s*(?:de\\s+)?itens)[^\\n0-9]*${AMOUNT_RE}`,
      "i",
    ),
  );
  if (totalAnywhere) {
    const n = parseAmountToken(totalAnywhere[1]);
    if (n > 0) return n;
  }

  // 2) Lines with an explicit "R$" (or "RS"/"R5"), from the bottom.
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (BAD_AMOUNT_LINE.test(norm(line))) continue;
    const m = maskDatesTimes(line).match(
      new RegExp(`(?:r[$5s]\\s*)(${AMOUNT_RE})`, "i"),
    );
    if (m) {
      const n = parseAmountToken(m[1]);
      if (n > 0) return n;
    }
  }

  // 3) Any remaining number token, bottom-up, skipping change/ID lines.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (BAD_AMOUNT_LINE.test(norm(line))) continue;
    const tokens = amountTokens(line);
    if (tokens.length) {
      const n = parseAmountToken(tokens[tokens.length - 1]);
      if (n > 0) return n;
    }
  }
  return 0;
}

/**
 * Parses a possibly-fuzzy BRL amount token, recovering cents lost to OCR:
 * "28,9O" → 28.9, "28 90" → 28.9, "1.234,56" → 1234.56.
 */
function parseAmountToken(token: string): number {
  let t = ocrDigits(token).replace(/[”"'’;]/g, ","); // blurred ",90" → quote glyph
  // "28 90" / "28, 90" → "28,90" (the comma blurred into a space on thermal
  // print, or a space inserted after it).
  t = t.replace(/^(\d+(?:[.,]\d{3})*)[.,\s]+(\d{1,2})$/, "$1,$2");
  t = t.replace(/[^\d.,]/g, "");
  if (!t) return 0;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && hasDot) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    t = t.replace(",", ".");
  } else if (hasDot) {
    const after = t.split(".")[1] ?? "";
    if (after.length === 3) t = t.replace(".", "");
  }
  // Receipts always print two decimals — a lone decimal digit is one the OCR
  // dropped (usually a 0 read as O, recovered above; pad the rest).
  if (t.includes(".") && t.split(".")[1].length === 1) t += "0";
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Removes CNPJ / IE / phone / URL / long number runs from a title line. */
function stripNoise(line: string): string {
  return line
    .replace(/\bcnpj\b[:\s]*[\d./-]{8,}/gi, "")
    .replace(/\bie\b[:\s]*[\d./-]{4,}/gi, "")
    .replace(/\b(?:fone|telefone|tel)\b[:\s]*[+\d\s()-]{5,}/gi, "")
    .replace(/\b(?:www\.)?[\w-]+\.com\.br\b/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[0-9]{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BAD_TITLE_LINE =
  /cnpj|cpf|ie\s*:|inscricao|cupom|nfc-e|nf-e|\bnfce\b|\bnfc\b|\bnf\b|emitido|emissao|data|hora|total|subtotal|troco|desconto|pagamento|numero|nr\.|telefone|fone|endereco|endereço|www|\.com|caixa|operador|consumidor|qtd|quantidade|dinheiro|cartao|pix|sat|protocolo|\brua\b|\bavenida\b|\bav\.\b|\bcentro\b|\bbairro\b|\bcomplemento\b/i;

/**
 * A line that survived cleanup is a plausible store name: mostly letters,
 * no digits glued to letters (barcodes / access keys OCR as digit-letter
 * gibberish like "WVOB8o0oH-CEE"), and no separator runs or 4+ repeated
 * chars.
 */
function looksLikeStoreName(line: string): boolean {
  if ((line.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length < 4) return false;
  // Several digits embedded mid-word (letter-digit-letter) = barcode / access
  // key gibberish ("WVOB8o0oH-CEE"); a single one ("CARREF0UR", "H0TEL")
  // is plain OCR noise on a real name and still passes. Lookahead so
  // overlapping hits count ("o0o" next to "B8o" in the same word).
  if ((line.match(/[a-zA-ZÀ-ÿ](?=\d[a-zA-ZÀ-ÿ])/g) ?? []).length >= 2) return false;
  if (/[-_=+*•|.,/]{4,}/.test(line)) return false;
  if (/([a-zA-ZÀ-ÿ])\1{3,}/.test(line)) return false;
  return true;
}

function findTitle(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const cleaned = stripNoise(line);
    if (!/[a-zà-ú]{3,}/i.test(cleaned)) continue; // needs real words
    if (BAD_TITLE_LINE.test(cleaned)) continue; // header boilerplate
    if (/^[0-9]+(?:\s|$)/.test(cleaned)) continue; // item / code line (a lone leading
    // confusion digit like "5UPERMERCADO" is OCR noise on a real name, not a code)
    // "28/ -72 CENTRO" — a house number / address fragment, never a store name.
    if (/^\d+[\/\-–—]\s*\d*/.test(cleaned)) continue;
    if (/\d+[,.]\d{2}\s*$/.test(cleaned)) continue; // ends with a price → item line
    if (!looksLikeStoreName(cleaned)) continue; // barcode / OCR gibberish
    return cleaned.slice(0, 40);
  }
  return "";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary `includes` on normalized text (accent-proof). */
const wordBoundaryIncludes = (haystack: string, keyword: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(keyword)}([^a-z0-9]|$)`).test(haystack);

/**
 * Keywords that would false-positive on item lines (e.g. "agua" in
 * "AGUA MINERAL" on a supermarket receipt). They only ever match the store
 * name (title) or a line that also contains a billing word like "conta".
 */
const CONTEXT_KEYWORDS: Record<string, string[]> = {
  agua: [
    "conta",
    "fatura",
    "consumo",
    "leitura",
    "esgoto",
    "saneamento",
    "abastecimento",
    "mensal",
  ],
  energia: [
    "conta",
    "fatura",
    "consumo",
    "leitura",
    "fornecimento",
    "distribuicao",
    "cfe",
    "mensal",
  ],
  cafe: ["cafeteria", "cafe expresso", "espresso"],
};

/** Short generic words that only match in the store title, not item text. */
const TITLE_ONLY_KEYWORDS = new Set(["cafe", "agua", "energia"]);

/** Matches every category's keywords against one OCR-normalized haystack
 * scope. Both sides go through ocrNorm, so "5UPERMERCADO" still matches the
 * keyword "supermercado" (and clean text keeps matching too). */
function matchInCategory(haystack: string, isTitle: boolean): string {
  for (const cat of SCAN_CATEGORIES) {
    if (cat.id === "outros") continue;
    for (const kw of cat.keywords) {
      const k = ocrNorm(kw);
      if (!k) continue;
      const contextual = CONTEXT_KEYWORDS[norm(kw)];
      if (contextual) {
        if (!isTitle && !contextual.some((c) => haystack.includes(ocrNorm(c))))
          continue;
      } else if (TITLE_ONLY_KEYWORDS.has(norm(kw)) && !isTitle) {
        continue;
      }
      if (wordBoundaryIncludes(haystack, k)) return cat.id;
    }
  }
  return "";
}

/** Matches a text against the scan/voice category keywords. */
export function findCategoryId(text: string, title = ""): string {
  // 1) The store name is the strongest signal.
  const titleNorm = ocrNorm(title);
  if (titleNorm) {
    const byTitle = matchInCategory(titleNorm, true);
    if (byTitle) return byTitle;
  }
  // 2) Header region: first lines before the item list (may contain hints
  //    like "FARMACIA", "PADARIA" or "CONTA DE AGUA").
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
  for (const line of lines) {
    const id = matchInCategory(ocrNorm(line), false);
    if (id) return id;
  }
  // 3) Full text, strong keywords only.
  return matchInCategory(ocrNorm(text), false) || "outros";
}

/** First valid HH:MM (also accepts "HH:MM:SS" and "HHhMM") inside a line,
 * with OCR-tolerant digits ("l4:3Z" → "14:32"). */
function findTimeInLine(line: string): string {
  const m = line.match(
    new RegExp(`([01lIiL]${D}|2[0-3OoIiLlSZB])[:h]([0-5OoIiLlSZB]${D})`, "i"),
  );
  if (!m) return "";
  const hh = parseInt(ocrDigits(m[1]), 10);
  const mm = parseInt(ocrDigits(m[2]), 10);
  if (hh > 23 || mm > 59) return "";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Emission-context words (data/hora/emissão/saída/venda/compra). */
const EMISSION_CTX = /(^|[^a-z])(data|hora)|emiss|saida|emit|venda|compra/i;
/** Expiry / due-date words — never the purchase date ("DATA DE VALIDADE"). */
const VALIDITY_CTX = /(^|[^a-z])(val|validade|venc|vencimento|expir)/i;

/** PT-BR month abbreviations → number ("ago" → 8), for "10/ago" dates. */
const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Year for dates without one: the current year — or the previous one if that
 * would land in the future (receipts are never dated ahead). */
function inferYear(mo: number, d: number): number {
  const now = new Date();
  const y = now.getFullYear();
  if (new Date(y, mo - 1, d) > new Date(y, now.getMonth(), now.getDate() + 1)) {
    return y - 1;
  }
  return y;
}

function findDate(text: string): { date: string; time: string } {
  const lines = text.split("\n");
  let best: { date: string; line: string; score: number; end: number } | null = null;
  // dd/mm/yyyy, dd/mm (year inferred), yyyy-mm-dd and month-name dates like
  // "10/ago - 23:30". The no-year variants use a lookbehind so "…/0001-12"
  // (CNPJ branch digits) is never read as a date.
  const dmyRe = new RegExp(
    `(?<![0-9])(${D}{2})[\\/.\\-](${D}{2})(?:[\\/.\\-](${D}{4}))?`,
  );
  const monRe = new RegExp(
    `(?<![0-9])(0?[1-9]|[12]\\d|3[01])[\\/.\\-]\\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zà-ú]*`,
    "i",
  );
  const isoRe = new RegExp(`(${D}{4})-(${D}{2})-(${D}{2})`);

  for (const line of lines) {
    const ctx = norm(line);
    if (VALIDITY_CTX.test(ctx)) continue; // "VAL 30/08/2026" etc. — not the purchase date

    const dm = line.match(dmyRe);
    if (dm) {
      const d = parseInt(ocrDigits(dm[1]), 10);
      const mo = parseInt(ocrDigits(dm[2]), 10);
      const y = dm[3] ? parseInt(ocrDigits(dm[3]), 10) : inferYear(mo, d);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
        const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const score = EMISSION_CTX.test(ctx) ? 2 : 1;
        if (!best || score > best.score) {
          best = {
            date,
            line,
            score,
            end: (dm.index ?? 0) + dm[0].length,
          };
        }
      }
    }

    const mon = line.match(monRe);
    if (mon) {
      const d = parseInt(mon[1], 10);
      const mo = MONTHS[mon[2].toLowerCase()];
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        const y = inferYear(mo, d);
        const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const score = EMISSION_CTX.test(ctx) ? 2 : 1;
        if (!best || score > best.score) {
          best = {
            date,
            line,
            score,
            end: (mon.index ?? 0) + mon[0].length,
          };
        }
      }
    }

    const im = line.match(isoRe);
    if (im) {
      const y = parseInt(ocrDigits(im[1]), 10);
      const mo = parseInt(ocrDigits(im[2]), 10);
      const d = parseInt(ocrDigits(im[3]), 10);
      if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const score = EMISSION_CTX.test(ctx) ? 2 : 1;
        if (!best || score > best.score) {
          best = {
            date,
            line,
            score,
            end: (im.index ?? 0) + im[0].length,
          };
        }
      }
    }
  }

  let time = "";
  if (best) {
    // Prefer the time right after the date token ("DATA 05/08/2026 14:32:05"
    // or "10/ago - 23:30"), then any valid time on the emission line itself.
    time = findTimeInLine(best.line.slice(best.end)) || findTimeInLine(best.line);
  }
  if (!time) {
    // The date line had no time — look only at lines that mention
    // HORA/emissão/leitura (never scan item lines: prices like "12:50" can be
    // OCR'd with a colon).
    for (const line of lines) {
      if (/\bhora\b|emiss|saida|leitura/.test(norm(line))) {
        time = findTimeInLine(line);
        if (time) break;
      }
    }
  }
  return { date: best?.date ?? "", time };
}

/** Income signals — "PIX RECEBIDO", "SALÁRIO", "DEVOLUÇÃO" are money IN. */
const INCOME_HINTS =
  /\brecebid|recebimento|dep[o0]sito|est[o0]rno|reemb[o0]lso|devoluca|cr[ée]dito em c[o0]nta|sal[áa]rio|holerite|receitas|rendimento/i;

/** Expense signals — payments, purchases, bills, subscriptions, sent PIX. */
const EXPENSE_HINTS =
  /pagamento|compra|cupom|nota fiscal|fatura|boleto|d[ée]bito|saque|pix enviado|envio pix|transfer[êe]ncia enviada|despesa|assinatura|mensalidade|conta de|cart[ãa]o/i;

/** Determines whether the scanned receipt is money IN (receita) or money OUT
 * (despesa). Income signals win ("PIX RECEBIDO"); otherwise payment signals
 * mark an expense; neutral store receipts default to expense. */
export function detectType(text: string): "income" | "expense" {
  const t = norm(text);
  if (INCOME_HINTS.test(t)) return "income";
  if (EXPENSE_HINTS.test(t)) return "expense";
  return "expense";
}

const PAYMENT_METHODS: Array<{ id: string; label: string; re: RegExp }> = [
  { id: "pix", label: "Pix", re: /\bpix\b|bcb\.pix/i },
  { id: "dinheiro", label: "Dinheiro", re: /\bdinheiro\b/i },
  { id: "cartao", label: "Cartão", re: /\bcart[ãa]o\b/i },
  { id: "credito", label: "Crédito", re: /\bcr[ée]dito\b/i },
  { id: "debito", label: "Débito", re: /\bd[ée]bito\b/i },
  { id: "boleto", label: "Boleto", re: /\bboleto\b/i },
  { id: "transferencia", label: "Transferência", re: /transfer[êe]ncia/i },
];

/** First payment method mentioned in the receipt text ("" when none). */
export function findPaymentMethod(text: string): string {
  const t = norm(text);
  for (const m of PAYMENT_METHODS) {
    if (m.re.test(t)) return m.id;
  }
  return "";
}

export function parseReceiptText(text: string): ScanResult {
  const { date, time } = findDate(text);
  const title = findTitle(text);
  return {
    title,
    amount: findAmount(text),
    categoryId: findCategoryId(text, title),
    date,
    time,
    type: detectType(text),
    paymentMethod: findPaymentMethod(text),
  };
}

// ---------------------------------------------------------------------------
// Item list — extracts the "what was bought" from the receipt so the draft
// can be prefilled with an organized list of name + quantity + price.
// ---------------------------------------------------------------------------

export type ReceiptItem = {
  name: string;
  qty: string; // "1 un", "5 kg", "2x"… "" when the receipt has no quantity
  price: number; // positive BRL value
};

/** Lines that are never items (totals, payment, headers, dates, metadata). */
const ITEM_SKIP =
  /total|subtotal|troco|dinheiro|pagamento|cartao|credito|debito|desconto|taxa|juros|multa|acrescimo|frete|fiscal|cnpj|cpf|inscricao|endereco|telefone|fone|data|hora|emitid|protocolo|cupom|nfc-e|nf-e|chave|pix|referencia|entrega|pedido|consumidor|operador|caixa|validade|venc|leitura|sequencial|parcela|autorizacao|quantidade|nr\.|numero/i;

const QTY_UNITS = "UN|UNIDADE|UNID|UND|QTD|QTDE|CX|PCT|PAC|PACOTE|X|KG|G|ML|L|GR";

/** Cleans an item-name fragment: item codes, bare numbers and junk chars. */
function stripNameNoise(name: string): string {
  return name
    .replace(/^\d{3,}\s*/, "") // item codes ("001 ")
    .replace(/^\s*[.:;,•|=\-]+/, "") // leading separators
    .replace(/\s*\d+(?:[.,]\d+)?\s*$/, "") // trailing bare numbers
    .replace(/\s{2,}/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .trim();
}

const titleCase = (s: string) =>
  s.replace(
    /\p{L}+/gu,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );

/**
 * Parses the item list from a receipt: lines with a name, optional quantity
 * and a trailing price ("PIPOCA 1 UN 5,00"). Headers, totals and payment
 * lines are ignored. Returns at most 10 items.
 */
export function extractItems(text: string): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  for (const rawLine of text.split("\n")) {
    const line = maskDatesTimes(rawLine.trim());
    if (!line || ITEM_SKIP.test(norm(line))) continue;
    const pm = line.match(
      new RegExp(`(?:r?\\$?\\s*)?${AMOUNT_RE}\\s*$`, "i"),
    );
    if (!pm) continue;
    const price = parseAmountToken(pm[1]);
    if (!(price > 0)) continue;
    let namePart = line.slice(0, pm.index ?? 0).trim();
    if (namePart.length < 3) continue;

    // Quantity: "1 UN", "5KG", "2X", "1,5KG"… anywhere in the name.
    let qty = "";
    const qm = namePart.match(
      new RegExp(`(?:^|\\s)(\\d+(?:[.,]\\d+)?)\\s*(${QTY_UNITS})\\b(?=\\s|$)`, "i"),
    );
    if (qm) {
      qty = `${qm[1]} ${qm[2].toLowerCase()}`;
      namePart = namePart.replace(qm[0], " ").trim();
    }

    const name = titleCase(stripNameNoise(namePart));
    if (name.length < 2) continue;
    if (items.length >= 10) break;
    items.push({ name, qty, price });
  }
  return items;
}

/** "• Pipoca 1 un · R$ 5,00" — the organized list used to prefill the draft. */
export function formatItemsText(items: ReceiptItem[]): string {
  if (!items.length) return "";
  const lines = items.map((it) => {
    const qty = it.qty ? ` ${it.qty}` : "";
    const price = it.price.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    return `• ${it.name}${qty} · ${price}`;
  });
  let out = `Itens da nota:\n${lines.join("\n")}`;
  if (out.length > 290) out = out.slice(0, 287) + "…";
  return out;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-failed"));
    img.src = src;
  });
}

/** Downscale + re-encode an image file into a compact JPEG data URL. */
export function imageToDataUrl(
  file: File,
  maxSize = 1000,
  quality = 0.82,
): Promise<string> {
  return (async () => {
    const img = await loadImage(await fileToDataUrl(file));
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  })();
}

/**
 * Prepares an image (original File or data URL) for OCR: upscales small
 * thermal-receipt photos to ~1800px on the long edge, converts to grayscale
 * and stretches the contrast so tiny print is readable by Tesseract.
 */
export async function prepareForOcr(input: File | string): Promise<string> {
  const url = typeof input === "string" ? input : await fileToDataUrl(input);
  const img = await loadImage(url);
  const maxDim = Math.max(img.width, img.height);
  const scale = Math.min(2.5, Math.max(1200 / maxDim, 1800 / maxDim));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const px = imageData.data;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = Math.max(1, hi - lo);
  const gain = 255 / range;
  for (let i = 0; i < px.length; i += 4) {
    const g = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] - lo) * gain;
    const v = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// QR codes — decode PIX "copia e cola" (BR Code) payloads from the photo:
// field 54 is the amount, 59 the merchant name and 62 the description/txid.
// A payment-screen QR is often MORE reliable than OCR for the exact value.
// ---------------------------------------------------------------------------

export type QrResult = {
  payload: string;
  amount?: number;
  name?: string;
  description?: string;
  /** NFC-e access-key metadata (from a SEFAZ "consultar" URL). */
  nfceStore?: string;
  nfceEmissionDate?: string; // yyyy-mm-dd from the AAMM inside the key
};

/**
 * Small demo reference of CNPJ → store name, used to turn the NFC-e access
 * key into a readable description. The key itself only encodes the merchant's
 * CNPJ (positions 6–19) and the emission date (positions 2–5, AAMM).
 */
const NFC_E_CNPJ_NAMES: Record<string, string> = {
  "00000000000000": "Loja",
  "06057223000171": "Pão de Açúcar",
  "07526557000100": "Carrefour",
  "47960950000121": "Mercado Livre",
  "05172726000150": "Magazine Luiza",
  "05433223000123": "Casas Bahia",
  "00841764000185": "iFood",
  "03633176000110": "Shopee",
  "07109258000153": "Rappi",
  "17368313000184": "Nubank",
};

/** Formats "06057223000171" → "06.057.223/0001-71". */
function formatCnpj(cnpj: string): string {
  return cnpj.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

/**
 * Parses an NFC-e QR payload (the SEFAZ "consultar" URL, e.g.
 * `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=352607…`): extracts the
 * 44-digit access key, the emission date (AAMM) and the merchant CNPJ, and
 * resolves the CNPJ to a store name when known. The key never carries the
 * total — that still comes from OCR (or the user).
 */
export function parseNfceQrUrl(payload: string): QrResult | null {
  const digits = payload.replace(/\D/g, "");
  // The access key is the longest 44-digit run in the URL (query params like
  // "p=" carry it). Prefer a digit run that is exactly 44 long, otherwise
  // fall back to the first 44 digits of the full number string.
  const exact = digits.match(/(?<!\d)\d{44}(?!\d)/);
  const key = (exact?.[0] ?? digits.slice(0, 44)) || "";
  if (key.length !== 44) return null;
  const uf = parseInt(key.slice(0, 2), 10);
  if (!(uf >= 11 && uf <= 53)) return null; // not a valid IBGE UF code
  const aamm = key.slice(2, 6);
  const cnpj = key.slice(6, 20);
  const mm = parseInt(aamm.slice(2, 4), 10);
  if (!(mm >= 1 && mm <= 12)) return null;
  const yy = parseInt(aamm.slice(0, 2), 10);
  const year = 2000 + yy;
  const store = NFC_E_CNPJ_NAMES[cnpj] ?? `Estabelecimento ${formatCnpj(cnpj)}`;
  return {
    payload,
    nfceStore: store,
    nfceEmissionDate: `${year}-${String(mm).padStart(2, "0")}-01`,
  };
}

/**
 * Classifies any QR payload: PIX "copia e cola" → its structured fields;
 * NFC-e consult URL → the access-key metadata; otherwise a minimal result
 * with the raw payload (useful for the camera scanner's preview).
 */
export function parseQrFromPayload(payload: string): QrResult {
  const nfce = parseNfceQrUrl(payload);
  if (nfce) return nfce;
  return { payload, ...parseBrCode(payload) };
}

/** Yields EMV-style fields (2-char id + 2-char length + value). */
function* emvFields(s: string): Generator<[string, string]> {
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (!/^\d{2}$/.test(id) || !Number.isFinite(len) || len < 0) break;
    const value = s.slice(i + 4, i + 4 + len);
    if (value.length < len) break;
    yield [id, value];
    i += 4 + len;
  }
}

/** Parses a BR Code / PIX "copia e cola" payload into useful fields. */
export function parseBrCode(
  payload: string,
): Pick<QrResult, "amount" | "name" | "description"> {
  const out: Pick<QrResult, "amount" | "name" | "description"> = {};
  for (const [id, value] of emvFields(payload)) {
    if (id === "54" && out.amount === undefined) {
      const n = parseFloat(value.replace(",", "."));
      if (Number.isFinite(n) && n > 0) out.amount = n;
    } else if (id === "59" && out.name === undefined && value.trim()) {
      out.name = value.trim().slice(0, 40);
    } else if (id === "62" && out.description === undefined) {
      // Sub-fields: 07 additional info, 01 reference label, 05 txid.
      for (const [sub, subValue] of emvFields(value)) {
        if ((sub === "07" || sub === "01" || sub === "05") && subValue.trim()) {
          out.description = subValue.trim().slice(0, 60);
          break;
        }
      }
    }
  }
  return out;
}

/** Decodes a QR code in an image (original File or data URL) and, when it is
 * a PIX "copia e cola" payload, returns its structured data. Returns null on
 * no QR / decode failure — never throws. */
export async function decodeQrPayload(
  input: File | string,
): Promise<QrResult | null> {
  try {
    const src = typeof input === "string" ? input : await fileToDataUrl(input);
    const img = await loadImage(src);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const base = ctx.getImageData(0, 0, w, h).data;

    // Try the photo as-is, then grayscale, then inverted — QR codes on
    // dark-mode screenshots (white-on-dark) only decode on the inverted pass.
    const attempts: Uint8ClampedArray[] = [base];
    const gray = new Uint8ClampedArray(base);
    const inv = new Uint8ClampedArray(base);
    for (let i = 0; i < base.length; i += 4) {
      const g = 0.299 * base[i] + 0.587 * base[i + 1] + 0.114 * base[i + 2];
      gray[i] = g;
      gray[i + 1] = g;
      gray[i + 2] = g;
      gray[i + 3] = 255;
      inv[i] = 255 - base[i];
      inv[i + 1] = 255 - base[i + 1];
      inv[i + 2] = 255 - base[i + 2];
      inv[i + 3] = 255;
    }
    attempts.push(gray, inv);

    for (const data of attempts) {
      const code = jsQR(data, w, h);
      if (!code?.data) continue;
      const parsed = parseBrCode(code.data);
      return { payload: code.data, ...parsed };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OCR — Tesseract.js loading the worker, core and Portuguese traineddata
// from its default jsDelivr CDN (the /public copies aren't served by the
// preview proxy, which returns 502 for static files).
// ---------------------------------------------------------------------------

/**
 * OCR an image (original File or data URL) with Tesseract.js. The worker,
 * core and Portuguese traineddata load from the default jsDelivr CDN — the
 * copies under /public are unreachable in the preview proxy (it returns 502
 * for static files), while the CDN is verified reachable from the sandbox.
 */
export async function scanReceiptText(input: File | string): Promise<string> {
  const prepared = await prepareForOcr(input);
  const worker = await Tesseract.createWorker("por", Tesseract.OEM.LSTM_ONLY);
  try {
    const { data } = await worker.recognize(prepared);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export async function scanReceiptWithTimeout(
  input: File | string,
  ms = 90_000,
): Promise<string> {
  return Promise.race([
    scanReceiptText(input),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ocr-timeout")), ms),
    ),
  ]);
}
