import { findCategoryId, parseBrl } from "./receipt-scan";

// ---------------------------------------------------------------------------
// Comando de Voz — turns a spoken (or typed) Portuguese sentence into a
// transaction draft: "gastei cinquenta reais no mercado" → R$ 50, Mercado,
// Alimentação, hoje. Amounts work both as digits ("R$ 40,50") and as written
// words ("duzentos e quarenta e nove reais e noventa centavos").
// ---------------------------------------------------------------------------

export type VoiceCommandResult = {
  title: string;
  amount: number; // positive BRL value
  categoryId: string;
  date: string; // yyyy-mm-dd
  time: string; // HH:MM ("" when not mentioned)
  isIncome: boolean;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const UNITS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};

const TENS: Record<string, number> = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};

const HUNDREDS: Record<string, number> = {
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

const NUMBER_WORDS: Record<string, number> = {
  ...UNITS,
  ...TENS,
  ...HUNDREDS,
  mil: 1000,
};

/** "duzentos e quarenta e nove" → 249. Null when no valid number is found. */
function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  for (const raw of words) {
    const w = normalize(raw);
    if (w === "e") continue;
    const v = NUMBER_WORDS[w];
    if (v === undefined) return null;
    if (v === 1000) {
      total += (current > 0 ? current : 1) * 1000;
      current = 0;
    } else {
      current += v;
    }
  }
  const result = total + current;
  return result > 0 ? result : null;
}

/** Collects the run of number words (and "e") right before `endIndex`. */
function runBefore(words: string[], endIndex: number): string[] {
  const run: string[] = [];
  for (let i = endIndex - 1; i >= 0; i--) {
    const w = normalize(words[i]);
    if (w === "e" || NUMBER_WORDS[w] !== undefined) run.unshift(words[i]);
    else break;
  }
  return run;
}

function findAmount(text: string): number {
  const words = text.split(/\s+/);

  // 1) Digit forms: "40,50 reais", "R$ 40,50", "50 centavos"
  const reaisMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*reais/i);
  const rMatch = text.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i);
  let value = 0;
  if (reaisMatch) value = parseBrl(reaisMatch[1]);
  else if (rMatch) value = parseBrl(rMatch[1]);
  if (value > 0) {
    if (!/[.,]\d{1,2}\s*reais/i.test(text)) {
      const cents = text.match(/(\d{1,2})\s*centavos/i);
      if (cents) value += parseBrl(cents[1]) / 100;
    }
    return value;
  }

  // 2) Spoken numbers before "reais" / "real"
  const reaisIdx = words.findIndex(
    (w) => normalize(w) === "reais" || normalize(w) === "real",
  );
  if (reaisIdx >= 0) {
    const intVal = wordsToNumber(runBefore(words, reaisIdx));
    if (intVal !== null) {
      value = intVal;
      const hasCentavos = words.some((w) => normalize(w) === "centavos");
      if (hasCentavos) {
        const centsIdx = words.findIndex((w) => normalize(w) === "centavos");
        const centVal = wordsToNumber(runBefore(words, centsIdx));
        if (centVal !== null && centVal >= 1 && centVal < 100) {
          value += centVal / 100;
        }
      } else {
        // "reais e cinquenta" (centavos implied)
        const after = words.slice(reaisIdx + 1);
        let k = normalize(after[0] ?? "") === "e" ? 1 : 0;
        const centRun: string[] = [];
        while (k < after.length) {
          const n = normalize(after[k]);
          if (NUMBER_WORDS[n] !== undefined) {
            centRun.push(after[k]);
            k++;
          } else break;
        }
        const centVal = wordsToNumber(centRun);
        if (centVal !== null && centVal >= 1 && centVal < 100) {
          value += centVal / 100;
        }
      }
      return value;
    }
  }

  // 3) "noventa centavos" alone
  const centsIdx = words.findIndex((w) => normalize(w) === "centavos");
  if (centsIdx >= 0) {
    const centVal = wordsToNumber(runBefore(words, centsIdx));
    if (centVal !== null && centVal >= 1 && centVal < 100) return centVal / 100;
  }

  // 4) Any spoken number run ("quarenta e cinco para o uber")
  let bestRun: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = normalize(words[i]);
    if (NUMBER_WORDS[w] === undefined && w !== "e") continue;
    const run: string[] = [];
    let j = i;
    while (j < words.length) {
      const wj = normalize(words[j]);
      if (NUMBER_WORDS[wj] !== undefined || wj === "e") run.push(words[j]);
      else break;
      j++;
    }
    if (run.length > bestRun.length) bestRun = run;
    i = j - 1;
  }
  const v = wordsToNumber(bestRun);
  if (v !== null) return v;

  // 5) Last resort: any digit in the sentence
  const anyDigit = text.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);
  if (anyDigit) return parseBrl(anyDigit[1]);
  return 0;
}

const STOP_WORDS = new Set([
  "gastei", "gastamos", "gastei", "gastar", "gasto", "gastos",
  "paguei", "pagamos", "paguei", "pagar", "paga",
  "recebi", "ganhei", "recebemos",
  "comprei", "compramos", "comprar",
  "registrar", "registrei", "registramos", "vamos", "quero", "queria",
  "eu", "no", "na", "nos", "nas", "o", "a", "os", "as",
  "em", "com", "de", "do", "da", "dos", "das", "por", "para", "pra",
  "hoje", "ontem", "anteontem", "agora", "tambem", "foi", "fui", "e",
  "meu", "minha", "meus", "minhas",
  "reais", "real", "centavos", "centavo", "r$", "virgula",
]);

function cleanTitle(text: string): string {
  let t = text;
  t = t.replace(/(?:às|as)\s*\d{1,2}\s*[h:.]\s*\d{0,2}/gi, " ");
  t = t.replace(/\d{1,2}h\d{2}/gi, " ");
  t = t.replace(/r\$\s*\d[\d.,]*/gi, " ");
  t = t.replace(/\b\d+(?:[.,]\d{1,2})?\b/g, " ");
  const words = t.split(/\s+/).filter((w) => {
    const n = normalize(w);
    return !!w && !STOP_WORDS.has(n) && NUMBER_WORDS[n] === undefined;
  });
  const out = words.join(" ").replace(/\s+/g, " ").trim().slice(0, 40);
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : "";
}

export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function findTime(text: string): string {
  const m =
    text.match(/(?:às|as)\s*(\d{1,2})\s*[h:.]\.?\s*(\d{2})?/i) ??
    text.match(/(\d{1,2})h(\d{2})/i);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${(m[2] ?? "00").padStart(2, "0")}`;
}

export function parseVoiceCommand(text: string): VoiceCommandResult {
  const lower = text.toLowerCase();
  let categoryId = /\bsalari[íi]o\b/.test(lower)
    ? "salario"
    : findCategoryId(text);
  const isIncome = /recebi|ganhei|recebemos|renda|entrou um/i.test(lower);
  if (isIncome && categoryId === "outros" && /\bsalari[íi]o\b/.test(lower)) {
    categoryId = "salario";
  }

  let date = todayIso();
  if (/anteontem/i.test(lower)) date = todayIso(-2);
  else if (/ontem/i.test(lower)) date = todayIso(-1);

  return {
    title: cleanTitle(text),
    amount: findAmount(text),
    categoryId,
    date,
    time: findTime(text),
    isIncome,
  };
}
