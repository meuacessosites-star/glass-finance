"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Leitor de Comprovantes — 100% Google Gemini (SEM QR Code, SEM OCR local).
//
// O frontend envia QUALQUER imagem (nota fiscal com/sem QR, recibo comum)
// como data URL; esta action envia o base64 direto para o endpoint
// generateContent com o System Prompt estrito, que devolve APENAS o JSON
// { estabelecimento, valor_total, data, itens: [{ qtd, produto, valor }] }.
//
// Robustez do modelo: nem todo nome de modelo está habilitado em todas as
// chaves/projetos (erro 404 "models/... is not found for API version
// v1beta"). A ordem tenta primeiro gemini-1.5-flash-latest (o nome pedido),
// depois gemini-1.5-pro, gemini-pro-vision (versões antigas) e, por último,
// os modelos 2.x mais recentes — até um responder com sucesso.
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

/**
 * Nomes de modelo tentados em ordem (404 "model not found" → tenta o
 * próximo). gemini-1.5-flash-latest primeiro (nome obrigatório da solução),
 * com fallbacks antigos (gemini-pro-vision) e modernos (2.x) para chaves
 * que não têm os 1.5 habilitados.
 */
const MODEL_CANDIDATES = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-pro-vision",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
];

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
 * Chama o generateContent com payload multimodal: o System Prompt como part
 * de texto e a imagem base64 em inline_data (mime_type + data), no MESMO
 * array de parts. Tenta os modelos candidatos em ordem; 404 de modelo pula
 * para o próximo nome. Nunca lança.
 */
async function callGemini(
  apiKey: string,
  mimeType: string,
  b64: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let lastError = "";
  for (const model of MODEL_CANDIDATES) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}` +
      `:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: SYSTEM_PROMPT },
                // snake_case no wire REST (inline_data/mime_type). O
                // camelCase (inlineData/mimeType) é só do SDK JavaScript —
                // na API REST, campos camelCase são ignorados e a imagem
                // não chega ao modelo.
                { inline_data: { mime_type: mimeType, data: b64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = `gemini http ${res.status}${
          body ? `: ${body.slice(0, 160)}` : ""
        }`;
        // 404 = modelo não encontrado/habilitado → tenta o próximo nome.
        if (res.status === 404) continue;
        return { ok: false, error: lastError };
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text =
        data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? "";
      if (!text.trim()) {
        lastError = "resposta-vazia";
        continue;
      }
      return { ok: true, text };
    } catch (e) {
      lastError = (e as Error).message ?? "gemini-falhou";
      continue;
    }
  }
  return { ok: false, error: lastError || "gemini-falhou" };
}

/**
 * Lê QUALQUER imagem de comprovante com o Gemini: recebe o base64 do
 * frontend, tenta os modelos em ordem e devolve o JSON normalizado.
 * Nunca lança — falha vira { ok: false }.
 */
export const extractReceipt = action({
  args: { image: v.string() },
  handler: async (_ctx, { image }): Promise<ReceiptResult> => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { ok: false, items: [], error: "no-gemini-key" };
    }
    // Limpeza do base64 (MUITO IMPORTANTE): o Google rejeita imagens com
    // prefixo "data:image/...;base64,". A regex remove o prefixo e captura
    // o mimeType real (jpeg/png/webp/...) da imagem enviada.
    const m = image.match(/^data:(image\/[\w.+-]+);base64,([^\s]+)$/i);
    if (!m) {
      return { ok: false, items: [], error: "imagem-invalida" };
    }
    const mimeType = m[1] as string;
    const b64 = m[2];
    const res = await callGemini(apiKey, mimeType, b64);
    if (!res.ok) {
      return { ok: false, items: [], error: res.error };
    }
    return normalizeGemini(res.text);
  },
});
