"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Leitor de Comprovantes — 100% Google Gemini (SEM QR Code, SEM OCR local).
//
// O frontend envia QUALQUER imagem (nota fiscal com/sem QR, recibo comum)
// como data URL; esta action manda o base64 direto para o modelo de visão
// gemini-1.5-flash com o System Prompt estrito abaixo, que devolve APENAS o
// JSON { estabelecimento, valor_total, data, itens: [{ qtd, produto, valor }] }.
// O resultado é normalizado para a forma que a tela de aprovação consome.
// ---------------------------------------------------------------------------

export type ReceiptItem = { name: string; qty: string; price: number };

export type ReceiptResult = {
  ok: boolean;
  store?: string;
  date?: string; // yyyy-mm-dd (input date nativo)
  time?: string; // HH:MM
  total?: number;
  items: ReceiptItem[];
  error?: string;
};

/** System Prompt estrito — retorna EXATAMENTE o JSON com esta estrutura. */
const SYSTEM_PROMPT =
  "Você é um leitor de comprovantes. Analise a imagem fornecida (que pode " +
  "ser uma nota fiscal com ou sem QR code, ou um recibo comum) e extraia os " +
  "dados lendo os textos impressos. Retorne APENAS um objeto JSON válido. " +
  'Estrutura obrigatória: { "estabelecimento": "Nome Fantasia limpo", ' +
  '"valor_total": 0.00, "data": "DD/MM/AAAA", "itens": [ { "qtd": 1, ' +
  '"produto": "Nome real do produto", "valor": 0.00 } ] }';

const MODEL = "gemini-1.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type GeminiItem = { qtd?: number | string; produto?: string; valor?: number | string };
type GeminiReceipt = {
  estabelecimento?: string;
  valor_total?: number | string;
  data?: string;
  itens?: GeminiItem[];
};

const stripMarkdown = (s: string) =>
  s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

/** "1.234,56" / "1234.56" / "123,45" / 1234.5 → number (0 quando inválido). */
function parseNumber(input: unknown): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input !== "string") return 0;
  let t = input.replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && hasDot) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    t = t.replace(",", ".");
  } else if (hasDot) {
    const parts = t.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && last.length === 3) t = t.replace(".", "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** "DD/MM/AAAA" (ou "AAAA-MM-DD") → "AAAA-MM-DD" para o input date. */
function toIsoDate(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const br = t.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

/** Normaliza o JSON devolvido pelo modelo na forma usada pela tela. */
function normalizeGemini(text: string): ReceiptResult {
  try {
    const parsed = JSON.parse(stripMarkdown(text)) as GeminiReceipt;
    const items: ReceiptItem[] = (Array.isArray(parsed.itens) ? parsed.itens : [])
      .slice(0, 30)
      .map((i) => ({
        name: String(i.produto ?? "").trim().slice(0, 80),
        qty: String(i.qtd ?? 1).trim() || "1",
        price: parseNumber(i.valor),
      }))
      .filter((i) => i.name.length >= 2 && !/total|subtotal/i.test(i.name));
    const store = String(parsed.estabelecimento ?? "").trim();
    const total =
      parseNumber(parsed.valor_total) ||
      items.reduce((sum, it) => sum + it.price, 0) ||
      undefined;
    if (!store && !total && !items.length) {
      return { ok: false, items: [], error: "nota-ilegivel" };
    }
    return {
      ok: true,
      store: store || undefined,
      date: toIsoDate(String(parsed.data ?? "")) || undefined,
      total: total || undefined,
      items,
    };
  } catch {
    return { ok: false, items: [], error: "json-invalido" };
  }
}

/**
 * Lê QUALQUER imagem de comprovante com o Gemini (gemini-1.5-flash):
 * recebe o base64 do frontend, envia para a API com o System Prompt estrito
 * e devolve o JSON normalizado. Nunca lança — falha vira { ok: false }.
 */
export const extractReceipt = action({
  args: { image: v.string() },
  handler: async (_ctx, { image }): Promise<ReceiptResult> => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { ok: false, items: [], error: "no-gemini-key" };
    }
    const m = image.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!m) {
      return { ok: false, items: [], error: "imagem-invalida" };
    }
    const mimeType = m[1] as "image/jpeg";
    const b64 = m[2];
    try {
      const res = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [{ inline_data: { mime_type: mimeType, data: b64 } }],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          items: [],
          error: `gemini http ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
        };
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? "";
      if (!text.trim()) {
        return { ok: false, items: [], error: "resposta-vazia" };
      }
      return normalizeGemini(text);
    } catch (e) {
      return {
        ok: false,
        items: [],
        error: (e as Error).message ?? "gemini-falhou",
      };
    }
  },
});
