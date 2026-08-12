// ---------------------------------------------------------------------------
// Leitor de Notas — categorização e preparação de imagens.
//
// SEM QR CODE: a leitura da nota é 100% feita por um modelo Vision LLM no
// backend (src/convex/aiVision.ts). Este módulo fornece apenas:
//   - categorias sugeridas (SCAN_CATEGORIES) e classificação por palavras-
//     chave (findCategoryId, usada também pelo comando de voz);
//   - conversão de imagem para data URL compacta (imageToDataUrl);
//   - parseBrl para valores em pt-BR (comando de voz).
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
