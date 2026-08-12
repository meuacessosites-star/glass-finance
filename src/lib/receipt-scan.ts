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
      "mercado",
      "padaria",
      "pao de acucar",
      "pão de açúcar",
      "carrefour",
      "assai",
      "atacadao",
      "hortifruti",
      "feira",
      "acougue",
      "sadia",
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
      "taxi",
      "99pop",
      "posto",
      "shell",
      "gasolina",
      "combustivel",
      "combustível",
      "estacionamento",
      "metro",
      "onibus",
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
      "energia",
      "agua",
      "água",
      "conta de luz",
      "telefonia",
      "internet fibra",
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
    keywords: ["hotel", "airbnb", "voo", "passagem", "hostel"],
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
      "prime",
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

/** Picks the best amount: a "total/pago/valor" line first, then the last R$ value. */
function findAmount(text: string): number {
  const totalLine = text.match(
    /^(?:total|valor(?: total)?|pago|valido|valor a pagar)\b[^0-9]*([\d.,]+)/im,
  );
  if (totalLine) {
    const n = parseBrl(totalLine[1]);
    if (n > 0) return n;
  }
  const values = [...text.matchAll(/r\$\s*([\d.,]+)/gi)].map((m) => parseBrl(m[1]));
  const last = values[values.length - 1];
  if (last && last > 0) return last;
  return 0;
}

const BAD_TITLE_LINE = /cnpj|cpf|cupom|nfc-e|nf-e|emitido|data:|hora:|total|troco|desconto|pagamento|numero|nr\.|telefone|endereco|endereço|www|\.com\.br/i;

function findTitle(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (!/[a-zà-ú]{3,}/i.test(line)) continue;
    if (BAD_TITLE_LINE.test(line)) continue;
    return line.slice(0, 40);
  }
  return "";
}

/** Matches a text against the scan/voice category keywords. */
export function findCategoryId(text: string): string {
  const t = norm(text);
  for (const cat of SCAN_CATEGORIES) {
    if (cat.id === "outros") continue;
    if (cat.keywords.some((k) => t.includes(norm(k)))) return cat.id;
  }
  return "outros";
}

function findDate(text: string): { date: string; time: string } {
  const dm = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const date = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : "";
  const tm = text.match(/(\d{2}):(\d{2})/);
  const time = tm ? `${tm[1]}:${tm[2]}` : "";
  return { date, time };
}

export function parseReceiptText(text: string): ScanResult {
  const { date, time } = findDate(text);
  return {
    title: findTitle(text),
    amount: findAmount(text),
    categoryId: findCategoryId(text),
    date,
    time,
  };
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

/** Downscale + re-encode an image file into a compact JPEG data URL. */
export function imageToDataUrl(
  file: File,
  maxSize = 1000,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no-canvas"));
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** OCR an image (data URL) with Tesseract.js — Portuguese, LSTM-only. */
export async function scanReceiptText(image: string): Promise<string> {
  const worker = await Tesseract.createWorker("por");
  try {
    const { data } = await worker.recognize(image);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export async function scanReceiptWithTimeout(
  image: string,
  ms = 60_000,
): Promise<string> {
  return Promise.race([
    scanReceiptText(image),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ocr-timeout")), ms),
    ),
  ]);
}
