import jsQR from "jsqr";

// ---------------------------------------------------------------------------
// Leitor de Notas — decodificação de QR codes + classificação de categorias.
// O fluxo é 100% baseado em QR code: a URL de consulta da NFC-e (SEFAZ) vai
// para o backend (action Convex + cheerio, que raspa os dados exatos da nota)
// e o PIX "copia e cola" entrega valor e nome do recebedor direto do código.
// Sem OCR: texto de cupom térmico é imprevisível e o OCR "alucina" números.
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

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** norm() plus the letter→digit mapping OCR confuses, applied to BOTH the
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

/** Bank-receipt context (comprovante, depósito, PIX, agência, conta…) — the
 * text is a payment screenshot, NOT a store receipt, so store-ish keywords
 * ("mercado" in "MERCADO PAGO") must not drive the category. */
const BANKING_CTX =
  /comprovante|instituicao de pagamento|numero de conta|nr\. de conta|\bagencia\b|\bfavorecido\b|\brecebedor\b|\borigem\b|\bdestino\b|mercado pago|operacao de|id da transacao|deposit|transferencia|\bestorno\b/i;

/** Categories that still make sense on a bank receipt (income signals). */
const BANKING_ALLOWED = new Set(["salario", "freelance", "assinaturas"]);

/** Matches a text against the scan/voice category keywords. */
export function findCategoryId(text: string, title = ""): string {
  // Bank receipts: suppress store keywords entirely.
  const bank = BANKING_CTX.test(norm(text));
  // 1) The store name is the strongest signal.
  const titleNorm = ocrNorm(title);
  if (titleNorm && !bank) {
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
    if (id && (!bank || BANKING_ALLOWED.has(id))) return id;
  }
  // 3) Full text, strong keywords only.
  const id = matchInCategory(ocrNorm(text), false);
  if (id && (!bank || BANKING_ALLOWED.has(id))) return id;
  return "outros";
}

// ---------------------------------------------------------------------------
// Imagens — downscale e re-encode de um arquivo em data URL compacta.
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

// ---------------------------------------------------------------------------
// QR codes — decodifica PIX "copia e cola" (BR Code: campo 54 valor, 59 nome
// do recebedor, 62 descrição/txid) e URLs de consulta de NFC-e (SEFAZ). A
// URL da nota vai para a action do backend, que raspa os dados exatos.
// ---------------------------------------------------------------------------

export type QrResult = {
  payload: string;
  amount?: number;
  name?: string;
  description?: string;
  /** The http(s) URL when the payload is a web link (e.g. a SEFAZ NFC-e
   * consult URL) — the client sends it to the scrape action. */
  url?: string;
  /** true → URL de consulta de NFC-e (SEFAZ) reconhecida pela chave de
   * acesso; false → link comum que não é nota fiscal. undefined → o payload
   * não é um link. */
  isNfce?: boolean;
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
 * total — that comes from the backend scrape of the URL.
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
    url: payload,
    isNfce: true,
    nfceStore: store,
    nfceEmissionDate: `${year}-${String(mm).padStart(2, "0")}-01`,
  };
}

/**
 * Classifies any QR payload: PIX "copia e cola" → its structured fields;
 * NFC-e consult URL → the access-key metadata; otherwise a minimal result
 * with the raw payload.
 */
export function parseQrFromPayload(payload: string): QrResult {
  const nfce = parseNfceQrUrl(payload);
  if (nfce) return nfce;
  // Qualquer outro link (ex.: Mercado Pago, checkout) é marcado como
  // não-NFC-e para o cliente dar uma mensagem clara em vez de "url não
  // permitida" vinda do backend.
  if (/^https?:\/\//i.test(payload)) {
    return { payload, url: payload, isNfce: false, ...parseBrCode(payload) };
  }
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

// ---------------------------------------------------------------------------
// Detecção de QR — três camadas, da mais robusta à mais barata:
//   1) BarcodeDetector nativo (Chrome/Edge/Android): roda na imagem em
//      resolução original e lê QR pequenos ou inclinados que o jsQR perde;
//   2) jsQR em várias renderizações (descida suavizada para fotos grandes,
//      subida com vizinho mais próximo — bordas de módulo nítidas — para
//      capturas pequenas);
//   3) binarização Otsu e limiar adaptativo (integral image) para fotos com
//      sombra, brilho ou contraste baixo, onde o binarizador interno do jsQR
//      falha.
// ---------------------------------------------------------------------------

type NativeCode = { rawValue: string };

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeCode[]>;
};

/** Singleton do BarcodeDetector nativo, quando o navegador tem (Chrome,
 * Edge, Android). Nunca lança. */
function getNativeDetector(): NativeDetector | null {
  const w = window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => NativeDetector;
  };
  if (typeof w.BarcodeDetector !== "function") return null;
  try {
    return new w.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/** Tenta ler o QR com o detector nativo do navegador (se existir). */
async function detectNative(source: CanvasImageSource): Promise<string | null> {
  try {
    const detector = getNativeDetector();
    if (!detector) return null;
    const codes = await detector.detect(source);
    const raw = codes?.[0]?.rawValue;
    return typeof raw === "string" && raw ? raw : null;
  } catch {
    return null;
  }
}

/** Binariza uma imagem RGBA em preto/branco com o limiar automático de Otsu
 * (escolhe o limiar que melhor separa o QR do fundo, sem valor fixo que
 * falha em fotos claras/escuras demais). */
export function otsuBinarize(base: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  const total = base.length / 4;
  for (let i = 0; i < base.length; i += 4) {
    hist[(0.299 * base[i] + 0.587 * base[i + 1] + 0.114 * base[i + 2]) | 0]++;
  }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let bestVar = -1;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) {
      bestVar = v;
      thr = t;
    }
  }
  const out = new Uint8ClampedArray(base);
  for (let i = 0; i < out.length; i += 4) {
    const lum = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    const v = lum < thr ? 0 : 255;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/** Binarização adaptativa (média local via integral image): cada pixel vira
 * preto/branco comparado com a média da vizinhança — robusta a sombras,
 * brilho e fundo degradê, que derrubam qualquer limiar fixo. */
function adaptiveBinarize(
  base: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const itg = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row += 0.299 * base[i] + 0.587 * base[i + 1] + 0.114 * base[i + 2];
      itg[y * w + x] = row + (y > 0 ? itg[(y - 1) * w + x] : 0);
    }
  }
  const out = new Uint8ClampedArray(base);
  const s = Math.max(16, Math.round(Math.min(w, h) / 16));
  const half = s >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const sum =
        itg[y1 * w + x1] -
        (x0 > 0 ? itg[y1 * w + x0 - 1] : 0) -
        (y0 > 0 ? itg[(y0 - 1) * w + x1] : 0) +
        (x0 > 0 && y0 > 0 ? itg[(y0 - 1) * w + x0 - 1] : 0);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const mean = sum / count;
      const i = (y * w + x) * 4;
      const lum = 0.299 * base[i] + 0.587 * base[i + 1] + 0.114 * base[i + 2];
      const v = lum < mean - 4 ? 0 : 255;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return out;
}

type QrRender = { w: number; h: number; smooth: boolean; size: number };

/** Renders the source image onto a fresh canvas at the given size. Returns
 * the canvas (caller decides what to do with it) or null when 2D context is
 * unavailable. */
function renderCanvas(img: HTMLImageElement, r: QrRender): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = r.smooth;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.drawImage(img, 0, 0, r.w, r.h);
  return canvas;
}

/**
 * Decodes a QR code in an image (original File or data URL) and returns the
 * classified payload (NFC-e URL, PIX BR Code, …). Returns null on no QR /
 * decode failure — never throws.
 *
 * Ordem das camadas:
 *   1) BarcodeDetector nativo (Chrome/Edge/Android) na imagem em resolução
 *      original e, se falhar, numa renderização reduzida (alguns navegadores
 *      desistem de imagens gigantes);
 *   2) jsQR em várias renderizações — descidas suavizadas para fotos grandes,
 *      subidas com vizinho mais próximo para capturas pequenas;
 *   3) binarizações Otsu + adaptativa para sombra/baixo contraste.
 *
 * `onProgress` recebe um rótulo curto em português entre as camadas, para a
 * tela de escaneamento mostrar que a leitura está progredindo (fotos grandes
 * demoram alguns segundos — antes parecia travado).
 */
export async function decodeQrPayload(
  input: File | string,
  onProgress?: (label: string) => void,
): Promise<QrResult | null> {
  try {
    const src = typeof input === "string" ? input : await fileToDataUrl(input);
    const img = await loadImage(src);
    const w0 = img.width;
    const h0 = img.height;
    if (!w0 || !h0) return null;

    // Renderizações em várias resoluções (ver Camada 2 acima para a lógica).
    const maxSide = Math.max(w0, h0);
    const sizes = new Set<number>();
    sizes.add(Math.min(1400, maxSide));
    if (maxSide > 1400) sizes.add(Math.min(2000, maxSide));
    if (maxSide > 2000) sizes.add(Math.min(2800, maxSide));
    if (maxSide < 1600) sizes.add(2400);
    if (maxSide < 2200) sizes.add(3200);
    const renders: QrRender[] = [...sizes]
      .filter((size) => size > 0 && size <= 3200)
      .map((size) => ({
        w: Math.max(1, Math.round((w0 * size) / maxSide)),
        h: Math.max(1, Math.round((h0 * size) / maxSide)),
        smooth: size <= maxSide,
        size,
      }))
      .sort((a, b) => a.size - b.size);

    // Camada 1 — detector nativo na imagem original e, se falhar, no render
    // de maior resolução (QR pequeno dentro de uma foto enorme).
    onProgress?.("Procurando o QR code na imagem…");
    let native = await detectNative(img);
    if (native) return parseQrFromPayload(native);
    const biggest = renders[renders.length - 1];
    if (biggest && biggest.size < maxSide) {
      const canvas = renderCanvas(img, biggest);
      if (canvas) {
        native = await detectNative(canvas);
        if (native) return parseQrFromPayload(native);
      }
    }

    // Camada 2 — jsQR nas renderizações, da menor (rápida) para a maior.
    for (const r of renders) {
      onProgress?.(
        r.size > 2000
          ? "Analisando em alta resolução…"
          : "Lendo o QR code…",
      );
      const canvas = renderCanvas(img, r);
      if (!canvas) continue;
      const base = canvas
        .getContext("2d", { willReadFrequently: true })
        ?.getImageData(0, 0, r.w, r.h).data;
      if (!base) continue;
      const code = jsQR(base, r.w, r.h);
      if (code?.data) return parseQrFromPayload(code.data);
    }

    // Camada 3 — binarizações (sombra/brilho/contraste baixo). A adaptativa
    // é cara em imagens grandes, então só roda até ~4 MP por render.
    for (const r of renders) {
      onProgress?.("Ajustando contraste da imagem…");
      const canvas = renderCanvas(img, r);
      if (!canvas) continue;
      const base = canvas
        .getContext("2d", { willReadFrequently: true })
        ?.getImageData(0, 0, r.w, r.h).data;
      if (!base) continue;
      const passes: Uint8ClampedArray[] = [otsuBinarize(base)];
      if (r.w * r.h <= 4_000_000) passes.push(adaptiveBinarize(base, r.w, r.h));
      for (const data of passes) {
        const code = jsQR(data, r.w, r.h);
        if (code?.data) return parseQrFromPayload(code.data);
      }
    }
    return null;
  } catch {
    return null;
  }
}
