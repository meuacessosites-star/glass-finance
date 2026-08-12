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
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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
 * Picks the best amount: an explicit "total/valor/pago" line first (ignoring
 * "total itens"), then the last R$ value on the receipt.
 */
function findAmount(text: string): number {
  const totalLine = text.match(
    /^\s*(?:total(?: a pagar| pago)?|valor(?: total)?|a pagar)\b(?!\s*itens)[^0-9]*([\d.,]+)/im,
  );
  if (totalLine) {
    const n = parseBrl(totalLine[1]);
    if (n > 0) return n;
  }
  const totalAnywhere = text.match(
    /\btotal(?: a pagar| pago)?\b(?!\s*itens)[^0-9]*([\d.,]+)/i,
  );
  if (totalAnywhere) {
    const n = parseBrl(totalAnywhere[1]);
    if (n > 0) return n;
  }
  const values = [...text.matchAll(/r\$\s*([\d.,]+)/gi)].map((m) =>
    parseBrl(m[1]),
  );
  const last = values[values.length - 1];
  if (last && last > 0) return last;
  return 0;
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
  /cnpj|cpf|ie\s*:|inscricao|cupom|nfc-e|nf-e|\bnfce\b|\bnfc\b|\bnf\b|emitido|emissao|data|hora|total|subtotal|troco|desconto|pagamento|numero|nr\.|telefone|fone|endereco|endereço|www|\.com|caixa|operador|consumidor|qtd|quantidade|dinheiro|cartao|pix|sat|protocolo|\brua\b|\bavenida\b|\bav\.\b/i;

/**
 * A line that survived cleanup is a plausible store name: mostly letters,
 * no digits glued to letters (barcodes / access keys OCR as digit-letter
 * gibberish like "WVOB8o0oH-CEE"), and no separator runs or 4+ repeated
 * chars.
 */
function looksLikeStoreName(line: string): boolean {
  if ((line.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length < 4) return false;
  if (/[a-zA-ZÀ-ÿ]\d|\d[a-zA-ZÀ-ÿ]/.test(line)) return false;
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
    if (/^\d/.test(cleaned)) continue; // item / code line
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

/** Matches every category's keywords against one normalized haystack scope. */
function matchInCategory(haystack: string, isTitle: boolean): string {
  for (const cat of SCAN_CATEGORIES) {
    if (cat.id === "outros") continue;
    for (const kw of cat.keywords) {
      const k = norm(kw);
      if (!k) continue;
      const contextual = CONTEXT_KEYWORDS[k];
      if (contextual) {
        if (!isTitle && !contextual.some((c) => haystack.includes(norm(c))))
          continue;
      } else if (TITLE_ONLY_KEYWORDS.has(k) && !isTitle) {
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
  const titleNorm = norm(title);
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
    const id = matchInCategory(norm(line), false);
    if (id) return id;
  }
  // 3) Full text, strong keywords only.
  return matchInCategory(norm(text), false) || "outros";
}

/** First valid HH:MM (also accepts "HH:MM:SS" and "HHhMM") inside a line. */
function findTimeInLine(line: string): string {
  const m = line.match(/([01]\d|2[0-3]):([0-5]\d)/);
  if (m) return `${m[1]}:${m[2]}`;
  const h = line.match(/([01]\d|2[0-3])h([0-5]\d)/i);
  return h ? `${h[1]}:${h[2]}` : "";
}

/** Emission-context words (data/hora/emissão/saída/venda/compra). */
const EMISSION_CTX = /(^|[^a-z])(data|hora)|emiss|saida|emit|venda|compra/i;
/** Expiry / due-date words — never the purchase date ("DATA DE VALIDADE"). */
const VALIDITY_CTX = /(^|[^a-z])(val|validade|venc|vencimento|expir)/i;

function findDate(text: string): { date: string; time: string } {
  const lines = text.split("\n");
  let best: { date: string; line: string; score: number } | null = null;
  const dmyRe = /(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/;
  const isoRe = /(\d{4})-(\d{2})-(\d{2})/;

  for (const line of lines) {
    const ctx = norm(line);
    if (VALIDITY_CTX.test(ctx)) continue; // "VAL 30/08/2026" etc. — not the purchase date
    const dm = line.match(dmyRe);
    if (dm) {
      const d = parseInt(dm[1], 10);
      const mo = parseInt(dm[2], 10);
      const y = parseInt(dm[3], 10);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) {
        const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const score = EMISSION_CTX.test(ctx) ? 2 : 1;
        if (!best || score > best.score) best = { date, line, score };
      }
    }
    const im = line.match(isoRe);
    if (im) {
      const mo = parseInt(im[2], 10);
      const d = parseInt(im[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        const date = im[0];
        const score = EMISSION_CTX.test(ctx) ? 2 : 1;
        if (!best || score > best.score) best = { date, line, score };
      }
    }
  }

  let time = "";
  if (best) {
    // Prefer the time right after the date token ("DATA 05/08/2026 14:32:05"),
    // then any valid time on the emission line itself.
    const dm = best.line.match(dmyRe) ?? best.line.match(isoRe);
    const after = dm ? best.line.slice((dm.index ?? 0) + dm[0].length) : best.line;
    time = findTimeInLine(after) || findTimeInLine(best.line);
  }
  if (!time) {
    // The date line had no time — look only at lines that mention HORA/emissão
    // (never scan item lines: prices like "12:50" can be OCR'd with a colon).
    for (const line of lines) {
      if (/\bhora\b|emiss|saida/.test(norm(line))) {
        time = findTimeInLine(line);
        if (time) break;
      }
    }
  }
  return { date: best?.date ?? "", time };
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
  };
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
